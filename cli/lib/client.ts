// cli/lib/client.ts — the fail-soft bus client over schema §4.
//
// Every method returns a Result object: { ok: true, ...data } | { ok: false, error }.
// NOTHING here ever throws. A bus that is down, slow, or returning a bad status
// resolves to { ok: false } so the cockpit can render a local-cache view + a
// one-line warning instead of a stack trace.

import type {
  Contract,
  ContractVersion,
  Delta,
  LedgerEntry,
  Session,
  Event,
} from "../../server/store.ts";

export type Ok<T> = { ok: true } & T;
export type Err = { ok: false; error: string; status?: number };
export type Result<T> = Ok<T> | Err;

export type VersionData = { registry_version: number };
export type RegistryData = { registry_version: number; contracts: Contract[] };
export type DeltasData = { deltas: Delta[] };
export type SessionsData = { sessions: Session[] };
export type AdvisoriesData = { advisories: unknown[] };
export type DecideData = { ledger_id: number; registry_version: number };
export type EventsData = { events: Event[] };
export type LedgerData = { ledger: LedgerEntry[] };
export type ContractVersionsData = { contract: Contract | null; versions: ContractVersion[] };
export type HealthData = { ok: true };
export type PatchData = { ok: boolean; registry_version: number };
export type EditData = { ok: boolean; registry_version: number; delta?: Delta };

const DEFAULT_TIMEOUT_MS = 2000;

export class BusClient {
  readonly url: string;
  private timeoutMs: number;
  /** Cloud-mode bearer token. Empty = self-hosted (no Authorization header). */
  private token: string;

  constructor(busUrl: string, opts: { timeoutMs?: number; token?: string } = {}) {
    this.url = busUrl.replace(/\/$/, "");
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.token = opts.token ?? "";
  }

  /** Authorization header iff a token is present; spread into every request. */
  private authHeaders(): Record<string, string> {
    return this.token ? { Authorization: `Bearer ${this.token}` } : {};
  }

  // ---- low-level fetch wrappers (never throw) ----

  private async req<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Result<T>> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.url}${path}`, {
        method,
        headers: {
          ...(body != null ? { "Content-Type": "application/json" } : {}),
          ...this.authHeaders(),
        },
        body: body != null ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      if (!res.ok) {
        return { ok: false, error: `bus returned ${res.status}`, status: res.status };
      }
      const data = (await res.json()) as Record<string, unknown>;
      return { ok: true, ...(data as T) };
    } catch (err) {
      return { ok: false, error: errMsg(err) };
    } finally {
      clearTimeout(timer);
    }
  }

  // ---- schema §4 endpoints ----

  version(): Promise<Result<VersionData>> {
    return this.req<VersionData>("GET", "/version");
  }

  health(): Promise<Result<HealthData>> {
    return this.req<HealthData>("GET", "/healthz");
  }

  registry(): Promise<Result<RegistryData>> {
    return this.req<RegistryData>("GET", "/registry");
  }

  deltas(since: number): Promise<Result<DeltasData>> {
    return this.req<DeltasData>("GET", `/deltas?since=${encodeURIComponent(since)}`);
  }

  advisories(sessionId: string): Promise<Result<AdvisoriesData>> {
    return this.req<AdvisoriesData>(
      "GET",
      `/sessions/${encodeURIComponent(sessionId)}/advisories`,
    );
  }

  /** GET /sessions — the live roster (read-only). */
  sessions(): Promise<Result<SessionsData>> {
    return this.req<SessionsData>("GET", "/sessions");
  }

  /** GET /ledger — the decision history (newest first). */
  ledger(): Promise<Result<LedgerData>> {
    return this.req<LedgerData>("GET", "/ledger");
  }

  /** GET /contracts/:id/versions — one contract's version history. */
  contractVersions(id: string): Promise<Result<ContractVersionsData>> {
    return this.req<ContractVersionsData>(
      "GET",
      `/contracts/${encodeURIComponent(id)}/versions`,
    );
  }

  decide(author: string, description: string, contract?: string): Promise<Result<DecideData>> {
    return this.req<DecideData>("POST", "/decide", { author, description, contract });
  }

  /** Append an edit.streamed (or any) event (POST /events). */
  events(payload: Record<string, unknown>): Promise<Result<EditData>> {
    return this.req<EditData>("POST", "/events", payload);
  }

  /** GET /events?since=N — the raw bus log (for `datum watch` backfill). */
  eventsSince(since: number): Promise<Result<EventsData>> {
    return this.req<EventsData>("GET", `/events?since=${encodeURIComponent(since)}`);
  }

  patchSession(id: string, patch: Record<string, unknown>): Promise<Result<PatchData>> {
    return this.req<PatchData>("PATCH", `/sessions/${encodeURIComponent(id)}`, patch);
  }

  joinSession(body: Record<string, unknown>): Promise<Result<Record<string, unknown>>> {
    return this.req<Record<string, unknown>>("POST", "/sessions", body);
  }

  /**
   * SSE tail. Calls onEvent for each parsed Event frame. Returns a stop()
   * function. Never throws — connection errors invoke onError (if given) and
   * stop the stream. Uses fetch's streaming body (Node 22+).
   */
  async stream(
    onEvent: (ev: Event) => void,
    opts: { onError?: (e: string) => void; signal?: AbortSignal } = {},
  ): Promise<() => void> {
    const ctrl = new AbortController();
    const signal = opts.signal
      ? anySignal([opts.signal, ctrl.signal])
      : ctrl.signal;
    const stop = () => ctrl.abort();

    (async () => {
      try {
        const res = await fetch(`${this.url}/stream`, {
          headers: { Accept: "text/event-stream", ...this.authHeaders() },
          signal,
        });
        if (!res.ok || !res.body) {
          opts.onError?.(`bus returned ${res.status}`);
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          // split on SSE record boundary (blank line).
          let idx;
          while ((idx = buffer.indexOf("\n\n")) !== -1) {
            const frame = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const dataLine = frame
              .split("\n")
              .find((l) => l.startsWith("data:"));
            if (!dataLine) continue;
            const json = dataLine.slice(5).trim();
            if (!json) continue;
            try {
              onEvent(JSON.parse(json) as Event);
            } catch {
              /* skip malformed frame, fail-soft */
            }
          }
        }
      } catch (err) {
        if (!signal.aborted) opts.onError?.(errMsg(err));
      }
    })();

    return stop;
  }
}

function errMsg(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "AbortError" || err.name === "TimeoutError") return "bus unreachable (timeout)";
    return err.message;
  }
  return String(err);
}

/** Combine multiple abort signals into one (no AbortSignal.any dependency). */
function anySignal(signals: AbortSignal[]): AbortSignal {
  const ctrl = new AbortController();
  for (const s of signals) {
    if (s.aborted) {
      ctrl.abort();
      break;
    }
    s.addEventListener("abort", () => ctrl.abort(), { once: true });
  }
  return ctrl.signal;
}
