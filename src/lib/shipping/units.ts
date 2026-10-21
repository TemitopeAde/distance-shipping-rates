export type DistanceUnit = 'mi' | 'km';
export type WeightUnit = 'KG' | 'LB';

export const METERS_PER_MILE = 1609.344;
export const METERS_PER_KM = 1000;
export const KG_PER_LB = 0.45359237;

export function metersPerUnit(unit: DistanceUnit): number {
  return unit === 'mi' ? METERS_PER_MILE : METERS_PER_KM;
}

export function metersToUnits(meters: number, unit: DistanceUnit): number {
  return meters / metersPerUnit(unit);
}

export function unitsToMeters(units: number, unit: DistanceUnit): number {
  return units * metersPerUnit(unit);
}

export function toKg(value: number, unit: WeightUnit): number {
  return unit === 'LB' ? value * KG_PER_LB : value;
}

export type DistanceRoundingMode = 'up' | 'nearest';

export interface DistanceRounding {
  /** Increment in distance units, e.g. 0.1 → bill per tenth of a mile. */
  increment: number;
  mode: DistanceRoundingMode;
}

/**
 * Converts meters to an integer count of thousandths of a unit ("milli-units"),
 * rounded to the merchant's billing increment. Integer output keeps the
 * pricing math exact and deterministic.
 */
export function metersToBilledMilli(meters: number, unit: DistanceUnit, rounding: DistanceRounding): bigint {
  if (!Number.isFinite(meters) || meters < 0) throw new RangeError(`Invalid distance: ${meters}`);
  const incMilli = Math.max(1, Math.round(rounding.increment * 1000));
  // Round to 6 decimals first to absorb floating-point noise before applying the increment.
  const milli = Math.round((meters / metersPerUnit(unit)) * 1000 * 1e6) / 1e6;
  const steps = rounding.mode === 'up' ? Math.ceil(milli / incMilli) : Math.round(milli / incMilli);
  return BigInt(steps) * BigInt(incMilli);
}

export function milliToUnits(milli: bigint): number {
  return Number(milli) / 1000;
}

export function unitsToMilli(units: number): bigint {
  return BigInt(Math.round(units * 1000));
}

export function formatDistance(units: number, unit: DistanceUnit, locale = 'en-US'): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'unit',
      unit: unit === 'mi' ? 'mile' : 'kilometer',
      maximumFractionDigits: 1,
    }).format(units);
  } catch {
    return `${units.toFixed(1)} ${unit}`;
  }
}
