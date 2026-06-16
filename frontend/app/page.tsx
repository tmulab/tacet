"use client";

import { useState } from "react";
import Link from "next/link";
import { c, font } from "./tokens";
import { DOORS } from "./cases";

/**
 * SCREEN 0 — HOME. Literal port of the design's Home: the tagline, the hero
 * question field, the honest "live · backend not connected" note (→ POST
 * /api/run), and the four worked-case doors. The inner screens (Step 0 →
 * Map → Narrative) and the case replays are Phase 2.
 */
export default function Home() {
  const [question, setQuestion] = useState("");
  const [liveNote, setLiveNote] = useState(false);

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

      {/* HERO question field */}
      <div
        style={{
          marginTop: 26,
          background: c.card,
          border: `1px solid ${c.focus}`,
          borderTop: `3px solid ${c.green}`,
          borderRadius: 4,
          padding: "26px 26px 22px",
          boxShadow: "0 2px 18px #2e5a4b14",
        }}
      >
        <label style={{ fontFamily: font.sans, fontWeight: 600, fontSize: 15, color: c.ink }}>
          ask a question <span style={{ fontWeight: 400, color: c.m2 }}>— any dispute, any field</span>
        </label>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g.: are eggs bad for the heart? · is psychoanalysis compatible with Marxism? · could the LHC create a black hole?"
          style={{
            width: "100%", marginTop: 12, minHeight: 84, resize: "vertical",
            border: `1px solid ${c.borderInput}`, borderRadius: 3, background: c.input,
            padding: "14px 15px", fontFamily: font.serif, fontSize: 21, lineHeight: 1.45, color: "#26231e",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, marginTop: 14, flexWrap: "wrap" }}>
          <button
            type="button"
            style={{
              display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 500, color: c.m1,
              background: c.panel2, border: `1px solid ${c.borderInput}`, borderRadius: 3, padding: "9px 14px", cursor: "pointer",
            }}
          >
            <span style={{ fontFamily: font.mono }}>＋</span>anchor PDF <span style={{ color: "#9a9282" }}>(optional)</span>
          </button>
          <button
            type="button"
            onClick={() => setLiveNote(true)}
            style={{
              fontFamily: font.sans, fontWeight: 600, fontSize: 14, color: "#fff", background: c.green,
              border: "none", borderRadius: 3, padding: "12px 24px", cursor: "pointer", boxShadow: `0 1px 0 ${c.greenShadow}`,
            }}
          >
            run the method →
          </button>
        </div>
        <div style={{ fontFamily: font.mono, fontSize: 10.5, color: "#9a9282", marginTop: 13, letterSpacing: "0.02em" }}>
          live mode — step 0 → harvest → two readers → map → empty chair → honest narrative
        </div>

        {/* honest live note */}
        {liveNote && (
          <div style={{ marginTop: 16, borderTop: `1px solid ${c.borderSoft}`, paddingTop: 15, animation: "tacet-rise 280ms ease both" }}>
            <div style={{ fontFamily: font.mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.cruxText, fontWeight: 600 }}>
              live mode · backend not connected
            </div>
            <div style={{ fontSize: 13, color: c.m1, lineHeight: 1.55, marginTop: 8, maxWidth: 680 }}>
              live mode touches the network and external models via{" "}
              <span style={{ fontFamily: font.mono, fontSize: 11.5, color: "#26231e" }}>POST /api/run</span> — with no fabricated
              result to fill in. while the endpoint is not wired, see the full method in a world already run:{" "}
              <span style={{ color: "#26231e" }}>offline, instant, deterministic</span>.
            </div>
            <Link
              href="/caso/freud"
              style={{
                display: "inline-block", marginTop: 12, fontFamily: font.sans, fontWeight: 600, fontSize: 12.5, color: "#fff",
                background: c.green, border: "none", borderRadius: 3, padding: "9px 16px", textDecoration: "none",
              }}
            >
              walk through the method (Freud case · offline) →
            </Link>
          </div>
        )}
      </div>

      {/* divider to doors */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 34 }}>
        <span style={{ height: 1, background: c.rule, flex: 1 }} />
        <span style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: "0.06em", color: c.m4, whiteSpace: "nowrap" }}>
          or see the method in four worlds already run · offline · instant
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

      <div style={{ fontFamily: font.serif, fontStyle: "italic", fontSize: 14.5, color: c.m2, lineHeight: 1.5, marginTop: 22, maxWidth: 760, textWrap: "pretty" }}>
        the four cases are not the product — they are the proof that the stage can hold any act. the product is the field up top.
      </div>
    </div>
  );
}
