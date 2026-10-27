import { Easing } from "remotion";

import { step } from "../kit/spring";
import { clamp01, progress } from "../kit/time";
import { color, font, quick, settle } from "../tokens";
import { b, scene } from "./cues";
import { L } from "./layout";
import { AppMark, Field, I, StreetMap, Window } from "./ui";

const ease = Easing.bezier(0.45, 0, 0.2, 1);
const out = Easing.bezier(0.22, 1, 0.36, 1);

/** Pops in with a short blur at `at`. */
const pop = (t: number, at: number, length = 0.3) => {
  const u = out(clamp01((t - at) / length));
  return { opacity: u, filter: u < 1 ? `blur(${(1 - u) * 8}px)` : undefined, translate: `0 ${(1 - u) * 14}px` };
};

/** A whole scene leaving just before its window closes. */
const leave = (t: number, end: number) => {
  const u = clamp01((t - (end - 0.14)) / 0.14);
  return { opacity: 1 - u, filter: u > 0 ? `blur(${u * 10}px)` : undefined };
};

/** Window rising into place at `start`. */
const rise = (t: number, start: number) => (1 - step(t - start, settle)) * 700;

// ---------------------------------------------------------------- Opening

export function Opening({ t }: { t: number }) {
  const [start, end] = scene.open;
  if (t < start || t > end) return null;
  const lift = step(t - b(2, 2), settle);
  const size = 520 - 170 * lift;
  return (
    <div style={{ position: "absolute", inset: 0, ...leave(t, end) }}>
      <div style={{ position: "absolute", left: 960, top: 520 - 190 * lift, translate: "-50% -50%" }}>
        <AppMark
          size={size}
          tile={step(t - b(1, 1, 0.25), settle)}
          truck={ease(progress(t, b(1, 2), 0.9))}
          dot={step(t - b(1, 3), quick)}
          route={ease(progress(t, b(1, 3), 0.9))}
          pin={step(t - b(2, 1), settle)}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Real road distance

export function MapScene({ t }: { t: number }) {
  const [start, end] = scene.map;
  if (t < start || t > end) return null;
  const enter = step(t - start, settle);
  const draw = ease(progress(t, b(4, 2), b(5, 1) - b(4, 2) - 0.05));
  const option = step(t - b(5, 2), settle);
  const chosen = clamp01((t - b(5, 3)) / 0.2);
  return (
    <div style={{ position: "absolute", inset: 0, fontFamily: font, ...leave(t, end) }}>
      <div style={{
        position: "absolute", left: 400, top: 70, width: 1120, height: 640, borderRadius: 32, overflow: "hidden", border: "8px solid #fff",
        boxShadow: "0 30px 80px rgba(10,20,60,.4)", translate: `0 ${(1 - enter) * 500}px`, opacity: clamp01(enter * 2),
      }}>
        <StreetMap w={1104} h={624} viewBox="-185 -40 1400 800" draw={draw} store={step(t - b(4, 1, 0.5), quick)}
          pin={step(t - b(5, 1), settle)} chip={clamp01((t - b(4, 2)) / 0.25)} chipMiles={12.4 * draw} />
      </div>
      <div style={{
        position: "absolute", left: 470, top: 740, width: 980, height: 150, background: "#fff", borderRadius: 24,
        boxShadow: "0 24px 60px rgba(10,20,60,.35)", display: "flex", alignItems: "center", gap: 26, padding: "0 40px",
        translate: `0 ${(1 - option) * 380}px`, opacity: clamp01(option * 2),
      }}>
        <span style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0, border: `${2 + 9 * chosen}px solid ${chosen > 0 ? color.brand : color.radioOff}` }} />
        <div>
          <div style={{ fontSize: 34, fontWeight: 700, color: color.foreground }}>Local delivery</div>
          <div style={{ fontSize: 26, color: color.mutedFg, marginTop: 4 }}>Same day · 12.4 mi from Downtown store</div>
        </div>
        <div style={{ marginLeft: "auto", fontSize: 50, fontWeight: 800, color: color.foreground, fontVariantNumeric: "tabular-nums", ...pop(t, b(5, 3)) }}>$33.50</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Pricing rules

const RULES = {
  open: b(7, 2),
  base: { click: b(7, 4), type: [b(7, 4, 0.3), b(8, 1, 0.2)] as [number, number] },
  rate: { click: b(8, 2), type: [b(8, 2, 0.3), b(8, 3, 0.2)] as [number, number] },
  max: { click: b(8, 4), type: [b(8, 4, 0.3), b(9, 1)] as [number, number] },
  save: b(9, 2),
};
export const rulesCursor = RULES;

export function RulesScene({ t }: { t: number }) {
  const [start, end] = scene.rules;
  if (t < start || t > end) return null;
  const dialog = step(t - (RULES.open + 0.08), quick) * (1 - step(t - (RULES.save + 0.12), quick));
  const saved = t >= RULES.save + 0.12;
  const flash = saved ? 1 - clamp01((t - (RULES.save + 0.3)) / 1.2) : 0;
  return (
    <div style={{ position: "absolute", inset: 0, ...leave(t, end) }}>
      <Window active="rules" y={rise(t, start)}>
        <div className="ph" style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
          <div style={{ flex: 1 }}><h2>Pricing rules</h2><p>Each active rule becomes a delivery option at checkout.</p></div>
          <span className="btn"><I n="plus" />Add rule</span>
        </div>
        <div className="card" style={{ padding: "14px 10px" }}>
          <table>
            <tbody>
              <tr><th>Rule</th><th>Checkout option</th><th>Pricing</th><th>Status</th></tr>
              <tr style={{ background: `rgba(230,239,252,${flash})` }}>
                <td data-target="ruleRow"><b>Local delivery</b></td><td>Local delivery</td>
                <td className="num">{saved ? "$5.00 + $2.00/mi" : "$4.00 + $1.50/mi"}</td><td><span className="badge ok">Active</span></td>
              </tr>
              <tr><td><b>Express</b></td><td>Express (2 hours)</td><td className="num">3 brackets</td><td><span className="badge ok">Active</span></td></tr>
              <tr><td><b>Bulky items</b></td><td>Large item delivery</td><td className="num">$15.00 + $3.50/mi</td><td><span className="badge soft">Inactive</span></td></tr>
            </tbody>
          </table>
        </div>
        <div style={{ position: "absolute", inset: 0, background: "rgba(15, 23, 42, .38)", opacity: dialog }} />
        <div style={{
          position: "absolute", left: "50%", top: 34, width: 640, translate: `-50% ${(1 - dialog) * 16}px`, scale: String(0.96 + 0.04 * dialog),
          opacity: dialog, background: "#fff", borderRadius: 14, boxShadow: "0 24px 70px rgba(10,20,60,.35)", padding: "24px 26px", display: "grid", gap: 18,
        }}>
          <h4 style={{ fontSize: 20, fontWeight: 700 }}>Edit pricing rule</h4>
          <div style={{ display: "flex", gap: 4, background: color.muted, borderRadius: 9, padding: 4 }}>
            {["Basics", "Distance pricing", "Free delivery & fees", "Conditions"].map((tab) => (
              <span key={tab} style={{
                flex: 1, textAlign: "center", padding: "7px 4px", borderRadius: 6, fontSize: 13.5, whiteSpace: "nowrap",
                ...(tab === "Distance pricing" ? { background: "#fff", fontWeight: 600, boxShadow: "0 1px 3px rgba(0,0,0,.08)" } : { color: color.mutedFg, fontWeight: 500 }),
              }}>{tab}</span>
            ))}
          </div>
          <div className="field"><label>Pricing model</label><div className="input">Base fee + rate per distance<I n="chevron-down" style={{ marginLeft: "auto", color: color.mutedFg }} /></div></div>
          <div style={{ background: color.accent, color: color.accentFg, borderRadius: 8, padding: "10px 12px", fontSize: 14, display: "flex", gap: 8, alignItems: "center" }}>
            <I n="sparkles" />Example: 5.00 + 10 mi × 2.00 = 25.00
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
            <Field label="Base fee" t={t} prefix="$" from="4.00" to="5.00" click={RULES.base.click} type={RULES.base.type} target="baseFee" />
            <Field label="Rate per mi" t={t} prefix="$" from="1.50" to="2.00" click={RULES.rate.click} type={RULES.rate.type} target="rate" />
            <Field label="Included distance" t={t} from="0" to="0" unit="mi" />
            <Field label="Minimum fee" t={t} prefix="$" from="10.00" to="10.00" />
            <Field label="Maximum fee" t={t} prefix="$" from="60.00" to="60.00" />
            <Field label="Maximum distance" t={t} from="20" to="30" unit="mi" click={RULES.max.click} type={RULES.max.type} target="maxDistance" />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <span className="btn out">Cancel</span>
            <span className="btn" data-target="save" style={{ background: t >= RULES.save && t < RULES.save + 0.16 ? color.brandDeep : undefined }}>Save changes</span>
          </div>
        </div>
      </Window>
      <Toast t={t} at={RULES.save + 0.2} />
    </div>
  );
}

/** sonner toast, bottom right, as the dashboard shows after a save. */
function Toast({ t, at }: { t: number; at: number }) {
  if (t < at) return null;
  const u = step(t - at, settle);
  return (
    <div className="ui" style={{
      position: "absolute", right: 120, bottom: 70, scale: "1.6", transformOrigin: "100% 100%", translate: `0 ${(1 - u) * 40}px`, opacity: clamp01(u * 1.5),
    }}>
      <div style={{ background: "#fff", border: `1px solid ${color.border}`, borderRadius: 8, padding: "12px 16px", display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 500, boxShadow: "0 4px 12px rgba(0,0,0,.1)", width: 220 }}>
        <I n="circle-check" style={{ color: color.success }} />Saved
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Delivery zones

const ZONES: [string, "ok" | "bad", string[], string][] = [
  ["Greater Austin", "ok", ["787*", "786*"], "30 mi"],
  ["Hill Country", "ok", ["78620", "78669", "78738"], "45 mi"],
  ["Airport cargo area", "bad", ["78719"], "—"],
  ["Round Rock & Georgetown", "ok", ["78664", "78626", "78628"], "35 mi"],
  ["University campus", "bad", ["78712"], "—"],
];

export function ZonesScene({ t }: { t: number }) {
  const [start, end] = scene.zones;
  if (t < start || t > end) return null;
  const rowAt = [b(11, 3), b(11, 4), b(12, 1), b(12, 2), b(12, 3)];
  const sec = { fontSize: 13, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: 0.6, color: color.mutedFg };
  const loc = (at: number, icon: "store" | "package", name: string, address: string, radius: string, primary: boolean) => (
    <div className="card" style={{ flex: 1, display: "flex", gap: 14, alignItems: "flex-start", ...pop(t, at) }}>
      <span style={{ width: 40, height: 40, borderRadius: 10, background: color.accent, color: color.brand, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><I n={icon} s={20} /></span>
      <div>
        <div style={{ fontWeight: 600, fontSize: 15.5, display: "flex", gap: 8, alignItems: "center" }}>{name}{primary ? <span className="badge info">Primary</span> : null}</div>
        <div style={{ fontSize: 13.5, color: color.mutedFg, marginTop: 3 }}>{address}</div>
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          <span className="badge ok" style={pop(t, at + 0.25)}><I n="badge-check" s={13} />Address verified</span>
          <span className="badge soft">{radius}</span>
        </div>
      </div>
    </div>
  );
  return (
    <div style={{ position: "absolute", inset: 0, ...leave(t, end) }}>
      <Window active="zones" y={rise(t, start)}>
        <div style={sec}>Fulfillment locations</div>
        <div className="row">
          {loc(b(11, 1, 0.25), "store", "Downtown store", "600 Congress Ave, Austin, TX 78701", "Radius 30 mi", true)}
          {loc(b(11, 2), "package", "North warehouse", "12400 N Lamar Blvd, Austin, TX 78753", "Radius 40 mi", false)}
        </div>
        <div style={{ display: "flex", alignItems: "center", marginTop: 6 }}><div style={{ ...sec, flex: 1 }}>Delivery zones</div><span className="btn"><I n="plus" />Add zone</span></div>
        <div className="card" style={{ padding: "14px 10px" }}>
          <table>
            <tbody>
              <tr><th>Zone</th><th>Type</th><th>Areas</th><th>Max distance</th></tr>
              {ZONES.map(([name, kind, areas, max], i) => (
                <tr key={name} style={pop(t, rowAt[i])}>
                  <td><b>{name}</b></td>
                  <td><span className={`badge ${kind}`}>{kind === "ok" ? "Service area" : "Exclusion"}</span></td>
                  <td style={{ display: "flex", gap: 4 }}>{areas.map((a) => <code key={a}>{a}</code>)}</td>
                  <td className={max === "—" ? "muted" : "num"}>{max}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint" style={{ fontSize: 13.5, display: "flex", alignItems: "center", gap: 6, ...pop(t, b(12, 4)) }}>
          <I n="shield-check" s={14} />Exclusions always win. When any service area exists, destinations must be inside one.
        </p>
      </Window>
    </div>
  );
}

// ---------------------------------------------------------------- Rate simulator

const SIM = {
  street: { click: b(14, 1, 0.5), type: [b(14, 1, 0.75), b(14, 3)] as [number, number] },
  fill: b(14, 3, 0.25),
  calc: b(14, 4),
  result: b(15, 1),
};
export const simCursor = SIM;

export function SimulatorScene({ t, hideTotal }: { t: number; hideTotal: boolean }) {
  const [start, end] = scene.simulator;
  if (t < start || t > end + 0.6) return null;
  const exit = step(t - end, settle);
  const loading = t >= SIM.calc && t < SIM.result;
  const has = t >= SIM.result;
  const filled = t >= SIM.fill;
  const rows: [string, string, number][] = [
    ["Base fee", "$5.00", b(15, 2, 0.5)],
    ["13 mi × $2.00", "$26.00", b(15, 3)],
    ["Handling fee", "$2.50", b(15, 3, 0.5)],
  ];
  return (
    <div style={{ position: "absolute", inset: 0, opacity: 1 - clamp01(exit * 1.6) }}>
      <Window active="simulator" y={rise(t, start) + exit * 500}>
        <div className="ph"><h2>Rate simulator</h2><p>Preview the distance and price for an address using the same logic as checkout.</p></div>
        <div style={{ display: "grid", gridTemplateColumns: "280px minmax(0, 1fr)", gap: 16, flex: 1, minHeight: 0 }}>
          <div className="card" style={{ display: "grid", gap: 14, alignContent: "start" }}>
            <h3>Destination</h3>
            <Field label="Street address" t={t} to="1100 S Lamar Blvd" click={SIM.street.click} type={SIM.street.type} target="street"
              icon={<I n="search" style={{ color: color.mutedFg }} />} />
            <div className="field"><label>City</label><div className="input" style={pop(t, SIM.fill, 0.2)}>{filled ? "Austin" : ""}</div></div>
            <div className="field"><label>Postal code</label><div className="input num" style={pop(t, SIM.fill + 0.06, 0.2)}>{filled ? "78704" : ""}</div></div>
            <h3 style={{ marginTop: 4 }}>Cart</h3>
            <div className="field"><label>Subtotal (after discounts)</label><div className="input num">$ 58.00</div></div>
            <span className="btn" data-target="calculate" style={{ justifyContent: "center", opacity: loading ? 0.6 : 1 }}>
              {loading ? <I n="loader" style={{ rotate: `${(t - SIM.calc) * 720}deg` }} /> : <I n="gauge" />}Calculate
            </span>
          </div>
          <div className="card">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h3>Result</h3>
              {has ? <span className="badge ok" style={{ marginLeft: "auto", ...pop(t, SIM.result) }}><I n="circle-check" s={13} />Customers would see these options</span> : null}
            </div>
            {!has ? <p className="muted" style={{ marginTop: 14, fontSize: 14.5 }}>Enter an address and calculate to see the result.</p> : (
              <>
                <div style={{ display: "flex", gap: 14, marginTop: 14 }}>
                  <div style={{ borderRadius: 10, overflow: "hidden", border: `1px solid ${color.border}`, ...pop(t, SIM.result) }}>
                    <StreetMap w={210} h={214} viewBox="60 -50 860 876" draw={ease(progress(t, SIM.result + 0.1, 0.9))} store={1} pin={step(t - (SIM.result + 0.9), settle)} />
                  </div>
                  <div style={{ display: "grid", gap: 8, flex: 1, alignContent: "start" }}>
                    {[["Road distance", "12.4 mi", b(15, 1, 0.5)], ["From", "Downtown store", b(15, 2)], ["Address match", "Exact", b(15, 2, 0.25)]].map(([k, v, at]) => (
                      <div key={k as string} style={{ background: color.muted, borderRadius: 9, padding: "10px 12px", ...pop(t, at as number) }}>
                        <small style={{ display: "block", fontSize: 12, color: color.mutedFg }}>{k}</small><b className="num" style={{ fontSize: 17 }}>{v}</b>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="num" style={{ marginTop: 14, display: "grid", gap: 8, fontSize: 14.5 }}>
                  {rows.map(([k, v, at]) => <div key={k} style={{ display: "flex", justifyContent: "space-between", ...pop(t, at) }}><span className="muted">{k}</span><span>{v}</span></div>)}
                  <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${color.border}`, paddingTop: 10, fontWeight: 700, fontSize: 18, ...pop(t, b(15, 4)) }}>
                    <span>Local delivery · Total</span><span data-target="simTotal" style={{ opacity: hideTotal ? 0 : 1 }}>$33.50</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </Window>
    </div>
  );
}

// ---------------------------------------------------------------- Checkout

export function CheckoutScene({ t, showPrice }: { t: number; showPrice: boolean }) {
  const [start, end] = scene.checkout;
  if (t < start || t > end) return null;
  const enter = step(t - start, settle);
  const chosen = clamp01((t - L.travel.land) / 0.2);
  const sum = (at: number) => pop(t, at);
  return (
    <div style={{ position: "absolute", inset: 0, ...leave(t, end) }}>
      <div className="ui" style={{
        position: "absolute", left: L.phone.x, top: L.phone.y, width: 390, height: 720, scale: String(L.phone.scale), transformOrigin: "0 0",
        translate: `${(1 - enter) * 900}px 0`, background: color.phone, borderRadius: 56, padding: 14, boxShadow: "0 40px 90px rgba(10,20,60,.45)",
      }}>
        <div style={{ width: "100%", height: "100%", background: "#fff", borderRadius: 44, overflow: "hidden", padding: "54px 22px 22px", position: "relative", fontSize: 15 }}>
          <div style={{ position: "absolute", top: 14, left: "50%", translate: "-50% 0", width: 110, height: 30, background: color.phone, borderRadius: 20 }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontWeight: 700, fontSize: 17 }}><span>Oak Street Bakery</span><I n="lock" s={16} style={{ color: color.mutedFg }} /></div>
          <div style={{ display: "flex", gap: 6, margin: "18px 0 14px", fontSize: 12.5, color: color.mutedFg }}><span>Details</span>›<b style={{ color: color.foreground }}>Delivery</b>›<span>Payment</span></div>
          <h5 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Delivery method</h5>
          <div style={{ fontSize: 14, color: color.mutedFg, marginBottom: 16, lineHeight: 1.4 }}>To 1100 S Lamar Blvd, Austin, TX 78704</div>
          <div className="num" style={{ display: "grid", gap: 10 }}>
            <div style={{ border: `1.5px solid ${chosen > 0.5 ? color.brand : color.border}`, background: chosen > 0.5 ? color.optOn : "#fff", borderRadius: 12, padding: 14, display: "flex", gap: 12, alignItems: "center" }}>
              <span style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0, border: chosen > 0.5 ? `6px solid ${color.brand}` : `2px solid ${color.radioOff}` }} />
              <div><div style={{ fontWeight: 600 }}>Local delivery</div><div style={{ fontSize: 13, color: color.mutedFg, marginTop: 2 }}>Same day</div></div>
              <span data-target="phonePrice" style={{ marginLeft: "auto", fontWeight: 700, opacity: showPrice ? 1 : 0 }}>$33.50</span>
            </div>
            <div style={{ border: `1.5px solid ${color.border}`, borderRadius: 12, padding: 14, display: "flex", gap: 12, alignItems: "center" }}>
              <span style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${color.radioOff}`, flexShrink: 0 }} />
              <div><div style={{ fontWeight: 600 }}>Store pickup</div><div style={{ fontSize: 13, color: color.mutedFg, marginTop: 2 }}>Ready in 2 hours</div></div>
              <span style={{ marginLeft: "auto", fontWeight: 700 }}>Free</span>
            </div>
          </div>
          <div className="num" style={{ marginTop: 18, borderTop: `1px solid ${color.border}`, paddingTop: 14, display: "grid", gap: 8, fontSize: 14.5 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span className="muted">Subtotal</span><span>$58.00</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", ...sum(b(16, 4)) }}><span className="muted">Delivery</span><span>$33.50</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 17, ...sum(b(17, 1)) }}><span>Total</span><span>$91.50</span></div>
          </div>
          <div style={{ position: "absolute", left: 22, right: 22, bottom: 26, background: t >= b(17, 3) && t < b(17, 3) + 0.18 ? "#000" : color.pay, color: "#fff", borderRadius: 12, padding: 15, textAlign: "center", fontWeight: 600 }}>Continue to payment</div>
        </div>
      </div>
    </div>
  );
}

/** The simulator's total travels into the checkout option: the same price the shopper pays. */
export function PriceTraveler({ t }: { t: number }) {
  const { start, land, from, to } = L.travel;
  if (t < start || t >= land) return null;
  const u = step(t - start, { stiffness: 120, damping: 22 });
  const x = from.right + (to.right - from.right) * u;
  const y = from.y + (to.y - from.y) * u;
  const size = from.size + (to.size - from.size) * u;
  const arc = Math.sin(Math.PI * clamp01(u)) * -60;
  return (
    <div style={{
      position: "absolute", left: x, top: y + arc, translate: "-100% -50%", fontFamily: font, fontSize: size, fontWeight: 700,
      color: color.foreground, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
      background: "#fff", borderRadius: size * 0.3, padding: `${size * 0.12}px ${size * 0.25}px`, marginRight: -size * 0.25,
      boxShadow: `0 ${12 * Math.sin(Math.PI * clamp01(u))}px 40px rgba(10,20,60,${0.3 * Math.sin(Math.PI * clamp01(u))})`,
    }}>$33.50</div>
  );
}

// ---------------------------------------------------------------- End card

export function EndCard({ t }: { t: number }) {
  const [start] = scene.end;
  if (t < start) return null;
  return (
    <div style={{ position: "absolute", inset: 0, fontFamily: font, color: "#fff", textAlign: "center" }}>
      <div style={{ position: "absolute", left: 960, top: 300, translate: "-50% -50%" }}>
        <AppMark size={330} tile={step(t - start, settle)} truck={ease(progress(t, b(18, 1, 0.5), 0.6))} dot={step(t - b(18, 2), quick)}
          route={ease(progress(t, b(18, 2), 0.6))} pin={step(t - b(18, 2, 0.75), settle)} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 560, fontSize: 80, fontWeight: 900, letterSpacing: -1.5, ...pop(t, b(18, 2), 0.35) }}>
        Distance-Based Shipping &amp; Delivery
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 676, fontSize: 36, color: "rgba(255,255,255,.92)", ...pop(t, b(18, 3), 0.35) }}>
        Charge delivery fees by real road distance, live at checkout.
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 800, display: "flex", justifyContent: "center", ...pop(t, b(18, 4), 0.35) }}>
        <span style={{ display: "inline-flex", background: "#fff", color: color.brand, borderRadius: 16, padding: "20px 38px", fontSize: 36, fontWeight: 700, whiteSpace: "nowrap" }}>
          Start free on the Wix App Market
        </span>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 920, fontSize: 28, color: color.onBrandSoft, ...pop(t, b(19, 1), 0.35) }}>
        Basic: free · Pro: $19/month · Business: $49/month
      </div>
    </div>
  );
}
