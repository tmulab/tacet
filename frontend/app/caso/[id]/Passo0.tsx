"use client";

import { useState } from "react";
import Link from "next/link";
import { c, font } from "../../tokens";
import type { CaseData } from "../../cases";

/** SCREEN 1 — STEP 0. "the model proposes; you dispose": the question, the two
 * editable hypothesis clauses, the pre-registered coverage, and the human
 * accept that unlocks the harvest. */
export function Passo0({ cs, onAccept }: { cs: CaseData; onAccept: () => void }) {
  const [editA, setEditA] = useState(cs.hypA);
  const [editB, setEditB] = useState(cs.hypB);
  const provenance = "proposed by glm-5 · not accepted";

  return (
    <div style={{ marginTop: 26 }}>
      <div style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: c.m5 }}>
        step 0 · the machine analyst
      </div>
      <div style={{ fontFamily: font.serif, fontSize: 24, color: "#26231e", marginTop: 4 }}>the model proposes; you dispose.</div>

      <div style={{ marginTop: 16, background: c.panel, border: `1px solid ${c.border}`, borderRadius: 3, padding: "14px 18px" }}>
        <div style={{ fontFamily: font.mono, fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase", color: c.m5 }}>the question</div>
        <div style={{ fontFamily: font.serif, fontSize: 20, color: "#26231e", marginTop: 5, lineHeight: 1.4 }}>{cs.question}</div>
      </div>

      {cs.isReal && cs.caseLanguage && (
        <div style={{ marginTop: 14, background: c.panel3, border: `1px solid ${c.border}`, borderLeft: `3px solid ${c.green}`, borderRadius: 3, padding: "11px 14px" }}>
          <div style={{ fontFamily: font.mono, fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: c.coreText, fontWeight: 600 }}>
            Reference hypothesis (case language: {cs.caseLanguage})
          </div>
          <div style={{ fontSize: 12, color: c.m1, lineHeight: 1.5, marginTop: 5 }}>
            TACET operates on the case in its own language — the hypothesis below is shown as harvested, not translated.
          </div>
        </div>
      )}

      <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {[
          { color: c.core, text: c.coreText, glyph: "●", label: "best-supported position", val: editA, set: setEditA, bd: "#d8e4dd" },
          { color: c.crux, text: c.cruxText, glyph: "▲", label: "concession / tension", val: editB, set: setEditB, bd: "#e7dcc6" },
        ].map((col) => (
          <div key={col.label} style={{ border: `1px solid ${c.border}`, borderTop: `3px solid ${col.color}`, background: c.card, borderRadius: 3, padding: "15px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontFamily: font.mono, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: col.text, fontWeight: 600 }}>
                {col.glyph} {col.label}
              </span>
              <span style={{ fontFamily: font.mono, fontSize: 9.5, color: c.m4 }}>{provenance}</span>
            </div>
            <textarea
              value={col.val}
              onChange={(e) => col.set(e.target.value)}
              style={{ width: "100%", marginTop: 11, minHeight: 104, resize: "vertical", border: `1px solid ${col.bd}`, borderRadius: 3, background: c.input, padding: "11px 12px", fontFamily: font.serif, fontSize: 16, lineHeight: 1.5, color: "#26231e" }}
            />
          </div>
        ))}
      </div>
      <div style={{ fontFamily: font.serif, fontStyle: "italic", fontSize: 13.5, color: c.m2, marginTop: 9 }}>
        two clauses, editable: the machine analyst's gesture is to be able to rewrite the hypothesis before accepting it.
      </div>

      <div style={{ marginTop: 22, borderTop: `1px solid ${c.rule}`, paddingTop: 18 }}>
        <div style={{ fontFamily: font.sans, fontWeight: 600, fontSize: 14, color: c.ink }}>expected coverage — declared now, before the harvest</div>
        <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 12 }}>
          {cs.coverage.map((cv) => (
            <span key={cv.dim} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "#34302a", background: cv.unmeasured ? c.panel : c.panel3, border: `1px solid ${c.border}`, borderRadius: 20, padding: "7px 13px" }}>
              <span style={{ fontFamily: font.mono, fontSize: 9.5, opacity: 0.65 }}>{cv.dim}</span>
              {cv.vals}
              {cv.unmeasured && <span style={{ fontSize: 10, color: "#888780", fontStyle: "italic" }}> · not measured</span>}
            </span>
          ))}
        </div>
        <div style={{ fontFamily: font.serif, fontStyle: "italic", fontSize: 13.5, color: c.m2, marginTop: 12, lineHeight: 1.5, maxWidth: 780 }}>
          what a good corpus for this dispute should contain, stated now, before seeing what comes back. it is the pre-registration that makes the empty chair anticircular — the ruler came first.
        </div>
      </div>

      <div style={{ marginTop: 22, background: c.panel, border: `1px solid ${c.border}`, borderRadius: 3, padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <span style={{ fontSize: 19, color: c.cruxText }}>⊟</span>
          <span style={{ fontSize: 13.5, color: c.m1, lineHeight: 1.45 }}>
            the harvest only begins after your accept. <span style={{ color: "#26231e" }}>nothing from a machine becomes a result without a human unlocking it.</span>
          </span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/" style={{ fontFamily: font.sans, fontWeight: 500, fontSize: 12.5, color: c.m1, background: c.panel2, border: `1px solid ${c.borderInput}`, borderRadius: 3, padding: "10px 16px", textDecoration: "none" }}>
            propose again
          </Link>
          <button type="button" onClick={onAccept} style={{ fontFamily: font.sans, fontWeight: 600, fontSize: 12.5, color: "#fff", background: c.green, border: "none", borderRadius: 3, padding: "10px 18px", cursor: "pointer" }}>
            accept and unlock the harvest →
          </button>
        </div>
      </div>
    </div>
  );
}
