"use client";

import { useState } from "react";
import Link from "next/link";
import { c, font } from "../../tokens";
import type { CaseData } from "../../cases";

/** SCREEN 1 — PASSO 0. "o modelo propõe; você dispõe": the question, the two
 * editable hypothesis clauses, the pre-registered coverage, and the human
 * accept that unlocks the harvest. */
export function Passo0({ cs, onAccept }: { cs: CaseData; onAccept: () => void }) {
  const [editA, setEditA] = useState(cs.hypA);
  const [editB, setEditB] = useState(cs.hypB);
  const provenance = "proposto por glm-5 · não aceito";

  return (
    <div style={{ marginTop: 26 }}>
      <div style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: c.m5 }}>
        passo 0 · o analista da máquina
      </div>
      <div style={{ fontFamily: font.serif, fontSize: 24, color: "#26231e", marginTop: 4 }}>o modelo propõe; você dispõe.</div>

      <div style={{ marginTop: 16, background: c.panel, border: `1px solid ${c.border}`, borderRadius: 3, padding: "14px 18px" }}>
        <div style={{ fontFamily: font.mono, fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase", color: c.m5 }}>a pergunta</div>
        <div style={{ fontFamily: font.serif, fontSize: 20, color: "#26231e", marginTop: 5, lineHeight: 1.4 }}>{cs.question}</div>
      </div>

      <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {[
          { color: c.core, text: c.coreText, glyph: "●", label: "posição mais sustentada", val: editA, set: setEditA, bd: "#d8e4dd" },
          { color: c.crux, text: c.cruxText, glyph: "▲", label: "concessão / tensão", val: editB, set: setEditB, bd: "#e7dcc6" },
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
        duas cláusulas, editáveis: o gesto do analista da máquina é poder reescrever a hipótese antes de aceitar.
      </div>

      <div style={{ marginTop: 22, borderTop: `1px solid ${c.rule}`, paddingTop: 18 }}>
        <div style={{ fontFamily: font.sans, fontWeight: 600, fontSize: 14, color: c.ink }}>cobertura esperada — declarada agora, antes da colheita</div>
        <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 12 }}>
          {cs.coverage.map((cv) => (
            <span key={cv.dim} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "#34302a", background: cv.unmeasured ? c.panel : c.panel3, border: `1px solid ${c.border}`, borderRadius: 20, padding: "7px 13px" }}>
              <span style={{ fontFamily: font.mono, fontSize: 9.5, opacity: 0.65 }}>{cv.dim}</span>
              {cv.vals}
              {cv.unmeasured && <span style={{ fontSize: 10, color: "#888780", fontStyle: "italic" }}> · não-medida</span>}
            </span>
          ))}
        </div>
        <div style={{ fontFamily: font.serif, fontStyle: "italic", fontSize: 13.5, color: c.m2, marginTop: 12, lineHeight: 1.5, maxWidth: 780 }}>
          o que um bom corpus para esta disputa deveria conter, dito agora, antes de ver o que volta. é o pré-registro que torna a cadeira vazia anticircular — a régua veio primeiro.
        </div>
      </div>

      <div style={{ marginTop: 22, background: c.panel, border: `1px solid ${c.border}`, borderRadius: 3, padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <span style={{ fontSize: 19, color: c.cruxText }}>⊟</span>
          <span style={{ fontSize: 13.5, color: c.m1, lineHeight: 1.45 }}>
            a colheita só começa após o seu aceite. <span style={{ color: "#26231e" }}>nada de máquina vira resultado sem um humano destravar.</span>
          </span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/" style={{ fontFamily: font.sans, fontWeight: 500, fontSize: 12.5, color: c.m1, background: c.panel2, border: `1px solid ${c.borderInput}`, borderRadius: 3, padding: "10px 16px", textDecoration: "none" }}>
            propor de novo
          </Link>
          <button type="button" onClick={onAccept} style={{ fontFamily: font.sans, fontWeight: 600, fontSize: 12.5, color: "#fff", background: c.green, border: "none", borderRadius: 3, padding: "10px 18px", cursor: "pointer" }}>
            aceitar e destravar a colheita →
          </button>
        </div>
      </div>
    </div>
  );
}
