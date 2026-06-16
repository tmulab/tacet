import Link from "next/link";
import { c, font } from "./tokens";
import { DOORS } from "./cases";

/** SCREEN 0 — HOME. Tagline + four worked-case doors. */
export default function Home() {
  return (
    <div>
      {/* tagline */}
      <div style={{ marginTop: 40, maxWidth: 760 }}>
        <div style={{ fontFamily: font.serif, fontStyle: "italic", fontSize: 19, lineHeight: 1.5, color: c.m1, textWrap: "pretty" }}>
          two undecided readers, one body of evidence, and the map between them — where they converge is the{" "}
          <span style={{ color: c.coreText, fontStyle: "normal" }}>robust core</span>, where they diverge is the{" "}
          <span style={{ color: c.cruxText, fontStyle: "normal" }}>live crux</span>, what nobody covered is the{" "}
          <span style={{ color: c.chair, fontStyle: "normal" }}>empty chair</span>.
        </div>
      </div>

      {/* divider to doors */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 34 }}>
        <span style={{ height: 1, background: c.rule, flex: 1 }} />
        <span style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: "0.06em", color: c.m4, whiteSpace: "nowrap" }}>
          see the method in four worlds already run · offline · instant
        </span>
        <span style={{ height: 1, background: c.rule, flex: 1 }} />
      </div>

      {/* four doors */}
      <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 13 }}>
        {DOORS.map((d) => (
          <Link
            key={d.id}
            href={`/caso/${d.id}`}
            style={{
              textAlign: "left", textDecoration: "none", background: c.card, border: `1px solid ${c.border}`,
              borderRadius: 4, padding: "15px 15px 17px", cursor: "pointer", display: "block",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span
                style={{
                  fontFamily: font.mono, fontSize: 10, letterSpacing: "0.08em", color: d.badgeColor,
                  border: `1px solid ${d.badgeColor}55`, borderRadius: 2, padding: "2px 6px",
                }}
              >
                {d.badge}
              </span>
              {d.star && <span style={{ fontFamily: font.mono, fontSize: 9.5, color: c.green, letterSpacing: "0.06em" }}>★ overall proof</span>}
            </div>
            <div style={{ fontFamily: font.serif, fontSize: 18, color: "#26231e", marginTop: 12, lineHeight: 1.3, textWrap: "pretty" }}>
              {d.doorTitle}
            </div>
            <div style={{ fontSize: 11.5, color: c.m3, lineHeight: 1.4, marginTop: 7 }}>{d.doorSub}</div>
            <div style={{ fontFamily: font.mono, fontSize: 10, color: c.green, marginTop: 13 }}>walk through →</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
