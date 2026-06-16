import type { Metadata } from "next";
import type { ReactNode } from "react";
import { IBM_Plex_Sans, IBM_Plex_Mono, Newsreader } from "next/font/google";
import "./globals.css";
import { Masthead } from "./Masthead";
import { c, font } from "./tokens";

const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-sans", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono", display: "swap" });
const serif = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TACET — research engine · The Machine Unconscious",
  description: "two undecided readers, one body of evidence, and the map between them. Certifies coherence, never truth.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${serif.variable}`}>
      <body
        style={{
          minHeight: "100vh",
          background: c.bg,
          fontFamily: font.sans,
          color: c.ink,
          padding: "30px 22px 70px",
          WebkitFontSmoothing: "antialiased",
          fontFeatureSettings: "'liga' 1",
        }}
      >
        <div style={{ maxWidth: 1060, margin: "0 auto" }}>
          <Masthead />
          {children}
        </div>
      </body>
    </html>
  );
}
