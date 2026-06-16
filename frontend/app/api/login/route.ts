import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { secretMatches, liveSecretFromEnv } from "../../../../src/live/gate";

export const runtime = "nodejs";

/**
 * Login: validate the strong key SERVER-SIDE (timing-safe, via the core gate),
 * then mint the access cookie the middleware checks. The cookie is SHA-256(secret)
 * — never the secret itself, httpOnly, secure in production. Fail-closed: with no
 * secret configured, login is unavailable (503).
 */
export async function POST(req: Request): Promise<NextResponse> {
  const secret = liveSecretFromEnv();
  if (secret === undefined) {
    return NextResponse.json({ error: "access not configured on the server" }, { status: 503 });
  }
  const body: { password?: unknown } = await req.json().catch(() => ({}));
  const provided = typeof body.password === "string" ? body.password : undefined;
  if (!secretMatches(provided, secret)) {
    return NextResponse.json({ error: "incorrect key" }, { status: 401 });
  }
  const token = createHash("sha256").update(secret, "utf8").digest("hex");
  const res = NextResponse.json({ ok: true });
  res.cookies.set("tacet_access", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12, // 12h
  });
  return res;
}
