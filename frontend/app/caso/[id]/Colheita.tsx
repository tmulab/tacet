import { c, font } from "../../tokens";
import type { CaseData, CoverageReturnRow } from "../../cases";

const SOURCES = [
  { name: "Crossref", done: true, status: "complete" },
  { name: "OpenAlex", done: false, status: "planned · outside this run" },
  { name: "SciELO", done: false, status: "planned · outside this run" },
];

function returnStyle(state: CoverageReturnRow["state"]): { glyph: string; gColor: string; bg: string; bd: string; vColor: string; vItalic: boolean } {
  if (state === "ok") return { glyph: "✓", gColor: "#0F6E56", bg: "#f1f5f2", bd: "#cbe2d6", vColor: "#0F6E56", vItalic: false };
  if (state === "zero") return { glyph: "●", gColor: "#993C1D", bg: "#FAECE7", bd: "#e9cabb", vColor: "#993C1D", vItalic: false };
  return { glyph: "○", gColor: "#888780", bg: c.panel, bd: c.border, vColor: "#888780", vItalic: true };
}

/** SCREEN 2 — HARVEST: the harvest metrics, the sources, and expected-vs-returned
 * coverage (the empty chair forming in front of you). */
export function Colheita({ cs, onNext }: { cs: CaseData; onNext: () => void }) {
  const metrics = [
    { label: "records scanned", value: cs.harvest.scanned },
    { label: "with an abstract", value: cs.harvest.abstract },
    { label: "claims ingested", value: cs.harvest.claims },
  ];
  return (
    <div style={{ marginTop: 26 }}>
      <div style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: c.m5 }}>harvest · run saved, replayed</div>
      <div style={{ fontFamily: font.serif, fontSize: 24, color: "#26231e", marginTop: 4 }}>harvesting the evidence base</div>
      <div style={{ fontSize: 13, color: c.m1, lineHeight: 1.5, marginTop: 7, maxWidth: 800 }}>
        TACET audits the literature on the dispute, it does not opine on it. we keep only records with an abstract and traceable provenance.
      </div>

      <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 13 }}>
        {metrics.map((m) => (
          <div key={m.label} style={{ border: `1px solid ${c.border}`, background: c.card, borderRadius: 3, padding: "15px 16px" }}>
            <div style={{ fontSize: 11.5, color: c.m3 }}>{m.label}</div>
            <div style={{ fontFamily: font.mono, fontSize: 30, fontWeight: 500, color: "#26231e", marginTop: 5, letterSpacing: "-0.01em" }}>{m.value}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 18 }}>
        <div>
          <div style={{ fontFamily: font.sans, fontWeight: 600, fontSize: 13, color: c.ink }}>sources</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 11 }}>
            {SOURCES.map((src) => (
              <div key={src.name} style={{ border: `1px solid ${c.border}`, background: c.card, borderRadius: 3, padding: "11px 13px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <span style={{ width: 19, height: 19, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", fontSize: 11, color: src.done ? "#fff" : c.m4, background: src.done ? c.core : "transparent", border: `1px solid ${src.done ? c.core : "#c9bfac"}` }}>
                      {src.done ? "✓" : "◷"}
                    </span>
                    <span style={{ fontFamily: font.mono, fontSize: 12.5, color: "#26231e", fontWeight: 500 }}>{src.name}</span>
                  </div>
                  <span style={{ fontFamily: font.mono, fontSize: 10.5, color: src.done ? "#0F6E56" : c.m5 }}>{src.status}</span>
                </div>
                <div style={{ height: 4, background: "#e6dfd1", borderRadius: 2, marginTop: 9, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: src.done ? "100%" : "0%", background: c.core }} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontFamily: font.mono, fontSize: 9.5, color: c.m6, marginTop: 10, lineHeight: 1.5 }}>
            this run harvests from Crossref. OpenAlex and SciELO come in as real work once wired — not painted as real before then.
          </div>
        </div>

        <div>
          <div style={{ fontFamily: font.sans, fontWeight: 600, fontSize: 13, color: c.ink }}>
            expected coverage <span style={{ fontWeight: 400, color: c.m3 }}>vs. what came back</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 11 }}>
            {cs.coverageReturn.map((cr) => {
              const s = returnStyle(cr.state);
              return (
                <div key={cr.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, border: `1px solid ${s.bd}`, background: s.bg, borderRadius: 3, padding: "9px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <span style={{ color: s.gColor, fontSize: 13, width: 14, textAlign: "center" }}>{s.glyph}</span>
                    <span style={{ fontSize: 12.5, color: "#34302a" }}>{cr.label}</span>
                  </div>
                  <span style={{ fontFamily: font.mono, fontSize: 11, color: s.vColor, fontStyle: s.vItalic ? "italic" : "normal" }}>{cr.val}</span>
                </div>
              );
            })}
          </div>
          <div style={{ fontFamily: font.serif, fontStyle: "italic", fontSize: 13, color: c.m2, marginTop: 11, lineHeight: 1.5 }}>
            the empty chair forms in front of you: what the ruler expected and the base did not bring.
          </div>
        </div>
      </div>

      <div style={{ marginTop: 22, display: "flex", justifyContent: "flex-end" }}>
        <button type="button" onClick={onNext} style={{ fontFamily: font.sans, fontWeight: 600, fontSize: 12.5, color: "#fff", background: c.green, border: "none", borderRadius: 3, padding: "11px 18px", cursor: "pointer" }}>
          see the two readers →
        </button>
      </div>
    </div>
  );
}
