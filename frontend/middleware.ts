import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Whole-app access gate (pre-submission, repo private). Nobody reaches the app
 * without the strong key (TACET_LIVE_SECRET). The check is SERVER-SIDE: this
 * middleware lets a request through only if it carries a `tacet_access` cookie
 * equal to SHA-256(secret) — a token only obtainable by POSTing the correct key
 * to /api/login (which compares timing-safely via the core gate). Fail-closed:
 * with no secret configured, nothing is reachable but the login page.
 *
 * The judge is given the key with the submission; the door stays shut for the
 * rest. /entrar (login page) + /api/login + static assets stay open.
 */

async function accessToken(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.TACET_LIVE_SECRET;
  const cookie = req.cookies.get("tacet_access")?.value;
  if (secret !== undefined && secret.length > 0 && cookie !== undefined && cookie === (await accessToken(secret))) {
    return NextResponse.next();
  }
  // Behind nginx/Cloudflare, req.nextUrl.host can be the internal upstream bind
  // (e.g. localhost:5275). Rebuild the redirect from the forwarded Host/proto so
  // the browser is sent to the public origin, not the upstream.
  const host = req.headers.get("host") ?? req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  return NextResponse.redirect(`${proto}://${host}/entrar`);
}

export const config = {
  // Gate everything except the login page, the login/logout endpoints, and assets.
  matcher: ["/((?!entrar|api/login|api/logout|_next/static|_next/image|favicon.ico).*)"],
};
