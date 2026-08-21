import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { WalletProvider } from "@/lib/use-wallet";

export const metadata: Metadata = {
  title: "AURA Arena — Challenge the machine.",
  description:
    "A human-vs-AI market intelligence arena where evidence changes AI conviction, real market data settles demo battles, and confirmed results can be anchored on X Layer.",
  openGraph: {
    title: "AURA Arena",
    description: "Challenge the thesis. Battle the market. Prove the result.",
    type: "website",
  },
  icons: {
    icon: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans antialiased">
        <WalletProvider>
          <AppShell>{children}</AppShell>
        </WalletProvider>
      </body>
    </html>
  );
}
