import { c, font } from "../../tokens";
import type { CaseData } from "../../cases";

/** SCREEN 4 — MAPA + CADEIRA VAZIA. The shape of the dispute (robust core / live
 * crux / unsupported) and the measured coverage gap against the pre-registered
 * ruler — anticircular: the ruler came first. */
export function Mapa({ cs, onNext }: { cs: CaseData; onNext: () => void }) {
  const m = cs.map;
  const tot = m.core + m.crux + m.uns;
  const pc = Math.round((m.core / tot) * 100);
  const px = Math.round((m.crux / tot) * 100);
  const pu = 100 - pc - px;
  const cruxAbsent = m.crux === 0;
  const metrics = [
    { label: "núcleo robusto", value: String(m.core), color: c.core, glyph: "●" },
    { label: cruxAbsent ? "crux ausente" : "crux vivo", value: cruxAbsent ? "—" : String(m.crux), color: c.crux, glyph: "▲" },
    { label: "não sustentado", value: String(m.uns), color: "#8a8275", glyph: "○" },
  ];

  return (
    <div style={{ marginTop: 26 }}>
      <div style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: c.m5 }}>mapa · a forma da disputa</div>
      <div style={{ fontFamily: font.serif, fontSize: 24, color: "#26231e", marginTop: 4 }}>a forma da disputa — e o que faltou.</div>

      <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 13 }}>
        {metrics.map((mm) => (
          <div key={mm.label} style={{ border: `1px solid ${c.border}`, borderTop: `3px solid ${mm.color}`, background: c.card, borderRadius: 3, padding: "15px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: c.m3 }}>
              <span style={{ color: mm.color, fontSize: 13 }}>{mm.glyph}</span>{mm.label}
            </div>
            <div style={{ fontFamily: font.mono, fontSize: 30, fontWeight: 500, color: "#26231e", marginTop: 6 }}>{mm.value}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 13, height: 14, borderRadius: 3, overflow: "hidden", display: "flex", border: `1px solid ${c.border}` }}>
        <div style={{ width: `${pc}%`, background: c.core }} />
        <div style={{ width: `${px}%`, background: c.crux }} />
        <div style={{ width: `${pu}%`, background: "#b8b0a0" }} />
      </div>

      <div style={{ marginTop: 28, borderTop: `1px solid ${c.rule}`, paddingTop: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <span style={{ fontSize: 19, color: c.chair, lineHeight: 1 }}>🪑</span>
          <div style={{ fontFamily: font.serif, fontSize: 21, color: "#26231e" }}>a cadeira vazia</div>
        </div>
        <div style={{ fontSize: 13, color: c.m1, lineHeight: 1.55, marginTop: 9, maxWidth: 840 }}>
          a régua foi declarada no passo 0, <span style={{ color: "#26231e" }}>antes da colheita</span>. isto não é o que achamos — é o que a base deveria conter e não continha. um buraco contável, não uma queixa.
        </div>

        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 13, fontFamily: font.mono, fontSize: 10.5 }}>
          <span style={{ color: c.chair }}>● 0 — procuramos e não estava lá</span>
          <span style={{ color: "#888780" }}>○ não-medido — sem como medir ainda</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
          {cs.emptyChair.map((ec, i) => {
            const zero = ec.kind === "zero";
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, borderRadius: 3, padding: "13px 15px", background: zero ? "#FAECE7" : c.panel, border: `1px solid ${zero ? "#e9cabb" : c.border}`, borderLeft: `3px solid ${zero ? c.chair : "#b9b0a0"}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ color: zero ? c.chair : "#888780", fontSize: 15, width: 18, textAlign: "center" }}>{zero ? "●" : "○"}</span>
                  <div>
                    <div style={{ fontFamily: font.sans, fontWeight: 600, fontSize: 13.5, color: zero ? c.chair : c.m1 }}>{ec.label}</div>
                    <div style={{ fontSize: 11.5, color: c.m3, marginTop: 2 }}>{ec.detail}</div>
                  </div>
                </div>
                <div style={{ fontFamily: font.mono, fontSize: zero ? 22 : 12, color: zero ? c.chair : "#888780", fontStyle: zero ? "normal" : "italic", letterSpacing: "0.02em", whiteSpace: "nowrap" }}>{ec.val}</div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 18, background: "#EEEDFE", border: "1px solid #d6d3f4", borderLeft: "3px solid #3C3489", borderRadius: 3, padding: "15px 18px" }}>
          <div style={{ fontFamily: font.mono, fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "#3C3489", fontWeight: 600 }}>nota teórica</div>
          <div style={{ fontFamily: font.serif, fontSize: 17, color: "#2c2960", lineHeight: 1.5, marginTop: 8, textWrap: "pretty" }}>{cs.insight}</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginTop: 18 }}>
          <span style={{ fontFamily: font.mono, fontSize: 10, letterSpacing: "0.08em", color: c.cruxText, background: "#F7EEDD", border: "1px solid #e7dcc6", borderRadius: 3, padding: "6px 11px" }}>medido contra a régua do passo 0 — anticircular</span>
          <button type="button" onClick={onNext} style={{ fontFamily: font.sans, fontWeight: 600, fontSize: 12.5, color: "#fff", background: c.green, border: "none", borderRadius: 3, padding: "11px 18px", cursor: "pointer" }}>
            narrativa vs deep research →
          </button>
        </div>
      </div>
    </div>
  );
}
