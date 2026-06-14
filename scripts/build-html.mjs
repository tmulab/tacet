// Regenerate TACET.html's replay data FROM the frozen fixture, so the visual
// page and the terminal demo read the EXACT same numbers. Plain Node (no tsx /
// esbuild). Idempotent: replaces the _cases() block, the axes-map, and the
// epigraph by stable anchors, so it runs on the design export or on a previously
// generated file. Run: npm run build:html
//
// The HTML embeds the data as a single-quoted, single-line JS object literal
// (no double quotes, no newlines, no backslashes) so it slots safely into the
// document string of the Claude Design export without re-escaping.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const HTML = resolve(ROOT, "TACET.html");
const FIXTURE = resolve(ROOT, "fixtures/replay/sago-origin-v0.1.json");

const fixture = JSON.parse(readFileSync(FIXTURE, "utf8"));
const claimById = Object.fromEntries(fixture.claims.map((c) => [c.id, c]));
const profById = Object.fromEntries(fixture.derived.reliabilityProfiles.map((p) => [p.claimId, p]));
const A = fixture.readers["reader-a"];
const B = fixture.readers["reader-b"];

// The three claims, one per outcome the engine distinguishes.
const CRUX = "10.12688/f1000research.72956.3"; // GLM contradicts vs M2.7 insufficient
const ROBUST = "10.14202/vetworld.2021.190-199"; // supports/supports zoonosis
const EMPTY = "10.14293/s2199-1006.1.sor-.pp4vz1s.v1"; // none, insufficient/insufficient, fallback in a slot

const providerOf = (model) =>
  /glm/i.test(model) ? "Z.AI" : /minimax/i.test(model) ? "MiniMax" : /gemma/i.test(model) ? "Google · reserve" : model;
const isFallback = (model) => /gemma/i.test(model);
const axisVal = (ax) => (ax && ax.kind === "measured" ? ax.value : null);
// JS-literal helpers (single-quoted; apostrophes → curly so no escaping needed).
const q = (s) => "'" + String(s).replace(/'/g, "’") + "'";
const lit = (v) => (v === null || v === undefined ? "null" : typeof v === "string" ? q(v) : String(v));

function caseLiteral(docKey, claimId, ed) {
  const c = claimById[claimId];
  const p = profById[claimId];
  if (!c || !p || !A[claimId] || !B[claimId]) throw new Error(`missing fixture data for ${claimId}`);
  const a = A[claimId];
  const b = B[claimId];
  const reader = (role, slot, anchor, rationale) =>
    `{ role: ${q(role)}, occupant: ${q(slot.model)}, provider: ${q(providerOf(slot.model))}, ` +
    `lean: ${q(slot.lean)}, anchor: ${q(anchor)}, rationale: ${q(rationale)}` +
    (isFallback(slot.model) ? `, fallback: true` : ``) +
    ` }`;
  const axes =
    `{ trace: ${lit(axisVal(p.traceability))}, corrob: ${lit(axisVal(p.independentCorroboration))}, ` +
    `contest: ${lit(axisVal(p.internalContestation))}, agree: ${lit(axisVal(p.agreementFromDoubt))} }`;
  return (
    `${q(docKey)}: { kind: ${q(ed.kind)}, descriptor: ${q(c.text + " (DOI: " + claimId + ")")}, ` +
    `verdict: { kicker: ${q(ed.kicker)}, label: ${q(ed.label)}, sub: ${q(ed.sub)}, tone: ${q(ed.tone)} }, ` +
    `readers: [ ${reader("Reader 1", a, ed.anchorA, ed.ratA(a))}, ${reader("Reader 2", b, ed.anchorB, ed.ratB(b))} ], ` +
    `axes: ${axes} }`
  );
}

const cases =
  "{ " +
  [
    caseLiteral("doc-1", CRUX, {
      kind: "tension",
      tone: "#b07d2b",
      kicker: "point of tension",
      label: "Divergence — a genuine crux.",
      sub: "One model reads against the zoonosis-primacy clause; the other withholds on the lab clause. The disagreement is real, not noise — internal contestation lights up even though the overall signal is unsupported.",
      anchorA: "clause 1 · zoonosis primacy",
      anchorB: "clause 2 · lab not excluded",
      ratA: (s) => `${s.model} → contradicts: against the zoonosis-primacy clause, this evidence runs counter to the reference hypothesis.`,
      ratB: (s) => `${s.model} → insufficient: on the lab-concession clause the same evidence does not move the lean.`,
    }),
    caseLiteral("doc-2", ROBUST, {
      kind: "robust",
      tone: "#4a6b50",
      kicker: "robust core",
      label: "Convergence — a robust core.",
      sub: "Two independently trained models, the same evidence, the same clause, the same lean — agreement reached separately is the strongest signal the audit can record.",
      anchorA: "clause 1 · zoonosis primacy",
      anchorB: "clause 1 · zoonosis primacy",
      ratA: (s) => `${s.model} → supports: the documented zoonotic relatives reinforce the better-supported clause.`,
      ratB: (s) => `${s.model} → supports: convergent reading of the same evidence, reached independently.`,
    }),
    caseLiteral("doc-3", EMPTY, {
      kind: "empty",
      tone: "#7a746a",
      kicker: "empty chair",
      label: "No contact — an empty chair.",
      sub: "The document is off-topic to origin; both readers withhold for the same reason — absence of contact. The first slot's primary failed, so the reserve was swapped in and logged. Recorded as a coverage gap, never disguised as a finding.",
      anchorA: "no clause",
      anchorB: "no clause",
      ratA: (s) => `${s.model} (reserve, swapped into this slot after the primary failed) → insufficient: nothing here touches the origin question.`,
      ratB: (s) => `${s.model} → insufficient: no contact with either clause — insufficient by absence, not by weak evidence.`,
    }),
  ].join(", ") +
  " }";

// Categorical-aware axes map: v may be boolean | number | string | null. null →
// "not measured"; the bar is a presence cue (positive value → full); valLabel is
// the EXACT fixture value, matching the terminal demo. Single line, single quotes.
const axesMap =
  "const defs = this._axisDefs(); const axes = defs.map(function(d){ " +
  "var v = c.axes[d.key]; var measured = v !== null && v !== undefined; " +
  "var positive = v === true || (typeof v === 'number' && v > 0) || (typeof v === 'string' && v.length > 0); " +
  "var lit = d.key === 'contest' && v === true; var barColor = lit ? accent : '#3a3631'; " +
  "var valLabel = !measured ? 'not measured' : (typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v)); " +
  "return { name: d.name, gloss: d.gloss, lit: lit, nameColor: lit ? accent : '#1c1a17', " +
  "trackBg: measured ? '#efe9dd' : 'repeating-linear-gradient(135deg,#efe9dd,#efe9dd 5px,#e6dfd1 5px,#e6dfd1 10px)', " +
  "barWidth: (measured && filled && positive) ? '100%' : '0%', barColor: barColor, " +
  "barShadow: (lit && filled) ? ('0 0 8px ' + accent + '66') : 'none', valLabel: valLabel, " +
  "valColor: measured ? '#26231e' : '#a39a8a', valStyle: measured ? 'normal' : 'italic', " +
  "valSize: measured ? '13px' : '11px' }; }); ";

function replaceSpan(s, startAnchor, endAnchor, replacement, label) {
  const i = s.indexOf(startAnchor);
  if (i === -1) throw new Error(`anchor not found (start): ${label}`);
  const j = s.indexOf(endAnchor, i + startAnchor.length);
  if (j === -1) throw new Error(`anchor not found (end): ${label}`);
  return s.slice(0, i) + replacement + s.slice(j);
}

let html = readFileSync(HTML, "utf8");

// 1) _cases() body → real data (idempotent: bounded by the two anchors).
html = replaceSpan(
  html,
  "_cases() {",
  "_accent() { return this.props",
  `_cases() { return ${cases}; }  `,
  "_cases",
);

// 2) axes map → categorical-aware (bounded by these anchors).
html = replaceSpan(html, "const defs = this._axisDefs();", "// mode buttons", axesMap + "    ", "axes-map");

// 3) Epigraph: the two SAGO clauses + attribution (first-run string swaps).
const swaps = [
  ["Position&nbsp;P", "natural zoonotic spillover"],
  ["Position&nbsp;Q", "a research-related (laboratory) accident"],
  ["Reference Body · Working Group", "World Health Organization · SAGO"],
  ["CC BY-NC-SA<", "CC BY-NC-SA 3.0 IGO<"],
];
for (const [from, to] of swaps) html = html.split(from).join(to);

writeFileSync(HTML, html);

// Report
const show = (id) => {
  const p = profById[id];
  return `${id}\n    A=${A[id].model} ${A[id].lean} | B=${B[id].model} ${B[id].lean}` +
    ` | axes trace=${axisVal(p.traceability)} corrob=${axisVal(p.independentCorroboration)} contest=${axisVal(p.internalContestation)} agree=${axisVal(p.agreementFromDoubt)}`;
};
console.log("wrote TACET.html with real fixture data:");
console.log("  doc-1 crux   ", show(CRUX));
console.log("  doc-2 robust ", show(ROBUST));
console.log("  doc-3 empty  ", show(EMPTY));
