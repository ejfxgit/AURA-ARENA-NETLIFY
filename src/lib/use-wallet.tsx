"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, LogOut, Network, RefreshCw, Wallet, X } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { isAddress, recoverMessageAddress, toHex, type Hex } from "viem";
import { api, ApiError } from "./client";
import { getSupabaseBrowserClient } from "./supabase/browser";
import { walletAddressFromUser } from "./supabase/wallet-identity";
import { cn, shortHash } from "./utils";
import { fmtAura } from "./aura-economy";
import { Button } from "@/components/ui/button";
import type { DemoAccount, WalletAccountBundle, WalletProfile } from "./types";

export const XLAYER_TESTNET = {
  chainId: 1952,
  chainIdHex: "0x7a0",
  name: "X Layer Testnet",
  rpcUrl: "https://testrpc.xlayer.tech/terigon",
  explorerUrl: "https://www.okx.com/web3/explorer/xlayer-test",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
} as const;

interface Eip1193Provider {
  request<T = unknown>(args: {
    method: string;
    params?: readonly unknown[] | Record<string, unknown>;
  }): Promise<T>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
  providers?: Eip1193Provider[];
  isOkxWallet?: boolean;
  isOKExWallet?: boolean;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
    okxwallet?: Eip1193Provider;
  }
}

interface WalletContextValue {
  address: string | null;
  chainId: number | null;
  connected: boolean;
  isXLayerTestnet: boolean;
  session: Session | null;
  profile: WalletProfile | null;
  account: DemoAccount | null;
  initializing: boolean;
  ready: boolean;
  connecting: boolean;
  switching: boolean;
  creatingProfile: boolean;
  error: string | null;
  connect: () => Promise<boolean>;
  switchNetwork: () => Promise<boolean>;
  disconnect: () => Promise<void>;
  openConnect: () => void;
  closeConnect: () => void;
  enterArena: (target?: string) => void;
  createProfile: (displayName: string) => Promise<boolean>;
  refreshAccount: () => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

function resolveProvider(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  const injected = window.ethereum;
  const providers = [window.okxwallet, ...(injected?.providers ?? []), injected].filter(
    (provider): provider is Eip1193Provider => Boolean(provider),
  );
  return providers.find((provider) => provider.isOkxWallet || provider.isOKExWallet) ?? providers[0] ?? null;
}

function parseChainId(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = value.startsWith("0x") ? Number.parseInt(value, 16) : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function bundleMatchesIdentity(
  bundle: WalletAccountBundle,
  activeSession: Session,
  activeAddress: string,
): boolean {
  const normalizedAddress = activeAddress.toLowerCase();
  const sessionAddress = walletAddressFromUser(activeSession.user);
  if (sessionAddress !== normalizedAddress) return false;
  if (bundle.profile && (
    bundle.profile.id !== activeSession.user.id
    || bundle.profile.walletAddress.toLowerCase() !== normalizedAddress
  )) return false;
  if (bundle.account && bundle.account.userId !== activeSession.user.id) return false;
  return true;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const providerRef = useRef<Eip1193Provider | null>(null);
  const addressRef = useRef<string | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const connectingRef = useRef(false);
  const switchingRef = useRef(false);
  const creatingProfileRef = useRef(false);
  const disconnectingRef = useRef(false);
  const disconnectVersionRef = useRef(0);
  const arenaIntent = useRef<string | boolean>(false);
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<WalletProfile | null>(null);
  const [account, setAccount] = useState<DemoAccount | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [creatingProfile, setCreatingProfile] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isXLayerTestnet = chainId === XLAYER_TESTNET.chainId;
  const ready = Boolean(
    address
    && isXLayerTestnet
    && session
    && profile
    && account
    && bundleMatchesIdentity({ profile, account }, session, address),
  );

  const clearAccount = useCallback(() => {
    sessionRef.current = null;
    setSession(null);
    setProfile(null);
    setAccount(null);
  }, []);

  const applyBundle = useCallback((bundle: WalletAccountBundle, activeSession: Session, activeAddress: string) => {
    if (!bundleMatchesIdentity(bundle, activeSession, activeAddress)) {
      throw new Error("Wallet account does not match the authenticated wallet session");
    }
    setProfile(bundle.profile);
    setAccount(bundle.account);
  }, []);

  const loadAccount = useCallback(async (activeSession: Session, activeAddress: string) => {
    let result: WalletAccountBundle & { walletAddress: string };
    try {
      result = await api<WalletAccountBundle & { walletAddress: string }>("/api/wallet/account", {
        headers: { Authorization: `Bearer ${activeSession.access_token}` },
      });
    } catch (accountError) {
      if (accountError instanceof ApiError && (accountError.status === 401 || accountError.status === 403)) {
        await supabase?.auth.signOut();
        clearAccount();
      }
      throw accountError;
    }
    if (result.walletAddress.toLowerCase() !== activeAddress.toLowerCase()) {
      await supabase?.auth.signOut();
      clearAccount();
      throw new Error("Connected wallet does not match the authenticated wallet session");
    }
    try {
      applyBundle(result, activeSession, activeAddress);
    } catch (identityError) {
      await supabase?.auth.signOut();
      clearAccount();
      throw identityError;
    }
    return result;
  }, [applyBundle, clearAccount, supabase]);

  const authenticate = useCallback(async (provider: Eip1193Provider, activeAddress: string) => {
    if (!supabase) throw new Error("Supabase wallet accounts are not configured");
    if (!isAddress(activeAddress)) throw new Error("The wallet returned an invalid account");
    const walletAddress = activeAddress.toLowerCase();
    const challenge = await api<{ walletAddress: string; message: string }>("/api/challenges", {
      method: "POST",
      body: {
        action: "wallet-auth-challenge",
        walletAddress,
        chainId: XLAYER_TESTNET.chainId,
      },
    });
    if (challenge.walletAddress !== walletAddress) throw new Error("Wallet challenge address mismatch");
    const signature = await provider.request<Hex>({
      method: "personal_sign",
      params: [toHex(challenge.message), activeAddress],
    });
    const recoveredAddress = await recoverMessageAddress({ message: challenge.message, signature });
    if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      throw new Error("Wallet signature could not be verified for the connected account");
    }

    const verified = await api<{ session: Session; walletAddress: string }>("/api/challenges", {
      method: "POST",
      body: {
        action: "wallet-auth-verify",
        walletAddress,
        message: challenge.message,
        signature,
      },
    });
    if (verified.walletAddress !== walletAddress) throw new Error("Verified wallet address mismatch");
    const { data, error: sessionError } = await supabase.auth.setSession({
      access_token: verified.session.access_token,
      refresh_token: verified.session.refresh_token,
    });
    if (sessionError || !data.session) throw new Error(sessionError?.message || "Unable to save wallet session");
    const sessionAddress = walletAddressFromUser(data.session.user);
    if (sessionAddress !== walletAddress.toLowerCase()) {
      await supabase.auth.signOut();
      throw new Error("Supabase session does not match the connected wallet");
    }
    sessionRef.current = data.session;
    setSession(data.session);
    return loadAccount(data.session, activeAddress);
  }, [loadAccount, supabase]);

  const connect = useCallback(async () => {
    if (connectingRef.current) return false;
    connectingRef.current = true;
    const provider = providerRef.current ?? resolveProvider();
    providerRef.current = provider;
    setModalOpen(true);
    setError(null);
    if (!provider) {
      setError("No EVM wallet detected. Install or enable OKX Wallet, then try again.");
      connectingRef.current = false;
      return false;
    }
    setConnecting(true);
    try {
      const accounts = await provider.request<string[]>({ method: "eth_requestAccounts" });
      const activeAddress = accounts?.[0] ?? null;
      const activeChain = parseChainId(await provider.request({ method: "eth_chainId" }));
      setAddress(activeAddress);
      setChainId(activeChain);
      if (!activeAddress) throw new Error("The wallet did not return an account");
      if (activeChain !== XLAYER_TESTNET.chainId) return false;

      const bundle = await authenticate(provider, activeAddress);
      if (!bundle.profile || !bundle.account) return true;
      return true;
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "Unable to connect wallet");
      return false;
    } finally {
      setConnecting(false);
      connectingRef.current = false;
    }
  }, [authenticate]);

  const switchNetwork = useCallback(async () => {
    if (switchingRef.current) return false;
    switchingRef.current = true;
    const provider = providerRef.current ?? resolveProvider();
    providerRef.current = provider;
    setModalOpen(true);
    setError(null);
    if (!provider) {
      setError("No EVM wallet detected. Install or enable OKX Wallet, then try again.");
      switchingRef.current = false;
      return false;
    }
    setSwitching(true);
    try {
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: XLAYER_TESTNET.chainIdHex }],
        });
      } catch (switchError) {
        const code = (switchError as { code?: number }).code;
        if (code !== 4902) throw switchError;
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: XLAYER_TESTNET.chainIdHex,
            chainName: XLAYER_TESTNET.name,
            nativeCurrency: XLAYER_TESTNET.nativeCurrency,
            rpcUrls: [XLAYER_TESTNET.rpcUrl],
            blockExplorerUrls: [XLAYER_TESTNET.explorerUrl],
          }],
        });
      }
      setChainId(XLAYER_TESTNET.chainId);
      return await connect();
    } catch (switchError) {
      setError(switchError instanceof Error ? switchError.message : "Unable to switch network");
      return false;
    } finally {
      setSwitching(false);
      switchingRef.current = false;
    }
  }, [connect]);

  const createProfile = useCallback(async (displayName: string) => {
    if (creatingProfileRef.current) return false;
    if (!session || !address) {
      setError("Connect and authenticate your wallet first");
      return false;
    }
    creatingProfileRef.current = true;
    setCreatingProfile(true);
    setError(null);
    const activeSession = session;
    const activeAddress = address;
    try {
      const result = await api<WalletAccountBundle & { walletAddress: string }>("/api/wallet/account", {
        method: "POST",
        headers: { Authorization: `Bearer ${activeSession.access_token}` },
        body: { walletAddress: activeAddress, displayName },
      });
      if (
        addressRef.current?.toLowerCase() !== activeAddress.toLowerCase()
        || sessionRef.current?.user.id !== activeSession.user.id
        || result.walletAddress.toLowerCase() !== activeAddress.toLowerCase()
        || !result.profile
        || !result.account
      ) {
        await supabase?.auth.signOut();
        clearAccount();
        throw new Error("Wallet account changed while onboarding was in progress");
      }
      applyBundle(result, activeSession, activeAddress);
      return true;
    } catch (profileError) {
      setError(profileError instanceof Error ? profileError.message : "Unable to create account");
      return false;
    } finally {
      setCreatingProfile(false);
      creatingProfileRef.current = false;
    }
  }, [address, applyBundle, clearAccount, session, supabase]);

  const refreshAccount = useCallback(async () => {
    if (!session || !address) return;
    try {
      await loadAccount(session, address);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Unable to refresh account");
    }
  }, [address, loadAccount, session]);

  const disconnect = useCallback(async () => {
    if (disconnectingRef.current) return;
    disconnectingRef.current = true;
    disconnectVersionRef.current += 1;
    clearAccount();
    addressRef.current = null;
    setAddress(null);
    setChainId(null);
    setError(null);
    setModalOpen(false);
    arenaIntent.current = false;
    router.replace("/");
    if (!supabase) {
      disconnectingRef.current = false;
      return;
    }

    void supabase.auth.signOut()
      .catch(() => undefined)
      .finally(() => {
        disconnectingRef.current = false;
      });
  }, [clearAccount, router, supabase]);

  const enterArena = useCallback((target?: string) => {
    if (ready && modalOpen) {
      // Wallet flow already finished: "Enter AURA" was clicked. Honour a
      // pending target recorded when the flow started (e.g. the landing-page
      // Create Agent entry) instead of always landing on the overview.
      const destination = target
        || (typeof arenaIntent.current === "string" ? arenaIntent.current : "/arena");
      setModalOpen(false);
      arenaIntent.current = false;
      router.replace(destination);
      return;
    }
    if (ready && target) {
      // Already authenticated: go straight to the requested workspace target
      // without reopening the wallet popup.
      router.replace(target);
      return;
    }
    arenaIntent.current = target || true;
    setModalOpen(true);
  }, [modalOpen, ready, router]);

  const openConnect = useCallback(() => {
    setModalOpen(true);
  }, []);
  const closeConnect = useCallback(() => {
    setModalOpen(false);
    arenaIntent.current = false;
  }, []);

  useEffect(() => {
    addressRef.current = address;
  }, [address]);

  useEffect(() => {
    const provider = resolveProvider();
    providerRef.current = provider;
    if (!provider) {
      setInitializing(false);
      return;
    }

    const handleAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      const nextAddress = accounts?.[0] ?? null;
      if (nextAddress?.toLowerCase() === addressRef.current?.toLowerCase()) return;
      void supabase?.auth.signOut();
      clearAccount();
      setAddress(nextAddress);
      setModalOpen(Boolean(nextAddress));
      if (!nextAddress) router.replace("/");
    };
    const handleChainChanged = (...args: unknown[]) => {
      const nextChain = parseChainId(args[0]);
      setChainId(nextChain);
      if (nextChain !== XLAYER_TESTNET.chainId) setModalOpen(true);
    };

    provider.on?.("accountsChanged", handleAccountsChanged);
    provider.on?.("chainChanged", handleChainChanged);

    const restoreVersion = disconnectVersionRef.current;
    Promise.all([
      provider.request<string[]>({ method: "eth_accounts" }).catch(() => []),
      provider.request({ method: "eth_chainId" }).catch(() => null),
      supabase?.auth.getSession() ?? Promise.resolve({ data: { session: null } }),
    ]).then(async ([accounts, chainValue, sessionResult]) => {
      try {
        if (restoreVersion !== disconnectVersionRef.current) return;
        const activeAddress = accounts?.[0] ?? null;
        const activeChain = parseChainId(chainValue);
        const restoredSession = sessionResult.data.session;
        const activeSession = restoredSession
          && walletAddressFromUser(restoredSession.user) === activeAddress?.toLowerCase()
          ? restoredSession
          : null;
        if (restoredSession && !activeSession) await supabase?.auth.signOut();
        setAddress(activeAddress);
        setChainId(activeChain);
        sessionRef.current = activeSession;
        setSession(activeSession);
        if (activeAddress && activeChain === XLAYER_TESTNET.chainId && activeSession) {
          try {
            await loadAccount(activeSession, activeAddress);
          } catch (initialError) {
            setError(initialError instanceof Error ? initialError.message : "Unable to restore wallet account");
          }
        }
      } finally {
        setInitializing(false);
      }
    });

    return () => {
      provider.removeListener?.("accountsChanged", handleAccountsChanged);
      provider.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [clearAccount, loadAccount, router, supabase]);

  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      sessionRef.current = nextSession;
      setSession(nextSession);
      if (!nextSession) {
        setProfile(null);
        setAccount(null);
      } else if (
        addressRef.current
        && walletAddressFromUser(nextSession.user) !== addressRef.current.toLowerCase()
      ) {
        setProfile(null);
        setAccount(null);
      }
    });
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  const value = useMemo<WalletContextValue>(() => ({
    address,
    chainId,
    connected: Boolean(address),
    isXLayerTestnet,
    session,
    profile,
    account,
    initializing,
    ready,
    connecting,
    switching,
    creatingProfile,
    error,
    connect,
    switchNetwork,
    disconnect,
    openConnect,
    closeConnect,
    enterArena,
    createProfile,
    refreshAccount,
  }), [
    account,
    address,
    chainId,
    connect,
    connecting,
    createProfile,
    creatingProfile,
    disconnect,
    enterArena,
    error,
    isXLayerTestnet,
    initializing,
    openConnect,
    profile,
    ready,
    refreshAccount,
    session,
    closeConnect,
    switchNetwork,
    switching,
  ]);

  return (
    <WalletContext.Provider value={value}>
      {children}
      {modalOpen && <WalletModal wallet={value} configured={Boolean(supabase)} />}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used within WalletProvider");
  return context;
}

function WalletModal({ wallet, configured }: { wallet: WalletContextValue; configured: boolean }) {
  const [displayName, setDisplayName] = useState("");
  const [realModeOpen, setRealModeOpen] = useState(false);
  const needsNetwork = wallet.connected && !wallet.isXLayerTestnet;
  const needsAuthentication = wallet.connected && wallet.isXLayerTestnet && !wallet.session;
  const needsOnboarding = wallet.connected && wallet.isXLayerTestnet && wallet.session && (!wallet.profile || !wallet.account);

  return (
    <div className="fixed inset-0 z-[220] grid items-start justify-center overflow-x-hidden overflow-y-auto bg-black/70 px-4 py-10 backdrop-blur-sm sm:py-16">
      <div className="my-auto w-[calc(100vw-2rem)] min-w-0 max-w-md rounded-lg border border-white/[0.1] bg-[#090c16] shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-white/[0.07] px-5 py-4 sm:px-6">
          <div><div className="section-kicker">X LAYER TESTNET</div><h2 className="mt-1 font-display text-lg font-bold">AURA wallet account</h2></div>
          <button type="button" title="Close" aria-label="Close" onClick={wallet.closeConnect} className="focus-ring grid h-8 w-8 place-items-center rounded-lg border border-white/[0.08] text-white/45 hover:text-white"><X size={16} /></button>
        </div>
        <div className="space-y-4 p-5 sm:p-6">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Status label="Wallet" active={wallet.connected} value={wallet.connected ? shortHash(wallet.address, 5) : "Disconnected"} />
            <Status label="Network" active={wallet.isXLayerTestnet} value={wallet.isXLayerTestnet ? "X Layer Testnet" : wallet.chainId ? `Chain ${wallet.chainId}` : "Not detected"} />
          </div>

          {wallet.error && <div className="flex min-w-0 items-start gap-2 rounded-lg border border-aura-wait/25 bg-aura-wait/10 px-3 py-2.5 text-xs leading-5 text-aura-wait"><AlertCircle size={14} className="mt-0.5 shrink-0" /><span className="min-w-0 break-words">{wallet.error}</span></div>}
          {!configured && <div className="flex min-w-0 items-start gap-2 rounded-lg border border-aura-wait/25 bg-aura-wait/10 px-3 py-2.5 text-xs leading-5 text-aura-wait"><AlertCircle size={14} className="mt-0.5 shrink-0" /><span className="min-w-0 break-words">Supabase wallet accounts are not configured for this deployment.</span></div>}

          {!wallet.connected && (
            <><p className="text-sm leading-6 text-white/50">Connect your own OKX-compatible EVM wallet. AURA never receives or stores private keys.</p><Button className="w-full" disabled={wallet.connecting} onClick={() => void wallet.connect()}>{wallet.connecting ? <><RefreshCw size={15} className="animate-spin" /> Connecting...</> : <><Wallet size={15} /> Connect Wallet</>}</Button></>
          )}

          {needsNetwork && (
            <><p className="text-sm leading-6 text-white/50">AURA Arena requires the official X Layer Testnet network for this milestone.</p><div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3 text-xs text-white/45"><div>Chain ID: <span className="mono text-white/75">1952</span></div><div className="mt-1 break-all">RPC: {XLAYER_TESTNET.rpcUrl}</div></div><Button className="w-full" disabled={wallet.switching} onClick={() => void wallet.switchNetwork()}>{wallet.switching ? <><RefreshCw size={15} className="animate-spin" /> Switching...</> : <><Network size={15} /> Switch to X Layer Testnet</>}</Button></>
          )}

          {needsAuthentication && (
            <><p className="text-sm leading-6 text-white/50">Sign the AURA login message to create a Supabase session for this wallet. This does not submit a transaction or spend OKB.</p><Button className="w-full" disabled={wallet.connecting || !configured} onClick={() => void wallet.connect()}>{wallet.connecting ? <><RefreshCw size={15} className="animate-spin" /> Waiting for signature...</> : <><Wallet size={15} /> Sign in with wallet</>}</Button></>
          )}

          {needsOnboarding && (
            <><div><div className="terminal-label">First-time wallet</div><p className="mt-2 text-sm leading-6 text-white/50">Create the AURA profile linked to {shortHash(wallet.address, 6)}. Your account begins with virtual trading capital.</p></div><label className="grid gap-1.5 text-xs font-semibold text-white/65">Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={40} placeholder="Your arena name" className="focus-ring rounded-lg border border-white/[0.1] bg-[#070a12] px-3 py-2.5 text-sm text-white" /></label><div className="rounded-lg border border-aura-accent/20 bg-aura-accent/[0.06] p-4"><div className="mono text-2xl font-bold text-white">1,000 AURA</div><div className="terminal-label mt-1 text-aura-accent">VIRTUAL TRADING CAPITAL</div><p className="mt-2 text-xs leading-5 text-white/40">Used for simulated execution in Demo Trading. No real monetary value and no blockchain tokens are deposited.</p></div><Button className="w-full" disabled={wallet.creatingProfile || displayName.trim().length < 2} onClick={() => void wallet.createProfile(displayName.trim())}>{wallet.creatingProfile ? <><RefreshCw size={15} className="animate-spin" /> Creating account...</> : <><Check size={15} /> Create AURA account</>}</Button></>
          )}

          {wallet.ready && !realModeOpen && (
            <>
              <div className="rounded-lg border border-aura-long/20 bg-aura-long/[0.06] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-aura-long"><Check size={15} /> Connected to X Layer Testnet</div>
                <div className="mt-3 rounded-md border border-white/[0.08] bg-black/10 p-1" role="group" aria-label="Trading mode">
                  <div className="grid grid-cols-2 gap-1">
                    <button type="button" aria-pressed="true" className="focus-ring inline-flex h-8 items-center justify-center rounded-[4px] bg-aura-accent/[0.16] text-[10px] font-bold uppercase tracking-[0.14em] text-aura-accent"><span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-aura-accent" /> DEMO</button>
                    <button type="button" aria-pressed="false" onClick={() => setRealModeOpen(true)} className="focus-ring inline-flex h-8 items-center justify-center rounded-[4px] text-[10px] font-bold uppercase tracking-[0.14em] text-white/45 transition-colors hover:bg-white/[0.05] hover:text-white/80">REAL</button>
                  </div>
                </div>
                <div className="mt-4 flex items-end justify-between gap-4">
                  <div>
                    <div className="mono text-2xl font-bold text-white">{fmtAura(wallet.account?.current_balance ?? 0)}</div>
                    <div className="terminal-label mt-1 text-aura-accent">Virtual Demo Balance</div>
                  </div>
                  <div className="text-right text-xs text-white/40">{wallet.profile?.displayName}<br />{shortHash(wallet.address, 5)}</div>
                </div>
              </div>
              <Button className="w-full" onClick={() => wallet.enterArena()}>Enter AURA</Button>
              <button type="button" onClick={() => void wallet.disconnect()} className="focus-ring mx-auto flex items-center gap-1.5 rounded text-xs text-white/40 hover:text-white"><LogOut size={13} /> Disconnect AURA session</button>
            </>
          )}

          {wallet.ready && realModeOpen && (
            <div className="rounded-lg border border-aura-wait/25 bg-aura-wait/[0.055] p-5">
              <div className="section-kicker text-aura-wait">REAL MODE</div>
              <h3 className="mt-3 font-display text-xl font-bold text-white">Live trading is coming soon.</h3>
              <div className="mt-4 space-y-3 text-sm leading-6 text-white/55">
                <p>Real assets, live execution, deposits and withdrawals are being prepared for AURA on X Layer.</p>
                <p>For now, enjoy the 1,000 AURA demo experience and compete with zero real-money risk.</p>
              </div>
              <div className="mt-5 border-y border-aura-wait/20 py-3 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-aura-wait">COMING SOON</div>
              <Button className="mt-4 w-full" onClick={() => setRealModeOpen(false)}>Continue in Demo</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Status({ label, active, value }: { label: string; active: boolean; value: string }) {
  return <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3"><div className="terminal-label">{label}</div><div className={cn("mt-1 flex items-center gap-1.5 truncate text-xs font-semibold", active ? "text-aura-long" : "text-white/45")}><span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", active ? "bg-aura-long" : "bg-white/20")} />{value}</div></div>;
}
