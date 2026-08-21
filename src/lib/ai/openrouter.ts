import { serverConfig, hasOpenRouter } from "../config";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

/** Distinguishable so callers and the UI can tell the two failures apart. */
export type AiFailureKind = "AI_UNAVAILABLE" | "INVALID_AI_RESPONSE";

export class AiError extends Error {
  constructor(readonly kind: AiFailureKind, message: string) {
    super(message);
    this.name = "AiError";
  }
}

/** The model a decision was actually produced by, for the persisted record. */
export function openRouterModel(): string {
  return serverConfig.openrouterModel;
}

interface ChatOptions {
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

async function post(messages: ChatMessage[], opts: ChatOptions): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 12000);
  try {
    return await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serverConfig.openrouterKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://auraarenaokx.netlify.app",
        "X-Title": "AURA Arena",
      },
      body: JSON.stringify({
        model: serverConfig.openrouterModel,
        messages,
        max_tokens: opts.maxTokens ?? 500,
        temperature: opts.temperature ?? 0.7,
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Calls OpenRouter and throws AiError on any failure.
 *
 * This is the entry point for anything that DECIDES something. A decision that
 * could not be obtained has to surface as an error state, so there is
 * deliberately no null return and no fallback here: a caller cannot accidentally
 * carry on without a real model response.
 */
export async function chatOrThrow(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  if (!hasOpenRouter()) {
    throw new AiError("AI_UNAVAILABLE", "AI analysis is not configured. Set OPENROUTER_API_KEY.");
  }

  let res: Response;
  try {
    res = await post(messages, opts);
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    throw new AiError(
      "AI_UNAVAILABLE",
      timedOut
        ? `The AI model did not respond within ${(opts.timeoutMs ?? 12000) / 1000}s.`
        : "The AI model could not be reached.",
    );
  }

  if (!res.ok) {
    // OpenRouter's own error text is safe to surface: it never echoes the request
    // body or the key.
    const detail = await res.text().catch(() => "");
    let message = `The AI model rejected the request (HTTP ${res.status}).`;
    try {
      const parsed = JSON.parse(detail) as { error?: { message?: string } };
      if (parsed.error?.message) message = `${message} ${parsed.error.message}`;
    } catch {
      /* non-JSON body: the status alone is the useful signal */
    }
    console.error(`[openrouter] ${res.status} from ${serverConfig.openrouterModel}`, detail.slice(0, 400));
    throw new AiError("AI_UNAVAILABLE", message);
  }

  const data = (await res.json().catch(() => null)) as
    | { choices?: Array<{ message?: { content?: string } }> }
    | null;
  const content = data?.choices?.[0]?.message?.content;
  if (!content || content.trim().length === 0) {
    throw new AiError("INVALID_AI_RESPONSE", "The AI model returned an empty response.");
  }
  return content;
}

// Thin OpenRouter client for NARRATION only — prose that restates numbers already
// computed elsewhere. Returns null on any failure so those callers can fall back
// to their own wording.
//
// Never use this for a decision: direction, confidence and reasoning must come
// from chatOrThrow so a failure cannot become a fabricated verdict.
export async function chat(
  messages: ChatMessage[],
  opts?: { json?: boolean; maxTokens?: number; temperature?: number },
): Promise<string | null> {
  if (!hasOpenRouter()) return null;
  try {
    const res = await post(messages, opts ?? {});
    if (!res.ok) return null;
    const data = await res.json();
    const content: string | undefined = data?.choices?.[0]?.message?.content;
    return content ?? null;
  } catch {
    return null;
  }
}

// Extract a JSON object from a possibly-noisy LLM string. Validates via parse.
export function extractJson<T>(text: string | null): T | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

