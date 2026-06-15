import { c, font } from "../../tokens";
import { SIG, LEAN } from "../../cases";
import type { CaseData } from "../../cases";

/** SCREEN 3 — DOIS LEITORES. The heart: the same evidence read twice, no side
 * assigned. The two leans sit side by side; the signal classifies the RELATION,
 * never fusing them into one voice. */
export function DoisLeitores({ cs, onNext }: { cs: CaseData; onNext: () => void }) {
  return (
    <div style={{ marginTop: 26 }}>
      <div style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: c.m5 }}>dois leitores · o coração</div>
      <div style={{ fontFamily: font.serif, fontSize: 24, color: "#26231e", marginTop: 4 }}>a mesma evidência, lida duas vezes.</div>
      <div style={{ fontSize: 13, color: c.m1, lineHeight: 1.55, marginTop: 8, maxWidth: 840 }}>
        nenhum dos dois tem lado atribuído. cada lean é conquistado da evidência. os dois ficam lado a lado — o sinal classifica a relação entre eles,{" "}
        <span style={{ color: "#26231e" }}>nunca os funde numa resposta só</span>. certifica coerência, jamais verdade.
      </div>

      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 14, background: c.panel, border: `1px solid ${c.border}`, borderRadius: 3, padding: "11px 15px" }}>
        {(["core", "crux", "unsupported"] as const).map((k) => (
          <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, color: c.m1 }}>
            <span style={{ color: SIG[k].color, fontSize: 13 }}>{SIG[k].glyph}</span>
            {SIG[k].name}
          </span>
        ))}
      </div>

      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {[cs.readerA, cs.readerB].map((r) => (
          <div key={r} style={{ fontFamily: font.mono, fontSize: 11, color: "#26231e", background: c.panel3, border: `1px solid ${c.border}`, borderRadius: 3, padding: "9px 13px" }}>{r}</div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 13, marginTop: 13 }}>
        {cs.claims.map((cl, i) => {
          const sg = SIG[cl.signal];
          const isCrux = cl.signal === "crux";
          const isUns = cl.signal === "unsupported";
          const la = LEAN[cl.leanA];
          const lb = LEAN[cl.leanB];
          return (
            <div
              key={i}
              style={{
                borderRadius: 4, padding: "17px 18px", background: isCrux ? "#FBF4E7" : c.card,
                border: isCrux ? "1px solid #BA7517" : `1px solid ${c.border}`,
                borderLeft: isCrux ? "1px solid #BA7517" : `4px solid ${sg.color}`,
                boxShadow: isCrux ? "0 0 0 1px #BA751722" : undefined,
                opacity: isUns ? 0.86 : 1,
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: font.mono, fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: sg.text, fontWeight: 600 }}>
                <span style={{ fontSize: 13, color: sg.color }}>{sg.glyph}</span>{sg.name}
              </span>
              <div style={{ fontFamily: font.serif, fontSize: 18, color: "#26231e", lineHeight: 1.45, marginTop: 11, textWrap: "pretty" }}>{cl.text}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11, marginTop: 13 }}>
                {[{ short: cs.readerA, lean: la }, { short: cs.readerB, lean: lb }].map((side, j) => (
                  <div key={j} style={{ border: `1px solid ${c.borderSoft}`, background: c.input, borderRadius: 3, padding: "9px 12px" }}>
                    <div style={{ fontFamily: font.mono, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: c.m5 }}>{side.short}</div>
                    <div style={{ fontFamily: font.mono, fontSize: 13.5, fontWeight: 500, color: side.lean.color, marginTop: 3 }}>{side.lean.text}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 13, color: c.m1, lineHeight: 1.5, marginTop: 12, borderTop: `1px solid ${isCrux ? "#e7dcc6" : c.borderSoft}`, paddingTop: 10 }}>
                <span style={{ color: sg.text, fontWeight: 600 }}>{sg.name} —</span> {cl.reading}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 20, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <span style={{ fontFamily: font.mono, fontSize: 10, color: c.m6, letterSpacing: "0.04em" }}>o sinal classifica a relação entre os dois leitores · jamais os colapsa numa voz</span>
        <button type="button" onClick={onNext} style={{ fontFamily: font.sans, fontWeight: 600, fontSize: 12.5, color: "#fff", background: c.green, border: "none", borderRadius: 3, padding: "11px 18px", cursor: "pointer" }}>
          ver o mapa da disputa →
        </button>
      </div>
    </div>
  );
}
