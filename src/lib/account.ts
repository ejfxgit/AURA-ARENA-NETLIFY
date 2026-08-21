import { z } from "zod";
import { CUSTOM_AGENT_AVATAR_STYLES } from "./custom-agents";
import type {
  CustomAgentAvatarStyle,
  ProfileDraft,
  UserSettings,
  UserSettingsDraft,
} from "./types";

/**
 * Profile + workspace settings shared between the API routes and the arena UI.
 *
 * Option values deliberately reuse the existing AURA vocabularies so the
 * workspace and the custom agent builder stay in sync: avatar styles come from
 * CUSTOM_AGENT_AVATAR_STYLES, and strategy / risk / behavior reuse the same
 * enum values the agent builder already persists.
 */

/** Profile avatars reuse the existing AURA agent avatar styles. */
export const PROFILE_AVATAR_STYLES = CUSTOM_AGENT_AVATAR_STYLES;

export const TIMEZONE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "New York" },
  { value: "America/Chicago", label: "Chicago" },
  { value: "America/Los_Angeles", label: "Los Angeles" },
  { value: "America/Sao_Paulo", label: "Sao Paulo" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Berlin", label: "Berlin" },
  { value: "Europe/Istanbul", label: "Istanbul" },
  { value: "Africa/Lagos", label: "Lagos" },
  { value: "Asia/Dubai", label: "Dubai" },
  { value: "Asia/Karachi", label: "Karachi" },
  { value: "Asia/Kolkata", label: "Kolkata" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Asia/Shanghai", label: "Shanghai" },
  { value: "Asia/Tokyo", label: "Tokyo" },
  { value: "Australia/Sydney", label: "Sydney" },
];

export const LANGUAGE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "en", label: "English" },
  { value: "es", label: "Espanol" },
  { value: "pt", label: "Portugues" },
  { value: "fr", label: "Francais" },
  { value: "de", label: "Deutsch" },
  { value: "tr", label: "Turkce" },
  { value: "ar", label: "Arabic" },
  { value: "ta", label: "Tamil" },
  { value: "hi", label: "Hindi" },
  { value: "zh", label: "Chinese" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
];

export const RISK_PREFERENCES: ReadonlyArray<{ value: UserSettings["riskPreference"]; label: string; detail: string }> = [
  { value: "CONSERVATIVE", label: "Conservative", detail: "Waits for stronger conviction" },
  { value: "BALANCED", label: "Balanced", detail: "Standard decision thresholds" },
  { value: "AGGRESSIVE", label: "Aggressive", detail: "Acts on lower conviction" },
];

export const DEFAULT_STRATEGIES: ReadonlyArray<{ value: UserSettings["defaultStrategy"]; label: string }> = [
  { value: "MOMENTUM", label: "Momentum" },
  { value: "NEWS_SENTIMENT", label: "News & sentiment" },
  { value: "STATISTICAL", label: "Statistical" },
  { value: "ONCHAIN", label: "Onchain" },
  { value: "LIQUIDITY", label: "Liquidity & flow" },
  { value: "ANOMALY", label: "Anomaly" },
];

export const DECISION_BEHAVIORS: ReadonlyArray<{ value: UserSettings["decisionBehavior"]; label: string }> = [
  { value: "HIGH_CONFIDENCE", label: "Prefer high-confidence setups" },
  { value: "TRADE_FREQUENTLY", label: "Trade frequently" },
  { value: "TRADE_SELECTIVELY", label: "Trade selectively" },
  { value: "WAIT_CONFIRMATION", label: "Wait for confirmation" },
  { value: "REACT_QUICKLY", label: "React quickly to market changes" },
];

export const NOTIFICATION_TOGGLES: ReadonlyArray<{
  key: "notifyBattleResults" | "notifyBattleStarted" | "notifyAgentEvents" | "notifyPnl" | "notifySystem";
  label: string;
  detail: string;
}> = [
  { key: "notifyBattleResults", label: "Battle results", detail: "Settlement outcome when a battle finishes" },
  { key: "notifyBattleStarted", label: "Battle started", detail: "A battle you opened has gone live" },
  { key: "notifyAgentEvents", label: "Agent events", detail: "Your custom agents are created or updated" },
  { key: "notifyPnl", label: "P&L updates", detail: "Realized profit and loss changes" },
  { key: "notifySystem", label: "System announcements", detail: "Product, network and maintenance notices" },
];

/** Any IANA zone the runtime recognises is accepted, not just the curated list. */
function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine(isValidTimezone, "Not a recognised time zone");

const languageSchema = z
  .string()
  .trim()
  .regex(/^[a-z]{2}(-[A-Z]{2})?$/, "Use a language code such as en or en-US");

const avatarStyleSchema = z.enum(["PULSE", "ORBIT", "PRISM", "MONOLITH"]).nullable();

/**
 * Uploaded profile photo. Shape only: the API route additionally checks with
 * profileAvatarUrlIssue() that the URL belongs to the caller's own folder in the
 * profile-avatars bucket. An empty string clears the photo, which restores the
 * avatarStyle fallback.
 */
const avatarUrlSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z
    .string()
    .trim()
    .url("must be an uploaded image URL")
    .max(512, "URL is too long")
    .nullable(),
);

/** Shown wherever a username collision surfaces, client or server. */
export const USERNAME_TAKEN_MESSAGE = "Username taken";

/**
 * The canonical stored form of a username: trimmed, leading @ removed and
 * lower-cased, with blank treated as "no username" rather than as an error.
 *
 * Mirrors public.normalize_username() in
 * supabase/migrations/202608190001_username_unique_case_insensitive.sql. Both
 * sides normalize because both sides need the same answer: the UI compares
 * against what it typed, and the unique index on lower(username) compares
 * against what is stored. Every spelling of a name -- with or without the @, in
 * any mix of upper and lower case, with surrounding whitespace -- collapses to
 * the one value that identifies its owner.
 */
export function normalizeUsername(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/^@+/, "").trim().toLowerCase();
  return normalized === "" ? null : normalized;
}

/**
 * Shape of an already-normalized username, or null when it is acceptable.
 * Availability is deliberately not checked here: only the database can answer
 * that, and profiles_username_lower_key is what actually decides it.
 */
export function usernameFormatIssue(username: string | null): string | null {
  if (username === null) return null;
  if (username.length < 3) return "Username must be at least 3 characters";
  if (username.length > 20) return "Username must be 20 characters or fewer";
  if (!/^[a-z0-9_]+$/.test(username)) {
    return "Username may only use letters, numbers and underscores";
  }
  return null;
}

/**
 * Usernames are optional. Normalizing before validating means a value entered
 * with a leading @, in mixed case, or with stray whitespace is accepted and
 * stored in canonical form instead of being rejected, and the length limits are
 * measured against the value that actually gets stored. Non-string input falls
 * through to the string schema, which rejects it.
 */
const usernameSchema = z.preprocess(
  (value) => (typeof value === "string" ? normalizeUsername(value) : value),
  z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be 20 characters or fewer")
    .regex(/^[a-z0-9_]+$/, "Username may only use letters, numbers and underscores")
    .nullable(),
);

export const profileUpdateSchema = z.object({
  displayName: z.string().trim().min(2).max(40),
  username: usernameSchema,
  bio: z.string().trim().max(240),
  avatarStyle: avatarStyleSchema,
  avatarUrl: avatarUrlSchema,
  timezone: timezoneSchema,
  language: languageSchema,
});

export const userSettingsUpdateSchema = z.object({
  // 'REAL' exists in the database check constraint for the future execution
  // layer, but the API refuses it while real trading is not implemented.
  tradingMode: z.literal("DEMO"),
  riskPreference: z.enum(["CONSERVATIVE", "BALANCED", "AGGRESSIVE"]),
  defaultStrategy: z.enum([
    "MOMENTUM", "NEWS_SENTIMENT", "STATISTICAL", "ONCHAIN", "LIQUIDITY", "ANOMALY",
  ]),
  decisionBehavior: z.enum([
    "HIGH_CONFIDENCE", "TRADE_FREQUENTLY", "TRADE_SELECTIVELY", "WAIT_CONFIRMATION", "REACT_QUICKLY",
  ]),
  notifyBattleResults: z.boolean(),
  notifyBattleStarted: z.boolean(),
  notifyAgentEvents: z.boolean(),
  notifyPnl: z.boolean(),
  notifySystem: z.boolean(),
  timezone: timezoneSchema,
  language: languageSchema,
}).partial().refine((value) => Object.keys(value).length > 0, "No changes supplied");

const FIELD_LABELS: Record<string, string> = {
  displayName: "Display name",
  username: "Username",
  bio: "Bio",
  avatarStyle: "Avatar style",
  avatarUrl: "Profile photo",
  timezone: "Timezone",
  language: "Language",
  tradingMode: "Trading mode",
  riskPreference: "Risk preference",
  defaultStrategy: "Default strategy",
  decisionBehavior: "Decision behavior",
};

/** Names the offending field so the UI can show something actionable. */
export function accountIssueSummary(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Invalid request";
  const field = issue.path.length ? String(issue.path[0]) : "";
  const label = FIELD_LABELS[field] ?? field;
  if (!label) return issue.message;
  if (issue.code === "too_small" && issue.type === "string") {
    return `${label} must be at least ${issue.minimum} characters`;
  }
  if (issue.code === "too_big" && issue.type === "string") {
    return `${label} must be ${issue.maximum} characters or fewer`;
  }
  if (issue.code === "invalid_enum_value") {
    return `${label} does not accept "${String(issue.received)}"`;
  }
  return `${label}: ${issue.message}`;
}

export interface UserSettingsRow {
  id: string;
  user_id: string;
  trading_mode: UserSettings["tradingMode"];
  risk_preference: UserSettings["riskPreference"];
  default_strategy: UserSettings["defaultStrategy"];
  decision_behavior: UserSettings["decisionBehavior"];
  notify_battle_results: boolean;
  notify_battle_started: boolean;
  notify_agent_events: boolean;
  notify_pnl: boolean;
  notify_system: boolean;
  timezone: string;
  language: string;
  created_at: string;
  updated_at: string;
}

export function userSettingsFromRow(row: UserSettingsRow): UserSettings {
  return {
    id: row.id,
    userId: row.user_id,
    tradingMode: row.trading_mode,
    riskPreference: row.risk_preference,
    defaultStrategy: row.default_strategy,
    decisionBehavior: row.decision_behavior,
    notifyBattleResults: row.notify_battle_results,
    notifyBattleStarted: row.notify_battle_started,
    notifyAgentEvents: row.notify_agent_events,
    notifyPnl: row.notify_pnl,
    notifySystem: row.notify_system,
    timezone: row.timezone,
    language: row.language,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function userSettingsToRow(draft: Partial<UserSettingsDraft>) {
  return {
    ...(draft.tradingMode !== undefined ? { trading_mode: draft.tradingMode } : {}),
    ...(draft.riskPreference !== undefined ? { risk_preference: draft.riskPreference } : {}),
    ...(draft.defaultStrategy !== undefined ? { default_strategy: draft.defaultStrategy } : {}),
    ...(draft.decisionBehavior !== undefined ? { decision_behavior: draft.decisionBehavior } : {}),
    ...(draft.notifyBattleResults !== undefined ? { notify_battle_results: draft.notifyBattleResults } : {}),
    ...(draft.notifyBattleStarted !== undefined ? { notify_battle_started: draft.notifyBattleStarted } : {}),
    ...(draft.notifyAgentEvents !== undefined ? { notify_agent_events: draft.notifyAgentEvents } : {}),
    ...(draft.notifyPnl !== undefined ? { notify_pnl: draft.notifyPnl } : {}),
    ...(draft.notifySystem !== undefined ? { notify_system: draft.notifySystem } : {}),
    ...(draft.timezone !== undefined ? { timezone: draft.timezone } : {}),
    ...(draft.language !== undefined ? { language: draft.language } : {}),
  };
}

export function profileToRow(draft: ProfileDraft) {
  return {
    display_name: draft.displayName,
    username: draft.username,
    bio: draft.bio,
    avatar_style: draft.avatarStyle,
    avatar_url: draft.avatarUrl,
    timezone: draft.timezone,
    language: draft.language,
  };
}

export function profileAvatarAccent(avatarStyle: CustomAgentAvatarStyle | null): string {
  return PROFILE_AVATAR_STYLES.find((style) => style.value === avatarStyle)?.accent ?? "#7c5cff";
}
