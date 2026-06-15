"use client";

import { useState } from "react";
import Link from "next/link";
import { c, font, CASES } from "./tokens";

/**
 * SCREEN 0 — HOME. Literal port of the design's Home: the tagline, the hero
 * question field, the honest "live · backend not connected" note (→ POST
 * /api/run), and the four worked-case doors. The inner screens (Passo 0 →
 * Mapa → Narrativa) and the case replays are Phase 2.
 */
export default function Home() {
  const [question, setQuestion] = useState("");
  const [liveNote, setLiveNote] = useState(false);

  return (
    <div>
      {/* tagline */}
      <div style={{ marginTop: 40, maxWidth: 760 }}>
        <div style={{ fontFamily: font.serif, fontStyle: "italic", fontSize: 19, lineHeight: 1.5, color: c.m1, textWrap: "pretty" }}>
          dois leitores indecisos, uma evidência, e o mapa entre eles — onde convergem é o{" "}
          <span style={{ color: c.coreText, fontStyle: "normal" }}>núcleo robusto</span>, onde divergem é o{" "}
          <span style={{ color: c.cruxText, fontStyle: "normal" }}>crux vivo</span>, o que ninguém cobriu é a{" "}
          <span style={{ color: c.chair, fontStyle: "normal" }}>cadeira vazia</span>.
        </div>
      </div>

      {/* HERO question field */}
      <div
        style={{
          marginTop: 26,
          background: c.card,
          border: `1px solid ${c.focus}`,
          borderTop: `3px solid ${c.green}`,
          borderRadius: 4,
          padding: "26px 26px 22px",
          boxShadow: "0 2px 18px #2e5a4b14",
        }}
      >
        <label style={{ fontFamily: font.sans, fontWeight: 600, fontSize: 15, color: c.ink }}>
          faça uma pergunta <span style={{ fontWeight: 400, color: c.m2 }}>— qualquer disputa, qualquer campo</span>
        </label>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="ex.: ovos fazem mal ao coração? · a psicanálise é compatível com o marxismo? · o LHC pode criar um buraco negro?"
          style={{
            width: "100%", marginTop: 12, minHeight: 84, resize: "vertical",
            border: `1px solid ${c.borderInput}`, borderRadius: 3, background: c.input,
            padding: "14px 15px", fontFamily: font.serif, fontSize: 21, lineHeight: 1.45, color: "#26231e",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, marginTop: 14, flexWrap: "wrap" }}>
          <button
            type="button"
            style={{
              display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 500, color: c.m1,
              background: c.panel2, border: `1px solid ${c.borderInput}`, borderRadius: 3, padding: "9px 14px", cursor: "pointer",
            }}
          >
            <span style={{ fontFamily: font.mono }}>＋</span>PDF-âncora <span style={{ color: "#9a9282" }}>(opcional)</span>
          </button>
          <button
            type="button"
            onClick={() => setLiveNote(true)}
            style={{
              fontFamily: font.sans, fontWeight: 600, fontSize: 14, color: "#fff", background: c.green,
              border: "none", borderRadius: 3, padding: "12px 24px", cursor: "pointer", boxShadow: `0 1px 0 ${c.greenShadow}`,
            }}
          >
            rodar o método →
          </button>
        </div>
        <div style={{ fontFamily: font.mono, fontSize: 10.5, color: "#9a9282", marginTop: 13, letterSpacing: "0.02em" }}>
          modo ao vivo — passo 0 → colheita → dois leitores → mapa → cadeira vazia → narrativa honesta
        </div>

        {/* honest live note */}
        {liveNote && (
          <div style={{ marginTop: 16, borderTop: `1px solid ${c.borderSoft}`, paddingTop: 15, animation: "tacet-rise 280ms ease both" }}>
            <div style={{ fontFamily: font.mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.cruxText, fontWeight: 600 }}>
              modo ao vivo · backend não conectado
            </div>
            <div style={{ fontSize: 13, color: c.m1, lineHeight: 1.55, marginTop: 8, maxWidth: 680 }}>
              o ao vivo toca rede e modelos externos via{" "}
              <span style={{ fontFamily: font.mono, fontSize: 11.5, color: "#26231e" }}>POST /api/run</span> — sem resultado
              fabricado para preencher. enquanto o endpoint não está ligado, veja o método completo em um mundo já rodado:{" "}
              <span style={{ color: "#26231e" }}>offline, instantâneo, determinístico</span>.
            </div>
            <Link
              href="/caso/freud"
              style={{
                display: "inline-block", marginTop: 12, fontFamily: font.sans, fontWeight: 600, fontSize: 12.5, color: "#fff",
                background: c.green, border: "none", borderRadius: 3, padding: "9px 16px", textDecoration: "none",
              }}
            >
              percorrer o método (caso Freud · offline) →
            </Link>
          </div>
        )}
      </div>

      {/* divider to doors */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 34 }}>
        <span style={{ height: 1, background: c.rule, flex: 1 }} />
        <span style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: "0.06em", color: c.m4, whiteSpace: "nowrap" }}>
          ou veja o método em quatro mundos já rodados · offline · instantâneo
        </span>
        <span style={{ height: 1, background: c.rule, flex: 1 }} />
      </div>

      {/* four doors */}
      <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 13 }}>
        {CASES.map((d) => (
          <Link
            key={d.id}
            href={`/caso/${d.id}`}
            style={{
              textAlign: "left", textDecoration: "none", background: c.card, border: `1px solid ${c.border}`,
              borderRadius: 4, padding: "15px 15px 17px", cursor: "pointer", display: "block",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span
                style={{
                  fontFamily: font.mono, fontSize: 10, letterSpacing: "0.08em", color: d.badgeColor,
                  border: `1px solid ${d.badgeColor}55`, borderRadius: 2, padding: "2px 6px",
                }}
              >
                {d.badge}
              </span>
              {d.star && <span style={{ fontFamily: font.mono, fontSize: 9.5, color: c.green, letterSpacing: "0.06em" }}>★ prova geral</span>}
            </div>
            <div style={{ fontFamily: font.serif, fontSize: 18, color: "#26231e", marginTop: 12, lineHeight: 1.3, textWrap: "pretty" }}>
              {d.doorTitle}
            </div>
            <div style={{ fontSize: 11.5, color: c.m3, lineHeight: 1.4, marginTop: 7 }}>{d.doorSub}</div>
            <div style={{ fontFamily: font.mono, fontSize: 10, color: c.green, marginTop: 13 }}>percorrer →</div>
          </Link>
        ))}
      </div>

      <div style={{ fontFamily: font.serif, fontStyle: "italic", fontSize: 14.5, color: c.m2, lineHeight: 1.5, marginTop: 22, maxWidth: 760, textWrap: "pretty" }}>
        os quatro casos não são o produto — são a prova de que o palco aguenta qualquer ato. o produto é o campo lá em cima.
      </div>
    </div>
  );
}
