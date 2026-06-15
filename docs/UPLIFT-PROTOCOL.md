# UPLIFT PROTOCOL — reproducing the TACET vs deep-research comparison

> The competition bar (judge note 1): run deep-research on the same sub-question
> and ask whether TACET is *meaningfully better than that*. This protocol hands
> the judge the instrument to decide — it does **not** crown TACET the winner.

TACET measures **coherence, not truth**. This comparison measures **verifiable
fidelity**, not **completeness**. Read the asymmetry below before the numbers.

---

## The asymmetry (named, not hidden)

Deep-research reads **everything** — paywalled papers, books, non-CC-BY sources —
and weaves them into fluent prose, **without verifiable provenance** and often
mixing topic facts with free inference. TACET reads **only the open CC-BY corpus**,
carries **DOI provenance** for every claim, and **abstains** where the open
evidence does not bear.

On **completeness, deep-research wins.** This comparison does not contest that. It
measures the four crit-1 axes where TACET's discipline is the advantage.

---

## The four rubric dimensions

| Dimension | Method | What it asks |
|---|---|---|
| **Verifiability** | deterministic | Fraction of cited sources that **resolve**, in two layers: **landing** (the page is reachable) and **registered** (the DOI exists in the DOI system, bypassing publisher link rot). |
| **Uncertainty preservation** | semi-deterministic | Does the output **name what it does not know**? (TACET abstentions; baseline hedge vs verdict markers, EN+PT.) |
| **Load-bearing visibility** | judge | Can you **see which evidence carries the conclusion**? |
| **Hidden-dependency disclosure** | judge + deterministic signal | Does it **warn** when a load-bearing source is non-verifiable/paywalled? Signal: baseline cites sources TACET marked out-of-CC-BY. |

The two deterministic axes (verifiability, the hidden-dependency *signal*) are
computed and frozen. The two judge axes ship as a **blank rubric** — the artifact
declares **no winner** on them.

---

## How the judge reproduces it

1. **The sub-question.** Use the exact `referenceHypothesis` string frozen in the
   case fixture (`fixtures/replay/lhc-anchored-ingested-v0.1.json`,
   `fixtures/replay/eggs-cv-v0.1.json`) — the same string TACET's baseline used.
   Do not reformulate it.

2. **Run your own deep-research.** Any provider — Perplexity Sonar, OpenAI o-series
   deep research, Gemini, a ChatGPT Deep Research run. Our frozen baseline is
   `perplexity/sonar-deep-research` via OpenRouter (see `fixtures/baseline/`), a
   **reproducible reference point, not the SOTA ceiling.** You are expected to
   beat it with a stronger model; the comparison axes still apply.

3. **Apply the rubric.**
   - *Verifiability*: extract the citations from your deep-research output, check
     how many resolve. Compare to TACET's frozen fraction.
   - *Uncertainty*: count where your output hedges vs delivers a verdict; compare
     to TACET's abstention count (unsupported + empty chairs + not-measured +
     not-assessed).
   - *Load-bearing visibility* & *Hidden-dependency*: read both outputs and fill
     the blank rubric. For hidden-dependency, check whether your deep-research
     leans on sources outside the open corpus **without saying so**.

4. **Where the determinstic numbers live.** `fixtures/comparison/lhc-uplift-v0.1.json`
   and `eggs-uplift-v0.1.json`. Replay them offline:
   `npm run demo:replay -- uplift-lhc` / `-- uplift-eggs`.

---

## What our frozen baseline showed (regenerate to confirm)

- **LHC.** The baseline's safety case leans on **Giddings & Mangano** and the LSAG
  review — including the **exact preprints (arXiv 0806.3381, 0808.1415) TACET
  ingested as out-of-CC-BY** — alongside a **blog, a YouTube video, and Wikipedia**.
  Every cited URL resolves (verifiability 1.00), but the load-bearing sources are
  precisely the non-open ones TACET flags as the **empty chair**. Whether the
  baseline *disclosed* that dependency is the judge's call. TACET's own
  verifiability is **registered 1.00 / landing 0.967** — every cited DOI is
  registered; the single landing miss is **link rot** on one Global-Journals DOI
  (`10.34257/gjsfrfvol24is2pg7`, page 404 but DOI registered), named in the
  comparison's `verifiability.note`. That is the two layers doing their job:
  existence vs link rot, kept distinct rather than blurred into one number.
- **eggs.** The baseline produced fluent prose with **zero resolvable citations**
  (verifiability 0.00) while TACET traces every claim to a DOI (1.00). Both hedge
  heavily in prose; the difference is whether the hedging is **anchored**.

Reproduce both with your own deep-research and decide. The numbers are ours to
compute; the verdict is yours.
