import { b } from "./cues";

// Screen positions (1920x1080). Values marked "measured" come from debug stills (TargetLog).
export const L = {
  phone: { x: 1232, y: 90, scale: 1.25 },
  travel: {
    start: b(16),
    land: b(16, 3),
    // measured: simulator total (right edge, center y) and phone option price.
    from: { right: 1683, y: 820, size: 18 * 1.6 },
    to: { right: 1656, y: 376, size: 15 * 1.25 },
  },
  // measured (debug stills, t=15.6 and t=27.8); cursor tips sit slightly left of field centers, on the text.
  cursor: {
    ruleRow: { x: 610, y: 407 },
    baseFee: { x: 790, y: 690 },
    rate: { x: 1110, y: 690 },
    maxDistance: { x: 1420, y: 812 },
    save: { x: 1529, y: 899 },
    street: { x: 760, y: 456 },
    calculate: { x: 790, y: 958 },
  },
};
