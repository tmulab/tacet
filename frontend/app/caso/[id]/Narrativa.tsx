import Link from "next/link";
import { c, font } from "../../tokens";
import type { CaseData, NarrativeLine } from "../../cases";

const ANCHOR: Record<NarrativeLine["anchor"], { text: string; bg: string; border: string; glyph: string }> = {
  core: { text: "#0F6E56", bg: "#E7F3EE", border: "#bfe0d2", glyph: "●" },
  crux: { text: "#854F0B", bg: "#F7EEDD", border: "#e7dcc6", glyph: "▲" },
  empty: { text: "#993C1D", bg: "#FAECE7", border: "#e9cabb", glyph: "🪑" },
};

/** SCREEN 5 — NARRATIVA vs deep research. The same sub-question, two answers:
 * TACET only says what the map measured (each line anchored to a node); deep
 * research is fluent and concludes — dissolving the crux, never naming the gap. */
export function Narrativa({ cs }: { cs: CaseData }) {
  const n = cs.narrative;

  // Real case without an uplift comparison (covid, freud): the TACET column only.
  if (cs.isReal && cs.hasUplift !== true && cs.narrativeProse) {
    return (
      <div style={{ marginTop: 26 }}>
        <div style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: c.m5 }}>narrativa · só o que o mapa mediu</div>
        <div style={{ fontFamily: font.serif, fontSize: 24, color: "#26231e", marginTop: 4 }}>a narrativa ancorada — cada frase no que foi medido.</div>
        <div style={{ fontSize: 13, color: c.m1, lineHeight: 1.55, marginTop: 8, maxWidth: 860 }}>
          a do TACET só pode dizer o que o mapa mediu. este caso não tem comparação deep-research congelada — mostramos a prosa determinística do motor, gerada do fixture, sem coluna de baseline e sem alucinação.
        </div>
        <div style={{ marginTop: 18, border: "1px solid #b9cdc4", background: "#f1f5f2", borderRadius: 4, padding: "18px 18px 16px" }}>
          <span style={{ fontFamily: font.mono, fontWeight: 600, fontSize: 13, letterSpacing: "0.1em", color: c.green }}>TACET</span>
          <div style={{ fontFamily: font.serif, fontSize: 16, lineHeight: 1.65, color: "#26231e", marginTop: 13, textWrap: "pretty" }}>{cs.narrativeProse}</div>
          <div style={{ fontFamily: font.mono, fontSize: 9.5, color: "#6b8077", lineHeight: 1.5, marginTop: 16, borderTop: "1px solid #d4e0da", paddingTop: 10 }}>
            certifica coerência, nunca verdade · prosa determinística do fixture (sem inferência livre)
          </div>
        </div>
        <div style={{ marginTop: 22, display: "flex", justifyContent: "center" }}>
          <Link href="/" style={{ fontFamily: font.sans, fontWeight: 600, fontSize: 13.5, color: "#fff", background: c.green, border: "none", borderRadius: 3, padding: "13px 26px", textDecoration: "none" }}>
            rodar outra pergunta ↺
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 26 }}>
      <div style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: c.m5 }}>narrativa · o uplift visível</div>
      <div style={{ fontFamily: font.serif, fontSize: 24, color: "#26231e", marginTop: 4 }}>a mesma sub-pergunta, as duas respostas.</div>
      <div style={{ fontSize: 13, color: c.m1, lineHeight: 1.55, marginTop: 8, maxWidth: 860 }}>
        a do TACET só pode dizer o que o mapa mediu — cada frase ancora num nó, clicável. a do deep research é fluente e conclui. veja o que cada uma faz com a dúvida.
      </div>

      <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
        {/* TACET */}
        <div style={{ border: "1px solid #b9cdc4", background: "#f1f5f2", borderRadius: 4, padding: "18px 18px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <span style={{ fontFamily: font.mono, fontWeight: 600, fontSize: 13, letterSpacing: "0.1em", color: c.green }}>TACET</span>
            <span style={{ fontFamily: font.mono, fontSize: 10.5, color: "#0F6E56", background: "#E7F3EE", border: "1px solid #bfe0d2", borderRadius: 2, padding: "3px 8px" }}>{n.tacetAnchor} ancorado</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 13, marginTop: 15 }}>
            {n.tacetLines.map((tl, i) => {
              const a = ANCHOR[tl.anchor];
              return (
                <div key={i}>
                  <div style={{ fontFamily: font.serif, fontSize: 16.5, lineHeight: 1.5, color: tl.anchor === "empty" ? "#993C1D" : "#26231e", textWrap: "pretty" }}>{tl.text}</div>
                  <span style={{ marginTop: 7, display: "inline-flex", alignItems: "center", gap: 6, fontFamily: font.mono, fontSize: 10, color: a.text, background: a.bg, border: `1px solid ${a.border}`, borderRadius: 2, padding: "3px 8px" }}>
                    <span style={{ fontSize: 11 }}>{a.glyph}</span>{tl.label}
                  </span>
                </div>
              );
            })}
          </div>
          <div style={{ fontFamily: font.mono, fontSize: 9.5, color: "#6b8077", lineHeight: 1.5, marginTop: 16, borderTop: "1px solid #d4e0da", paddingTop: 10 }}>
            certifica coerência, nunca verdade · não conclui qual lado está certo
          </div>
        </div>

        {/* deep research */}
        <div style={{ border: `1px solid ${c.border}`, background: "#f3f0ea", borderRadius: 4, padding: "18px 18px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <span style={{ fontFamily: font.mono, fontWeight: 600, fontSize: 13, letterSpacing: "0.06em", color: c.m3 }}>deep research</span>
            <span style={{ fontFamily: font.mono, fontSize: 10.5, color: "#888780", background: "#eae4d8", border: `1px solid ${c.border}`, borderRadius: 2, padding: "3px 8px" }}>{n.drAnchor} ancorado</span>
          </div>
          <div style={{ fontFamily: font.serif, fontSize: 16.5, lineHeight: 1.6, color: "#34302a", marginTop: 15, textWrap: "pretty" }}>
            {n.drText1} <span style={{ background: "#F7EEDD", borderBottom: "1px solid #BA7517", padding: "0 2px" }}>{n.drHighlight}</span> {n.drText2}{" "}
            <em style={{ fontStyle: "italic", color: c.m1 }}>{n.drConclusion}</em>
          </div>
          <div style={{ fontFamily: font.mono, fontSize: 9.5, color: "#993C1D", lineHeight: 1.5, marginTop: 16, borderTop: `1px solid ${c.borderSoft}`, paddingTop: 10 }}>
            dissolveu o crux numa frase de transição · nenhuma menção ao que faltou
          </div>
        </div>
      </div>

      <div style={{ marginTop: 18, background: "#EEEDFE", border: "1px solid #d6d3f4", borderLeft: "3px solid #3C3489", borderRadius: 3, padding: "15px 18px" }}>
        <div style={{ fontFamily: font.mono, fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "#3C3489", fontWeight: 600 }}>escala</div>
        <div style={{ fontFamily: font.serif, fontSize: 17, color: "#2c2960", lineHeight: 1.5, marginTop: 8, textWrap: "pretty" }}>
          a vantagem em ancoragem pode encolher com modelos melhores. a cadeira vazia, não — é uma capacidade estrutural que o formato narrativo-conclusivo não tem, por melhor que o modelo fique.
        </div>
      </div>

      <div style={{ marginTop: 22, display: "flex", justifyContent: "center" }}>
        <Link href="/" style={{ fontFamily: font.sans, fontWeight: 600, fontSize: 13.5, color: "#fff", background: c.green, border: "none", borderRadius: 3, padding: "13px 26px", textDecoration: "none" }}>
          rodar outra pergunta ↺
        </Link>
      </div>
    </div>
  );
}
