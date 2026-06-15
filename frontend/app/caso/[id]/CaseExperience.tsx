"use client";

import { useState } from "react";
import { c, font } from "../../tokens";
import type { CaseData } from "../../cases";
import { Passo0 } from "./Passo0";
import { Colheita } from "./Colheita";
import { DoisLeitores } from "./DoisLeitores";
import { Mapa } from "./Mapa";
import { Narrativa } from "./Narrativa";

const ORDER = ["passo-0", "colheita", "leitores", "mapa", "narrativa"] as const;
type Step = (typeof ORDER)[number];
const LABEL: Record<Step, string> = {
  "passo-0": "passo 0", colheita: "colheita", leitores: "dois leitores", mapa: "mapa", narrativa: "narrativa",
};

/** The inner case experience — mirrors the prototype's step SPA: one screen at a
 * time, driven by the step bar. The data is the design's illustrative mock until
 * Phase 3 wires the frozen fixtures. */
export function CaseExperience({ cs }: { cs: CaseData }) {
  const [step, setStep] = useState<Step>("passo-0");
  const go = (s: Step): void => {
    setStep(s);
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  };
  const cur = ORDER.indexOf(step);

  return (
    <div style={{ marginTop: 4 }}>
      {/* mode + illustrative marker */}
      <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: font.mono, fontSize: 10, letterSpacing: "0.06em", color: c.m1, background: c.panel, border: `1px solid ${c.border}`, borderRadius: 20, padding: "5px 11px" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.unsupported, display: "inline-block" }} />
          modo replay · offline · instantâneo
        </span>
        <span style={{ fontFamily: font.mono, fontSize: 9.5, color: c.cruxText, background: "#F7EEDD", border: "1px solid #e7dcc6", borderRadius: 3, padding: "4px 9px", letterSpacing: "0.04em" }}>
          números ilustrativos — até o motor rodar
        </span>
      </div>

      {/* step bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 0, marginTop: 14, flexWrap: "wrap" }}>
        {ORDER.map((s, i) => {
          const active = i === cur;
          const done = i < cur;
          return (
            <span key={s} style={{ display: "inline-flex", alignItems: "center" }}>
              <button
                type="button"
                onClick={() => go(s)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer",
                  border: `1px solid ${active ? c.green : c.border}`, background: active ? c.green : done ? "#e7efe9" : c.panel,
                  color: active ? "#fff" : done ? c.green : c.m5, borderRadius: 3, padding: "7px 12px",
                }}
              >
                <span style={{ fontFamily: font.mono, fontSize: 11, fontWeight: 600, width: 17, height: 17, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", border: `1px solid ${active ? "#ffffff66" : done ? "#2E5A4B55" : "#c9bfac"}` }}>
                  {done ? "✓" : i + 1}
                </span>
                <span style={{ fontSize: 12, fontWeight: 500 }}>{LABEL[s]}</span>
              </button>
              {i < ORDER.length - 1 && <span style={{ width: 14, height: 1, background: c.rule }} />}
            </span>
          );
        })}
      </div>

      {step === "passo-0" && <Passo0 cs={cs} onAccept={() => go("colheita")} />}
      {step === "colheita" && <Colheita cs={cs} onNext={() => go("leitores")} />}
      {step === "leitores" && <DoisLeitores cs={cs} onNext={() => go("mapa")} />}
      {step === "mapa" && <Mapa cs={cs} onNext={() => go("narrativa")} />}
      {step === "narrativa" && <Narrativa cs={cs} />}
    </div>
  );
}
