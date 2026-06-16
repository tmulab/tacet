import Link from "next/link";
import { c, font } from "./tokens";

/** The masthead — wordmark + the standing limit "certifies coherence, never
 * truth". Literal port of the design's masthead. The step bar (inner screens)
 * is a separate component added with the Step 0 → Map screens (Phase 2). */
export function Masthead() {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 24,
        flexWrap: "wrap",
        borderBottom: `1px solid ${c.rule}`,
        paddingBottom: 15,
      }}
    >
      <Link href="/" style={{ textDecoration: "none" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 13 }}>
          <span style={{ fontFamily: font.mono, fontWeight: 600, fontSize: 25, letterSpacing: "0.15em", color: c.green }}>
            TACET
          </span>
          <span style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: "0.13em", color: c.m4 }}>
            research engine · The Machine Unconscious
          </span>
        </div>
      </Link>
      <span
        style={{ fontFamily: font.mono, fontSize: 10, letterSpacing: "0.1em", color: c.m6, textAlign: "right", lineHeight: 1.6 }}
      >
        certifies coherence,
        <br />
        never truth
      </span>
    </div>
  );
}
