import { NextResponse } from "next/server";
import {
  guardLive,
  liveSecretFromEnv,
  extractSecret,
  SlidingWindowRateLimiter,
} from "../../../../src/live/gate";

// node:crypto (timingSafeEqual) needs the Node runtime, not Edge.
export const runtime = "nodejs";

// One in-memory limiter per server process (E3-AUTH §2). Demo-sized caps.
const limiter = new SlidingWindowRateLimiter({ windowMs: 3_600_000, perKeyMax: 20, globalMax: 200 });

/**
 * The single LLM-spending endpoint. The E3-AUTH gate runs BEFORE any work:
 * 503 if no TACET_LIVE_SECRET is configured (fail-closed), 401 on a wrong/absent
 * secret, 429 past the rate limit — and zero downstream work on every blocked
 * path. The live pipeline itself (step 0 → harvest → readers → map) is not wired
 * yet, so a passing request gets an honest 501 rather than a fabricated result.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const body: { secret?: unknown } = await req.json().catch(() => ({}));
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const headers: Record<string, string | undefined> = {
    "x-tacet-secret": req.headers.get("x-tacet-secret") ?? undefined,
  };

  const decision = guardLive({
    expectedSecret: liveSecretFromEnv(),
    providedSecret: extractSecret({ headers, body }),
    ip,
    now: Date.now(),
    limiter,
  });

  if (!decision.allow) {
    const res = NextResponse.json({ error: decision.reason }, { status: decision.status });
    if (decision.status === 429) res.headers.set("Retry-After", String(decision.retryAfter));
    return res;
  }

  // E3 TODO: gate passed — run the live pipeline here. Never fabricate a result.
  return NextResponse.json(
    { error: "live pipeline not implemented yet (E3); replay the frozen cases offline" },
    { status: 501 },
  );
}
