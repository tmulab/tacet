import Link from "next/link";
import { c, font } from "../../tokens";
import type { CaseData, NarrativeLine } from "../../cases";

const ANCHOR: Record<NarrativeLine["anchor"], { text: string; bg: string; border: string; glyph: string }> = {
  core: { text: "#0F6E56", bg: "#E7F3EE", border: "#bfe0d2", glyph: "●" },
  crux: { text: "#854F0B", bg: "#F7EEDD", border: "#e7dcc6", glyph: "▲" },
  empty: { text: "#993C1D", bg: "#FAECE7", border: "#e9cabb", glyph: "🪑" },
};

/** SCREEN 5 — NARRATIVE vs deep research. The same sub-question, two answers:
 * TACET only says what the map measured (each line anchored to a node); deep
 * research is fluent and concludes — dissolving the crux, never naming the gap. */
export function Narrativa({ cs }: { cs: CaseData }) {
  const n = cs.narrative;

  // Real case WITH an uplift comparison (eggs, lhc): the four measured rubric
  // dimensions, TACET vs deep-research, framed by the named asymmetry.
  if (cs.isReal && cs.uplift) {
    const u = cs.uplift;
    const pct = (f: number) => `${Math.round(f * 100)}%`;
    const v = u.verifiability;
    const layers = (s: typeof v.tacet): string =>
      `landing ${s.landingN} (${pct(s.landingFraction)}) · registered ${s.registeredN} (${pct(s.registeredFraction)})`;
    const rows: { key: string; title: string; tacet: string; base: string; tacetNote?: string; baseNote?: string }[] = [
      {
        key: "verifiability",
        title: "verifiable fidelity",
        tacet: layers(v.tacet),
        base: layers(v.baseline) + (v.baseline.hasDoiLayer ? "" : " — registered = fallback (0 DOIs)"),
        tacetNote: v.tacet.note,
        baseNote: v.baseline.note,
      },
      { key: "uncertainty", title: "uncertainty preservation", tacet: `${u.uncertainty.tacetAbstentions} named abstentions`, base: `${u.uncertainty.baselineHedges} hedges · ${u.uncertainty.baselineVerdicts} verdicts` },
      { key: "load-bearing", title: "load-bearing evidence — visible?", tacet: "every conclusion exposes its DOIs", base: "rated by the judge" },
      { key: "hidden", title: "hidden dependencies disclosed", tacet: `names ${u.hiddenDependency.count}: ${u.hiddenDependency.names.join(", ") || "—"}`, base: "uses them without disclosing (outside CC-BY)" },
    ];
    return (
      <div style={{ marginTop: 26 }}>
        <div style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: c.m5 }}>narrative · the measured uplift</div>
        <div style={{ fontFamily: font.serif, fontSize: 24, color: "#26231e", marginTop: 4 }}>TACET measured vs deep research.</div>
        <div style={{ fontFamily: font.serif, fontStyle: "italic", fontSize: 14, color: c.m2, lineHeight: 1.55, marginTop: 10, maxWidth: 880, textWrap: "pretty" }}>{u.asymmetry}</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
          {rows.map((r) => (
            <div key={r.key} style={{ border: `1px solid ${c.border}`, background: c.card, borderRadius: 3, padding: "12px 14px" }}>
              <div style={{ fontFamily: font.mono, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: c.m4 }}>{r.title}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}>
                <div><span style={{ fontFamily: font.mono, fontSize: 11, fontWeight: 600, color: c.green }}>TACET</span> <span style={{ fontSize: 12.5, color: "#26231e" }}>{r.tacet}</span></div>
                <div><span style={{ fontFamily: font.mono, fontSize: 11, fontWeight: 600, color: c.m3 }}>deep research</span> <span style={{ fontSize: 12.5, color: c.m1 }}>{r.base}</span></div>
              </div>
              {(r.tacetNote || r.baseNote) && (
                <div style={{ marginTop: 9, borderTop: `1px solid ${c.borderSoft}`, paddingTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
                  {r.tacetNote && <div style={{ fontSize: 11, color: c.m2, lineHeight: 1.45 }}><span style={{ fontFamily: font.mono, fontSize: 9.5, color: c.green }}>TACET rule · </span>{r.tacetNote}</div>}
                  {r.baseNote && <div style={{ fontSize: 11, color: c.m2, lineHeight: 1.45 }}><span style={{ fontFamily: font.mono, fontSize: 9.5, color: c.m3 }}>baseline rule · </span>{r.baseNote}</div>}
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={{ fontFamily: font.mono, fontSize: 9.5, color: c.m5, marginTop: 10 }}>baseline: {u.baselineModel} · measures verifiable fidelity, not completeness</div>

        <div style={{ marginTop: 18, border: "1px solid #b9cdc4", background: "#f1f5f2", borderRadius: 4, padding: "16px 18px" }}>
          <span style={{ fontFamily: font.mono, fontWeight: 600, fontSize: 12.5, letterSpacing: "0.1em", color: c.green }}>TACET · anchored prose</span>
          <div style={{ fontFamily: font.serif, fontSize: 15.5, lineHeight: 1.6, color: "#26231e", marginTop: 11, textWrap: "pretty" }}>{cs.narrativeProse}</div>
        </div>
        <div style={{ marginTop: 22, display: "flex", justifyContent: "center" }}>
          <Link href="/" style={{ fontFamily: font.sans, fontWeight: 600, fontSize: 13.5, color: "#fff", background: c.green, border: "none", borderRadius: 3, padding: "13px 26px", textDecoration: "none" }}>run another question ↺</Link>
        </div>
      </div>
    );
  }

  // Real case without an uplift comparison (covid, freud): the TACET column only.
  if (cs.isReal && cs.hasUplift !== true && cs.narrativeProse) {
    return (
      <div style={{ marginTop: 26 }}>
        <div style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: c.m5 }}>narrative · only what the map measured</div>
        <div style={{ fontFamily: font.serif, fontSize: 24, color: "#26231e", marginTop: 4 }}>the anchored narrative — every sentence on what was measured.</div>
        <div style={{ fontSize: 13, color: c.m1, lineHeight: 1.55, marginTop: 8, maxWidth: 860 }}>
          TACET's can only say what the map measured. this case has no frozen deep-research comparison — we show the engine's deterministic prose, generated from the fixture, with no baseline column and no hallucination.
        </div>
        <div style={{ marginTop: 18, border: "1px solid #b9cdc4", background: "#f1f5f2", borderRadius: 4, padding: "18px 18px 16px" }}>
          <span style={{ fontFamily: font.mono, fontWeight: 600, fontSize: 13, letterSpacing: "0.1em", color: c.green }}>TACET</span>
          <div style={{ fontFamily: font.serif, fontSize: 16, lineHeight: 1.65, color: "#26231e", marginTop: 13, textWrap: "pretty" }}>{cs.narrativeProse}</div>
          <div style={{ fontFamily: font.mono, fontSize: 9.5, color: "#6b8077", lineHeight: 1.5, marginTop: 16, borderTop: "1px solid #d4e0da", paddingTop: 10 }}>
            certifies coherence, never truth · deterministic prose from the fixture (no free inference)
          </div>
        </div>
        <div style={{ marginTop: 22, display: "flex", justifyContent: "center" }}>
          <Link href="/" style={{ fontFamily: font.sans, fontWeight: 600, fontSize: 13.5, color: "#fff", background: c.green, border: "none", borderRadius: 3, padding: "13px 26px", textDecoration: "none" }}>
            run another question ↺
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 26 }}>
      <div style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: c.m5 }}>narrative · the visible uplift</div>
      <div style={{ fontFamily: font.serif, fontSize: 24, color: "#26231e", marginTop: 4 }}>the same sub-question, the two answers.</div>
      <div style={{ fontSize: 13, color: c.m1, lineHeight: 1.55, marginTop: 8, maxWidth: 860 }}>
        TACET's can only say what the map measured — each sentence anchors to a node, clickable. deep research's is fluent and concludes. see what each one does with the doubt.
      </div>

      <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
        {/* TACET */}
        <div style={{ border: "1px solid #b9cdc4", background: "#f1f5f2", borderRadius: 4, padding: "18px 18px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <span style={{ fontFamily: font.mono, fontWeight: 600, fontSize: 13, letterSpacing: "0.1em", color: c.green }}>TACET</span>
            <span style={{ fontFamily: font.mono, fontSize: 10.5, color: "#0F6E56", background: "#E7F3EE", border: "1px solid #bfe0d2", borderRadius: 2, padding: "3px 8px" }}>{n.tacetAnchor} anchored</span>
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
            certifies coherence, never truth · does not conclude which side is right
          </div>
        </div>

        {/* deep research */}
        <div style={{ border: `1px solid ${c.border}`, background: "#f3f0ea", borderRadius: 4, padding: "18px 18px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <span style={{ fontFamily: font.mono, fontWeight: 600, fontSize: 13, letterSpacing: "0.06em", color: c.m3 }}>deep research</span>
            <span style={{ fontFamily: font.mono, fontSize: 10.5, color: "#888780", background: "#eae4d8", border: `1px solid ${c.border}`, borderRadius: 2, padding: "3px 8px" }}>{n.drAnchor} anchored</span>
          </div>
          <div style={{ fontFamily: font.serif, fontSize: 16.5, lineHeight: 1.6, color: "#34302a", marginTop: 15, textWrap: "pretty" }}>
            {n.drText1} <span style={{ background: "#F7EEDD", borderBottom: "1px solid #BA7517", padding: "0 2px" }}>{n.drHighlight}</span> {n.drText2}{" "}
            <em style={{ fontStyle: "italic", color: c.m1 }}>{n.drConclusion}</em>
          </div>
          <div style={{ fontFamily: font.mono, fontSize: 9.5, color: "#993C1D", lineHeight: 1.5, marginTop: 16, borderTop: `1px solid ${c.borderSoft}`, paddingTop: 10 }}>
            dissolved the crux into a transition phrase · no mention of what was missing
          </div>
        </div>
      </div>

      <div style={{ marginTop: 18, background: "#EEEDFE", border: "1px solid #d6d3f4", borderLeft: "3px solid #3C3489", borderRadius: 3, padding: "15px 18px" }}>
        <div style={{ fontFamily: font.mono, fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "#3C3489", fontWeight: 600 }}>scale</div>
        <div style={{ fontFamily: font.serif, fontSize: 17, color: "#2c2960", lineHeight: 1.5, marginTop: 8, textWrap: "pretty" }}>
          the lead in anchoring may shrink with better models. the empty chair will not — it is a structural capability that the narrative-conclusive format does not have, however good the model gets.
        </div>
      </div>

      <div style={{ marginTop: 22, display: "flex", justifyContent: "center" }}>
        <Link href="/" style={{ fontFamily: font.sans, fontWeight: 600, fontSize: 13.5, color: "#fff", background: c.green, border: "none", borderRadius: 3, padding: "13px 26px", textDecoration: "none" }}>
          run another question ↺
        </Link>
      </div>
    </div>
  );
}
