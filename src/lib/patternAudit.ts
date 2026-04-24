/**
 * Pattern audit / tailor sanity checks.
 *
 * Runs after a pattern is generated and produces a list of warnings
 * (or "ok" results) that the UI can surface. Audit is non-destructive:
 * it never mutates geometry. Severe issues should be fixed upstream
 * in `generatePattern` / `clampMeasurements`.
 */

import type { PatternData } from "./patternGenerator";

export type AuditSeverity = "ok" | "warn" | "fail";

export interface AuditFinding {
  rule: string;
  severity: AuditSeverity;
  message: string;
  /** Optional measured value for diagnostics. */
  detail?: string;
}

export interface AuditReport {
  findings: AuditFinding[];
  /** True when no rule produced a warn/fail. */
  pass: boolean;
}

/**
 * Approximate the length of a polyline / quadratic path by sampling
 * points along its segments. Used to compare armhole vs sleeve cap.
 */
export function approximateCurveLength(points: { x: number; y: number }[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    len += Math.hypot(dx, dy);
  }
  return len;
}

/** Sample a quadratic Bézier into N points for length measurement. */
export function sampleQuad(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  steps = 32,
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = (1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0];
    const y = (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1];
    out.push({ x, y });
  }
  return out;
}

/**
 * Run all tailor sanity checks against a generated pattern.
 *
 * Rules:
 *  1. Sleeve cap circumference matches armhole circumference within ±5%.
 *  2. Neck opening (full neckline) is at least 1.1× neck measurement
 *     so the head can pass through.
 *  3. Sleeve width is proportional to armhole depth (between 1.4× and 2.2×).
 *  4. Body is not excessively boxy (length:width aspect within 0.9–2.4).
 */
export function auditPattern(data: PatternData): AuditReport {
  const findings: AuditFinding[] = [];
  const { measurements: m, derived: d } = data;

  // 1. Armhole vs sleeve cap.
  // Approximate front armhole as quadratic from shoulder end to side-armhole point.
  // Use derived geometry directly (cm), which mirrors the pattern generator.
  const armholeCm = approximateArmholeLength(d.frontWidth, d.armholeDepth, m.shoulder / 2);
  const sleeveCapCm = approximateSleeveCapLength(d.sleeveWidth, d.armholeDepth * 0.7);
  const fullArmhole = armholeCm * 2; // front + back combined approximation
  const diffPct = Math.abs(sleeveCapCm - fullArmhole) / fullArmhole;
  findings.push({
    rule: "armhole-sleeve-cap-match",
    severity: diffPct <= 0.05 ? "ok" : diffPct <= 0.1 ? "warn" : "fail",
    message:
      diffPct <= 0.05
        ? "Sleeve cap matches armhole within 5%."
        : `Sleeve cap differs from armhole by ${(diffPct * 100).toFixed(1)}% (target ≤5%).`,
    detail: `armhole≈${fullArmhole.toFixed(1)}cm · sleeveCap≈${sleeveCapCm.toFixed(1)}cm`,
  });

  // 2. Neck opening must fit head: neckline >= neck * 1.1.
  const minNeckline = m.neck * 1.1;
  findings.push({
    rule: "neck-opening-fits-head",
    severity: d.necklineLength >= minNeckline ? "ok" : "fail",
    message:
      d.necklineLength >= minNeckline
        ? "Neck opening is large enough to pass over the head."
        : `Neckline (${d.necklineLength.toFixed(1)}cm) is below 1.1× neck (${minNeckline.toFixed(1)}cm).`,
    detail: `neckline=${d.necklineLength.toFixed(1)}cm · neck=${m.neck.toFixed(1)}cm`,
  });

  // 3. Sleeve width vs armhole depth proportion.
  const ratio = d.sleeveWidth / d.armholeDepth;
  findings.push({
    rule: "sleeve-armhole-proportion",
    severity: ratio >= 1.4 && ratio <= 2.2 ? "ok" : "warn",
    message:
      ratio >= 1.4 && ratio <= 2.2
        ? "Sleeve width is proportional to armhole depth."
        : `Sleeve/armhole ratio ${ratio.toFixed(2)} is outside the 1.4–2.2 range.`,
    detail: `sleeveWidth=${d.sleeveWidth.toFixed(1)}cm · armholeDepth=${d.armholeDepth.toFixed(1)}cm`,
  });

  // 4. Body aspect ratio (length / chest-half) should not be extreme.
  const aspect = m.shirtLength / d.halfChest;
  findings.push({
    rule: "body-aspect-ratio",
    severity: aspect >= 0.9 && aspect <= 2.4 ? "ok" : "warn",
    message:
      aspect >= 0.9 && aspect <= 2.4
        ? "Body proportions look balanced."
        : `Body aspect ratio ${aspect.toFixed(2)} is unusual (target 0.9–2.4).`,
    detail: `length=${m.shirtLength}cm · halfChest=${d.halfChest.toFixed(1)}cm`,
  });

  const pass = findings.every((f) => f.severity === "ok");
  return { findings, pass };
}

/* ------------------------------------------------------------------ */
/* Helpers — geometric approximations matching patternGenerator.      */
/* ------------------------------------------------------------------ */

function approximateArmholeLength(
  halfWidthCm: number,
  armholeDepthCm: number,
  shoulderHalfCm: number,
): number {
  // Quadratic from (shoulderHalf, ~3) to (halfWidth, armholeDepth) with a
  // control point pulled inward — mirrors buildBodyPiece's armhole curve.
  const pts = sampleQuad(
    [shoulderHalfCm, 3],
    [halfWidthCm * 0.92, armholeDepthCm * 0.45],
    [halfWidthCm, armholeDepthCm],
  );
  return approximateCurveLength(pts);
}

function approximateSleeveCapLength(sleeveWidthCm: number, capHeightCm: number): number {
  // Two quadratics forming the sleeve cap (mirrors buildSleeve).
  const W = sleeveWidthCm;
  const cap = capHeightCm;
  const left = sampleQuad([0, cap], [W * 0.18, cap * 0.15], [W / 2, 0]);
  const right = sampleQuad([W / 2, 0], [W * 0.82, cap * 0.15], [W, cap]);
  return approximateCurveLength(left) + approximateCurveLength(right);
}
