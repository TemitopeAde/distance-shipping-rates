import { loadFont } from "@remotion/google-fonts/Roboto";

// Hex twins of the oklch tokens in src/styles/globals.css (via marketing/app-market/src/base.css).
// Anything that animates must be hex: interpolateColors cannot parse oklch() or color-mix().
export const color = {
  brand: "#0462d3",
  brandDeep: "#0145a7",
  background: "#f9fafb",
  foreground: "#131922",
  card: "#ffffff",
  muted: "#eff2f6",
  mutedFg: "#5c646f",
  accent: "#e6effc",
  accentFg: "#112d55",
  success: "#1c985a",
  successSoft: "#d5f9e0",
  successText: "#005f2e",
  destructiveSoft: "#ffe7e4",
  destructiveText: "#bb0916",
  border: "#dde2e6",
  sidebar: "#fbfcfd",
  sidebarFg: "#282e38",
  sidebarAccentFg: "#073777",
  mapBg: "#e1e9f2",
  park: "#beecc6",
  pin: "#de3e2d",
  chromeDot: "#d3d8de",
  optOn: "#eff6ff",
  radioOff: "#a9afb4",
  phone: "#0f172a",
  pay: "#111827",
  // Punchline text on the brand blue: soft words, then white accent words.
  onBrandSoft: "#bcd3f5",
  white: "#ffffff",
} as const;

const { fontFamily } = loadFont("normal", { weights: ["400", "500", "600", "700", "800", "900"], subsets: ["latin"] });
export const font = fontFamily;

/** Critically damped: settles without overshoot, like the dashboard's own transitions. */
export const settle = { stiffness: 170, damping: 26 };
export const quick = { stiffness: 320, damping: 36 };
