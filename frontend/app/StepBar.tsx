import Link from "next/link";
import { c, font, STEPS } from "./tokens";

/** The step bar across the inner screens. Literal-ish port of the design's step
 * bar: numbered pills (passo 0 → … → narrativa) with the current one filled. */
export function StepBar({ current }: { current: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginTop: 18, flexWrap: "wrap" }}>
      {STEPS.map((s, i) => {
        const active = s.key === current;
        return (
          <span key={s.key} style={{ display: "inline-flex", alignItems: "center" }}>
            <Link
              href={`/caso/freud/${s.key}`}
              style={{
                display: "inline-flex", alignItems: "center", gap: 7, textDecoration: "none",
                background: active ? c.green : "transparent", color: active ? "#fff" : c.m1,
                border: `1px solid ${active ? c.green : c.border}`, borderRadius: 3, padding: "6px 11px",
              }}
            >
              <span
                style={{
                  fontFamily: font.mono, fontSize: 10, width: 16, height: 16, borderRadius: "50%",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  background: active ? "rgba(255,255,255,0.18)" : c.panel, color: active ? "#fff" : c.m4,
                }}
              >
                {i + 1}
              </span>
              <span style={{ fontSize: 12, fontWeight: 500 }}>{s.label}</span>
            </Link>
            {i < STEPS.length - 1 && <span style={{ width: 18, height: 1, background: c.rule }} />}
          </span>
        );
      })}
    </div>
  );
}
