import { AbsoluteFill } from "remotion";

import { cursorAt, UserCursor, type CursorKey } from "../kit/cursor";
import { TargetLog } from "../kit/debug";
import { Punchlines, type Card } from "../kit/punchlines";
import { clamp01, useTime } from "../kit/time";
import { color, font } from "../tokens";
import { CheckoutScene, EndCard, MapScene, Opening, PriceTraveler, RulesScene, rulesCursor as R, SimulatorScene, simCursor as S, ZonesScene } from "./acts";
import { b } from "./cues";
import { L } from "./layout";
import { css } from "./ui";

const w = (text: string, at: number, accent = false) => ({ text, at, accent });

const cards: Card[] = [
  { lines: [[w("Distance-Based", b(2, 2), true)], [w("Shipping", b(2, 2, 0.5), true), w("&", b(2, 3), true), w("Delivery", b(2, 3, 0.5), true)]], out: b(3) - 0.14, y: 800, size: 92 },
  { lines: [[w("Priced", b(3, 1)), w("by", b(3, 1, 0.5)), w("real", b(3, 2), true)], [w("road", b(3, 2, 0.5), true), w("distance.", b(3, 3), true)]], out: b(4) - 0.14, y: 540, size: 140 },
  { lines: [[w("Your", b(6, 1)), w("rates.", b(6, 2), true)], [w("Your", b(6, 3)), w("rules.", b(6, 4), true)]], out: b(7) - 0.14, y: 540, size: 150 },
  { lines: [[w("Deliver", b(10, 1)), w("only", b(10, 2))], [w("where", b(10, 2, 0.5)), w("you", b(10, 3), true), w("want.", b(10, 3, 0.5), true)]], out: b(11) - 0.14, y: 540, size: 140 },
  { lines: [[w("Preview", b(13, 1)), w("any", b(13, 2))], [w("address.", b(13, 3), true)]], out: b(14) - 0.14, y: 540, size: 150 },
];

/** Left-aligned headline beside the checkout phone. */
function CheckoutLine({ t }: { t: number }) {
  if (t < b(16) || t > b(18)) return null;
  const words: [string, number, boolean][] = [["Exact", b(16, 2), false], ["delivery", b(16, 2, 0.5), false], ["prices,", b(16, 3), false], ["live", b(16, 4), true], ["at", b(16, 4, 0.5), true], ["checkout.", b(17, 1), true]];
  const leave = clamp01((t - (b(18) - 0.14)) / 0.14);
  return (
    <div style={{ position: "absolute", left: 150, top: 540, translate: "0 -50%", width: 960, fontFamily: font, fontSize: 112, fontWeight: 800, lineHeight: 1.08, letterSpacing: -2, opacity: 1 - leave }}>
      {[words.slice(0, 2), words.slice(2, 3), words.slice(3)].map((line, i) => (
        <div key={i} style={{ display: "flex", gap: "0.26em" }}>
          {line.map(([text, at, accent]) => {
            const u = clamp01((t - at) / 0.3);
            const e = 1 - Math.pow(1 - u, 3);
            return <span key={text} style={{ color: accent ? color.white : color.onBrandSoft, opacity: e, filter: e < 1 ? `blur(${(1 - e) * 16}px)` : undefined, translate: `0 ${(1 - e) * 36}px` }}>{text}</span>;
          })}
        </div>
      ))}
    </div>
  );
}

const c = L.cursor;
const off = { x: 1980, y: 1140 };
const cursorKeys: CursorKey[] = [
  { t: 0, ...off },
  { t: b(7, 1), ...off },
  { t: R.open, ...c.ruleRow, click: true },
  { t: R.base.click, ...c.baseFee, click: true },
  { t: R.rate.click, ...c.rate, click: true },
  { t: R.max.click, ...c.maxDistance, click: true },
  { t: R.save, ...c.save, click: true },
  { t: b(10) - 0.2, x: c.save.x + 30, y: c.save.y + 20 },
  { t: b(14), x: c.street.x + 260, y: c.street.y + 300 },
  { t: S.street.click, ...c.street, click: true },
  { t: S.calc, ...c.calculate, click: true },
  { t: b(15, 2), x: c.calculate.x + 60, y: c.calculate.y + 40 },
];

function Cursor({ t }: { t: number }) {
  const visible = (t >= b(7) && t < b(10) - 0.15) || (t >= b(14) && t < b(16));
  if (!visible) return null;
  const { x, y, squash } = cursorAt(t, cursorKeys, (px, py) => ({ x: px, y: py }));
  return <div style={{ position: "absolute", inset: 0, scale: "1.5", transformOrigin: `${x}px ${y}px` }}><UserCursor x={x} y={y} squash={squash} /></div>;
}

export function Launch({ debug = false }: { debug?: boolean }) {
  const t = useTime();
  const traveling = t >= L.travel.start && t < L.travel.land;
  return (
    <AbsoluteFill style={{ background: color.brand, overflow: "hidden" }}>
      <style>{css}</style>
      <Opening t={t} />
      <MapScene t={t} />
      <RulesScene t={t} />
      <ZonesScene t={t} />
      <SimulatorScene t={t} hideTotal={t >= L.travel.start} />
      <CheckoutScene t={t} showPrice={t >= L.travel.land} />
      <CheckoutLine t={t} />
      <EndCard t={t} />
      <Punchlines t={t} cards={cards} theme={{ font, color: color.onBrandSoft, accent: color.white, weight: 800 }} />
      {traveling ? <PriceTraveler t={t} /> : null}
      <Cursor t={t} />
      {debug ? <TargetLog /> : null}
    </AbsoluteFill>
  );
}
