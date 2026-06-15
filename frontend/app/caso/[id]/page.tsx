import { notFound } from "next/navigation";
import Link from "next/link";
import { c, font, CASES } from "../../tokens";
import { StepBar } from "../../StepBar";

/**
 * A worked case (offline replay). SKELETON STUB: validates the case id, shows the
 * step bar, and marks the inner screens (Passo 0 → Colheita → Dois leitores →
 * Mapa + cadeira vazia → Narrativa) as Phase 2. The replay data comes from the
 * domain core's frozen fixtures (../../../src + fixtures/replay) when wired.
 */
export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = CASES.find((cs) => cs.id === id);
  if (!found) notFound();

  return (
    <div style={{ marginTop: 4 }}>
      <StepBar current="passo-0" />

      <div style={{ marginTop: 30, maxWidth: 760 }}>
        <div style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: c.m5 }}>
          caso · {found.id} · offline
        </div>
        <div style={{ fontFamily: font.serif, fontSize: 24, color: "#26231e", marginTop: 4, lineHeight: 1.3 }}>
          {found.doorTitle}
        </div>
        <div style={{ fontSize: 13, color: c.m1, lineHeight: 1.55, marginTop: 10 }}>{found.doorSub}</div>

        <div
          style={{
            marginTop: 22, background: c.panel, border: `1px solid ${c.border}`, borderTop: `3px solid ${c.crux}`,
            borderRadius: 3, padding: "16px 18px",
          }}
        >
          <div style={{ fontFamily: font.mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.cruxText, fontWeight: 600 }}>
            esqueleto · Phase 2
          </div>
          <div style={{ fontSize: 13.5, color: c.m1, lineHeight: 1.55, marginTop: 8 }}>
            as cinco telas internas — passo 0, colheita, dois leitores, mapa + cadeira vazia, narrativa — entram aqui,
            lendo os leans congelados do <span style={{ fontFamily: font.mono, fontSize: 11.5, color: "#26231e" }}>fixtures/replay</span> via o
            domínio puro. nada de máquina vira resultado sem dado real por trás.
          </div>
          <Link
            href="/"
            style={{
              display: "inline-block", marginTop: 14, fontFamily: font.sans, fontWeight: 600, fontSize: 12.5,
              color: c.m1, background: c.panel2, border: `1px solid ${c.borderInput}`, borderRadius: 3,
              padding: "9px 16px", textDecoration: "none",
            }}
          >
            ← voltar
          </Link>
        </div>
      </div>
    </div>
  );
}
