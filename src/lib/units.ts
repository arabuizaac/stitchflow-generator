/**
 * Unit conversion helpers for StitchFlow.
 *
 * CORE RULE: All internal calculations use centimetres.
 * Inches are a UI-only concern — convert at the input boundary
 * (user types) and at the display boundary (labels, stats).
 */

export type UnitSystem = "cm" | "inch";

/** Exact conversion factor — kept as a single source of truth. */
export const CM_PER_INCH = 2.54;

export const cmToInch = (cm: number): number => cm / CM_PER_INCH;
export const inchToCm = (inch: number): number => inch * CM_PER_INCH;

/**
 * Convert a value in the given unit *to* cm.
 * Used at input boundary before any geometry runs.
 */
export const toCm = (value: number, unit: UnitSystem): number =>
  unit === "cm" ? value : inchToCm(value);

/**
 * Convert a cm value *to* the given display unit.
 * Used at output boundary for labels/stats.
 */
export const fromCm = (cm: number, unit: UnitSystem): number =>
  unit === "cm" ? cm : cmToInch(cm);

/**
 * Round a converted value to a sensible step for the given unit.
 * - cm: 0.1 cm precision
 * - inch: 0.05 inch precision (~1.27 mm) — enough granularity to
 *   preserve geometry on a round-trip without flooding the input
 *   with noisy decimals.
 */
export const roundForUnit = (value: number, unit: UnitSystem): number => {
  const step = unit === "cm" ? 0.1 : 0.05;
  return Math.round(value / step) * step;
};

/** Format for display next to a stat. */
export const formatLength = (cm: number, unit: UnitSystem, digits = 1): string => {
  const v = fromCm(cm, unit);
  return `${v.toFixed(digits)} ${unit === "cm" ? "cm" : "in"}`;
};

/** UI label for the unit (short suffix shown in inputs). */
export const unitSuffix = (unit: UnitSystem): string => (unit === "cm" ? "cm" : "in");
