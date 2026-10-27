import type { CSSProperties, ReactNode } from "react";
import {
  Activity, BadgeCheck, ChevronDown, CircleCheck, CircleHelp, CircleX, CreditCard, Gauge, LayoutDashboard,
  ListOrdered, Loader2, Lock, Map as MapIcon, MapPin, Package, Plug, Plus, Route, Search, Settings, ShieldCheck,
  Sparkles, Store, Truck,
} from "lucide-react";

import { color, font } from "../tokens";
import { clamp01 } from "../kit/time";

// Twin of marketing/app-market/src/base.css, which copies the dashboard tokens.
// The dashboard window is laid out at the listing's CSS size and scaled up as a whole.
export const css = `
.ui { font-family: ${font}; color: ${color.foreground}; -webkit-font-smoothing: antialiased; }
.ui * { box-sizing: border-box; margin: 0; padding: 0; }
.ui .ic { flex-shrink: 0; display: inline-block; vertical-align: middle; }
.ui .side { width: 232px; background: ${color.sidebar}; border-right: 1px solid ${color.border}; padding: 18px 14px; display: flex; flex-direction: column; gap: 14px; flex-shrink: 0; }
.ui .logo { display: flex; align-items: center; gap: 10px; padding: 0 6px; font-weight: 700; font-size: 14px; line-height: 1.2; }
.ui .logo b { width: 34px; height: 34px; border-radius: 9px; background: ${color.brand}; color: #fff; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.ui .nav { list-style: none; display: grid; gap: 2px; }
.ui .nav li { display: flex; align-items: center; gap: 11px; padding: 9px 12px; border-radius: 8px; color: ${color.sidebarFg}; font-weight: 500; font-size: 14.5px; }
.ui .nav li.on { background: ${color.accent}; color: ${color.sidebarAccentFg}; }
.ui .main { flex: 1; padding: 26px 30px; display: flex; flex-direction: column; gap: 18px; min-width: 0; position: relative; }
.ui .ph h2 { font-size: 24px; font-weight: 700; letter-spacing: -.3px; }
.ui .ph p { color: ${color.mutedFg}; margin-top: 4px; font-size: 14.5px; }
.ui .row { display: flex; gap: 16px; }
.ui .card { background: #fff; border: 1px solid ${color.border}; border-radius: 12px; padding: 18px 20px; }
.ui .card h3 { font-size: 15.5px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
.ui .muted { color: ${color.mutedFg}; }
.ui .badge { display: inline-flex; align-items: center; gap: 5px; border-radius: 999px; padding: 3px 10px; font-size: 12.5px; font-weight: 600; white-space: nowrap; }
.ui .badge.ok { background: ${color.successSoft}; color: ${color.successText}; }
.ui .badge.soft { background: ${color.muted}; color: ${color.sidebarFg}; }
.ui .badge.info { background: ${color.accent}; color: ${color.accentFg}; }
.ui .badge.bad { background: ${color.destructiveSoft}; color: ${color.destructiveText}; }
.ui .btn { display: inline-flex; align-items: center; gap: 7px; border-radius: 8px; padding: 9px 15px; font-weight: 600; font-size: 14px; background: ${color.brand}; color: #fff; white-space: nowrap; }
.ui .btn.out { background: #fff; color: ${color.foreground}; border: 1px solid ${color.border}; }
.ui .field { display: grid; gap: 6px; }
.ui .field label { font-size: 13.5px; font-weight: 600; }
.ui .input { border: 1px solid ${color.border}; border-radius: 8px; padding: 9px 12px; background: #fff; font-size: 15px; display: flex; align-items: center; gap: 8px; min-height: 40px; white-space: nowrap; }
.ui .input.focus { border-color: ${color.brand}; box-shadow: 0 0 0 3px #0462d333; }
.ui .input .unit { margin-left: auto; color: ${color.mutedFg}; font-size: 13px; }
.ui .hint { font-size: 12.5px; color: ${color.mutedFg}; }
.ui table { width: 100%; border-collapse: collapse; }
.ui th { white-space: nowrap; text-align: left; font-size: 12.5px; font-weight: 600; color: ${color.mutedFg}; padding: 0 10px 10px; border-bottom: 1px solid ${color.border}; }
.ui td { white-space: nowrap; padding: 12px 10px; border-bottom: 1px solid ${color.border}; font-size: 14.5px; }
.ui tr:last-child td { border-bottom: 0; }
.ui .num { font-variant-numeric: tabular-nums; }
.ui code { font-family: ui-monospace, Menlo, monospace; font-size: 13px; background: ${color.muted}; border-radius: 5px; padding: 2px 6px; }
`;

export const icons = {
  truck: Truck, "layout-dashboard": LayoutDashboard, "map-pin": MapPin, "list-ordered": ListOrdered, map: MapIcon,
  gauge: Gauge, plug: Plug, activity: Activity, "credit-card": CreditCard, settings: Settings, help: CircleHelp,
  sparkles: Sparkles, "circle-check": CircleCheck, route: Route, plus: Plus, store: Store, package: Package,
  "shield-check": ShieldCheck, "badge-check": BadgeCheck, "chevron-down": ChevronDown, lock: Lock, "circle-x": CircleX,
  search: Search, loader: Loader2,
};

export function I({ n, s = 16, style }: { n: keyof typeof icons; s?: number; style?: CSSProperties }) {
  const Icon = icons[n];
  return <Icon className="ic" size={s} strokeWidth={2} style={style} />;
}

const NAV: [string, keyof typeof icons, string][] = [
  ["overview", "layout-dashboard", "Overview"],
  ["locations", "map-pin", "Locations"],
  ["rules", "list-ordered", "Pricing rules"],
  ["zones", "map", "Delivery zones"],
  ["simulator", "gauge", "Rate simulator"],
  ["checkout", "plug", "Checkout integration"],
  ["logs", "activity", "Calculations & logs"],
  ["billing", "credit-card", "Billing"],
  ["settings", "settings", "Settings"],
  ["help", "help", "Help"],
];

/** Sidebar from AppShell.tsx, as in marketing/app-market/src/shell.js. */
export function Sidebar({ active }: { active: string }) {
  return (
    <aside className="side">
      <div className="logo"><b><I n="truck" s={18} /></b><span>Distance-Based Shipping &amp; Delivery</span></div>
      <div style={{ padding: "0 6px" }}><span className="badge ok"><I n="circle-check" s={13} />Live at checkout</span></div>
      <ul className="nav">
        {NAV.map(([id, icon, label]) => <li key={id} className={id === active ? "on" : ""}><I n={icon} />{label}</li>)}
      </ul>
    </aside>
  );
}

// The dashboard window: 1056 CSS px wide (the listing's size), scaled to the film.
export const WIN = { w: 1056, h: 700, scale: 1.6 };
export const winLeft = (1920 - WIN.w * WIN.scale) / 2;
export const winTop = 96;

export function Window({ active, y = 0, opacity = 1, children }: { active: string; y?: number; opacity?: number; children: ReactNode }) {
  return (
    <div
      className="ui"
      style={{
        position: "absolute", left: winLeft, top: winTop, width: WIN.w, height: WIN.h, scale: String(WIN.scale),
        transformOrigin: "0 0", translate: `0 ${y}px`, opacity,
        background: color.background, borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column", fontSize: 15,
        boxShadow: "0 30px 80px rgba(10, 20, 60, .35), 0 0 0 1px rgba(255,255,255,.15)",
      }}
    >
      <div style={{ height: 38, background: "#fff", borderBottom: `1px solid ${color.border}`, display: "flex", alignItems: "center", gap: 8, padding: "0 16px", flexShrink: 0 }}>
        {[0, 1, 2].map((i) => <span key={i} style={{ width: 11, height: 11, borderRadius: "50%", background: color.chromeDot }} />)}
      </div>
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <Sidebar active={active} />
        <div className="main">{children}</div>
      </div>
    </div>
  );
}

/** Text typed between `start` and `end`, one character at a time. */
export function typed(text: string, t: number, start: number, end: number) {
  return text.slice(0, Math.round(text.length * clamp01((t - start) / (end - start))));
}

/** A text input: old value selected on click, then replaced by typing. Caret blinks on a frame-driven clock. */
export function Field({
  label, t, click, type, from = "", to, prefix, unit, icon, target, width,
}: {
  label?: string; t: number; click?: number; type?: [number, number]; from?: string; to: string;
  prefix?: string; unit?: string; icon?: ReactNode; target?: string; width?: number;
}) {
  const focused = click !== undefined && t >= click && (type ? t < type[1] + 0.6 : true);
  const selected = click !== undefined && type && t >= click && t < type[0];
  const value = !type || t < type[0] ? from : typed(to, t, type[0], type[1]);
  const typing = type && t >= type[0] && t < type[1];
  const caret = focused && !selected && (typing || Math.floor(t * 2.4) % 2 === 0);
  return (
    <div className="field" style={{ width }}>
      {label ? <label>{label}</label> : null}
      <div className={`input num${focused ? " focus" : ""}`} data-target={target}>
        {icon}
        {prefix ? <span>{prefix}</span> : null}
        <span style={{ background: selected ? "#0462d340" : undefined, borderRadius: 2 }}>{value}</span>
        {caret ? <span style={{ width: 1.5, height: 18, background: color.foreground, marginLeft: -7 }} /> : null}
        {unit ? <span className="unit">{unit}</span> : null}
      </div>
    </div>
  );
}

// Street map from marketing/app-market/src/map.js, drawn in SVG units.
const COLS = [-300, -150, 0, 150, 300, 470, 620, 780, 920, 1070, 1220];
const ROWS = [-260, -130, 0, 130, 260, 400, 540, 680, 820, 960, 1100];
const ROUTE = "M150 680 L150 540 L300 540 L300 400 L470 400 L470 260 L780 260 L780 130";

export function StreetMap({
  w, h, viewBox, draw, store, pin, chip, chipMiles,
}: { w: number; h: number; viewBox: string; draw: number; store: number; pin: number; chip?: number; chipMiles?: number }) {
  const blocks = [];
  for (let c = 0; c < COLS.length - 1; c++)
    for (let r = 0; r < ROWS.length - 1; r++) {
      if ((c === 5 || c === 6) && r === 3) continue;
      blocks.push(<rect key={`${c}-${r}`} x={COLS[c] + 14} y={ROWS[r] + 14} width={COLS[c + 1] - COLS[c] - 28} height={ROWS[r + 1] - ROWS[r] - 28} rx={14} fill="#fff" />);
    }
  const dash = { strokeDasharray: "1 1", strokeDashoffset: 1 - draw, opacity: draw > 0.001 ? 1 : 0 };
  return (
    <svg width={w} height={h} viewBox={viewBox} preserveAspectRatio="xMidYMid slice" style={{ display: "block" }}>
      <rect x={-400} y={-400} width={1800} height={1600} fill={color.mapBg} />
      {blocks}
      <rect x={484} y={144} width={282} height={102} rx={14} fill={color.park} />
      <path d={ROUTE} pathLength={1} fill="none" stroke="#fff" strokeWidth={30} strokeLinejoin="round" strokeLinecap="round" style={dash} />
      <path d={ROUTE} pathLength={1} fill="none" stroke={color.brand} strokeWidth={16} strokeLinejoin="round" strokeLinecap="round" style={dash} />
      <g transform={`translate(150 680) scale(${store})`}>
        <circle r={38} fill={color.brandDeep} stroke="#fff" strokeWidth={8} />
        <g transform="translate(-18 -18) scale(1.5)">
          <Store size={24} color="#fff" strokeWidth={2} />
        </g>
      </g>
      <g transform={`translate(780 ${130 - (1 - pin) * 120})`} opacity={clamp01(pin * 3)}>
        <path d="M0 0 C -40 -50 -46 -60 -46 -86 A46 46 0 1 1 46 -86 C 46 -60 40 -50 0 0Z" fill={color.pin} stroke="#fff" strokeWidth={7} />
        <circle cy={-88} r={16} fill="#fff" />
      </g>
      {chip !== undefined ? (
        <g transform={`translate(320 440)`} opacity={chip} style={{ filter: "drop-shadow(0 8px 18px rgba(20,30,70,.18))" }}>
          <rect x={-4} y={-4} width={238} height={74} rx={37} fill="#fff" />
          <circle cx={33} cy={33} r={25} fill={color.accent} />
          <g transform="translate(19 19) scale(1.15)"><Route size={24} color={color.brand} strokeWidth={2} /></g>
          <text x={72} y={31} fontFamily={font} fontSize={26} fontWeight={700} fill={color.foreground} style={{ fontVariantNumeric: "tabular-nums" }}>
            {(chipMiles ?? 12.4).toFixed(1)} mi
          </text>
          <text x={72} y={56} fontFamily={font} fontSize={18} fill={color.mutedFg}>road distance</text>
        </g>
      ) : null}
    </svg>
  );
}

/** Truck in a white tile with the route, from marketing/app-market/src/icon.html. Draws on from `draw`. */
export function AppMark({ size, tile, truck, route, dot, pin }: { size: number; tile: number; truck: number; route: number; dot: number; pin: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 1000 1000" style={{ overflow: "visible", display: "block" }}>
      <path d="M250 760 L250 600 L500 600 L500 400 L750 400 L750 300" pathLength={1} fill="none" stroke="#fff" strokeWidth={40} strokeLinecap="round" strokeLinejoin="round"
        style={{ strokeDasharray: "1 1", strokeDashoffset: 1 - route, opacity: route > 0.001 ? 1 : 0 }} />
      <g transform={`translate(250 760) scale(${dot})`}>
        <circle r={64} fill="#fff" />
        <circle r={26} fill={color.brandDeep} />
      </g>
      <g transform={`translate(750 ${300 - (1 - pin) * 160})`} opacity={clamp01(pin * 3)}>
        <path d="M0 0 C -58 -72 -66 -86 -66 -124 A66 66 0 1 1 66 -124 C 66 -86 58 -72 0 0Z" fill={color.pin} stroke="#fff" strokeWidth={14} />
        <circle cy={-126} r={24} fill="#fff" />
      </g>
      <g transform={`translate(500 600) scale(${tile}) translate(-500 -600)`}>
        <rect x={356} y={456} width={288} height={288} rx={72} fill="#fff" style={{ filter: "drop-shadow(0 24px 40px rgba(10,20,60,.35))" }} />
        <g transform="translate(404 504) scale(8)" fill="none" stroke={color.brand} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
          style={{ strokeDasharray: "1 1" }}>
          {[
            "M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2", "M15 18H9",
            "M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14",
          ].map((d) => <path key={d} d={d} pathLength={1} style={{ strokeDashoffset: 1 - truck }} />)}
          <circle cx={17} cy={18} r={2} pathLength={1} style={{ strokeDashoffset: 1 - truck }} />
          <circle cx={7} cy={18} r={2} pathLength={1} style={{ strokeDashoffset: 1 - truck }} />
        </g>
      </g>
    </svg>
  );
}
