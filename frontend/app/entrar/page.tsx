"use client";

import { useState, type FormEvent } from "react";
import { c, font, signals } from "../tokens";

/** Access gate page. The whole app sits behind the strong key until submission;
 * this is the only door. The check is server-side (/api/login + middleware) —
 * this form is just the knock. */
export default function Entrar() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const r = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    if (r.ok) {
      window.location.href = "/";
      return;
    }
    setBusy(false);
    const j: { error?: string } = await r.json().catch(() => ({}));
    setErr(j.error ?? "sign-in failed");
  }

  return (
    <div style={{ marginTop: 70, display: "flex", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", fontSize: 18 }}>
          <span style={{ color: signals.core.color }}>●</span>
          <span style={{ color: signals.crux.color }}>▲</span>
          <span style={{ color: signals.empty.color }}>○</span>
        </div>
        <div style={{ fontFamily: font.serif, fontStyle: "italic", fontSize: 18, color: c.m1, marginTop: 18, lineHeight: 1.5 }}>
          two undecided readers, one body of evidence, and the map between them.
        </div>

        <form onSubmit={submit} style={{ marginTop: 26, background: c.card, border: `1px solid ${c.focus}`, borderTop: `3px solid ${c.green}`, borderRadius: 4, padding: "24px 24px 22px", textAlign: "left", boxShadow: "0 2px 18px #2e5a4b14" }}>
          <label htmlFor="pw" style={{ fontFamily: font.sans, fontWeight: 600, fontSize: 14, color: c.ink }}>
            restricted access <span style={{ fontWeight: 400, color: c.m2 }}>— enter the key</span>
          </label>
          <input
            id="pw"
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoFocus
            autoComplete="current-password"
            placeholder="access key"
            style={{ width: "100%", marginTop: 11, border: `1px solid ${c.borderInput}`, borderRadius: 3, background: c.input, padding: "12px 13px", fontFamily: font.mono, fontSize: 15, color: "#26231e" }}
          />
          {err && (
            <div style={{ marginTop: 11, fontFamily: font.mono, fontSize: 11.5, color: c.chair }}>{err}</div>
          )}
          <button
            type="submit"
            disabled={busy || pw.length === 0}
            style={{ width: "100%", marginTop: 16, fontFamily: font.sans, fontWeight: 600, fontSize: 14, color: "#fff", background: c.green, border: "none", borderRadius: 3, padding: "12px 24px", cursor: busy ? "default" : "pointer", opacity: busy || pw.length === 0 ? 0.6 : 1, boxShadow: `0 1px 0 ${c.greenShadow}` }}
          >
            {busy ? "verifying…" : "sign in →"}
          </button>
        </form>

        <div style={{ fontFamily: font.mono, fontSize: 10, color: c.m5, marginTop: 16, letterSpacing: "0.04em", lineHeight: 1.6 }}>
          the key is verified on the server · certifies coherence, never truth
        </div>
      </div>
    </div>
  );
}
