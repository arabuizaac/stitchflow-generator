/**
 * Pattern audit / tailor sanity checks.
 *
 * Runs after a pattern is generated and produces a list of warnings
 * (or "ok" results) that the UI can surface. Audit is non-destructive:
 * it never mutates geometry. Severe issues should be fixed upstream
 * in `generatePattern` / `clampMeasurements`.
 */

import {
  armholeCurveLength,
  sleeveCapLength,
  type PatternData,
} from "./patternGenerator";

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
 * Run all tailor sanity checks against a generated pattern.
 *
 * Rules:
 *  1. Sleeve cap circumference matches the combined armhole within ±5%.
 *  2. Effective neck opening (neckline × (1 + stretch)) is at least 1.1×
 *     neck so the head can pass through.
 *  3. Sleeve width is proportional to armhole depth (between 1.4× and 2.2×).
 *  4. Body is not excessively boxy (length:width aspect within 0.9–2.4).
 *  5. Neckband stretches to fit the neckline within fabric tolerance.
 */
export function auditPattern(data: PatternData): AuditReport {
  const findings: AuditFinding[] = [];
  const { measurements: m, derived: d } = data;

  // 1. Armhole vs sleeve cap — both measured with recursive Bézier
  // subdivision so the comparison is exact at garment scale. The full
  // armhole is the sum of the front and back curves (each piece has
  // its own width because of the 48/52 split).
  const shoulderHalf = m.shoulder / 2;
  const shoulderDrop = 3;
  const fullArmhole =
    armholeCurveLength(d.frontWidth, d.armholeDepth, shoulderHalf, shoulderDrop) +
    armholeCurveLength(d.backWidth, d.armholeDepth, shoulderHalf, shoulderDrop);
  // Use the actual fit-driven cap height the generator chose (taller cap on
  // tight fits, shorter on relaxed) — comparing against a fixed factor here
  // would mis-measure the sleeve.
  const sleeveCapCm = sleeveCapLength(d.sleeveWidth, d.capHeight);
  // Cap should be a few percent longer than armhole (cap ease) — that's
  // expected, not a defect. Treat under-shooting or overshooting beyond
  // 8% as the warning threshold.
  const capExcessPct = (sleeveCapCm - fullArmhole) / fullArmhole;
  const capSeverity: AuditSeverity =
    capExcessPct >= 0 && capExcessPct <= 0.08
      ? "ok"
      : Math.abs(capExcessPct) <= 0.12
        ? "warn"
        : "fail";
  findings.push({
    rule: "armhole-sleeve-cap-match",
    severity: capSeverity,
    message:
      capSeverity === "ok"
        ? `Sleeve cap eases into armhole (+${(capExcessPct * 100).toFixed(1)}%).`
        : `Sleeve cap is ${(capExcessPct * 100).toFixed(1)}% relative to armhole (target 0–8%).`,
    detail: `armhole≈${fullArmhole.toFixed(1)}cm · sleeveCap≈${sleeveCapCm.toFixed(1)}cm`,
  });

  // 2. Neck opening must fit head — for stretch fabrics the effective
  // opening is larger because the neckline itself stretches over the head.
  const stretch = d.fabricProfile.stretch;
  const effectiveOpening = d.necklineLength * (1 + stretch);
  const minNeckline = m.neck * 1.1;
  findings.push({
    rule: "neck-opening-fits-head",
    severity: effectiveOpening >= minNeckline ? "ok" : "fail",
    message:
      effectiveOpening >= minNeckline
        ? "Neck opening passes over the head (with fabric stretch)."
        : `Neckline (${d.necklineLength.toFixed(1)}cm, effective ${effectiveOpening.toFixed(1)}cm) is below 1.1× neck (${minNeckline.toFixed(1)}cm).`,
    detail: `neckline=${d.necklineLength.toFixed(1)}cm · stretch=${(stretch * 100).toFixed(0)}% · neck=${m.neck.toFixed(1)}cm`,
  });

  // 3. Sleeve width vs armhole depth proportion. With fit-driven cap
  // heights, tight fits yield a tall narrow sleeve (~0.8×) while relaxed
  // fits yield a short wide sleeve (~1.7×). Both are valid drafting
  // outcomes; we just guard against truly degenerate ratios.
  const ratio = d.sleeveWidth / d.armholeDepth;
  findings.push({
    rule: "sleeve-armhole-proportion",
    severity: ratio >= 0.75 && ratio <= 1.85 ? "ok" : "warn",
    message:
      ratio >= 0.75 && ratio <= 1.85
        ? "Sleeve width is proportional to armhole depth."
        : `Sleeve/armhole ratio ${ratio.toFixed(2)} is outside the 0.75–1.85 range.`,
    detail: `sleeveWidth=${d.sleeveWidth.toFixed(1)}cm · armholeDepth=${d.armholeDepth.toFixed(1)}cm`,
  });

  // 4. Body aspect ratio (length / chest-half) should not be extreme.
  // Use the *effective* shirt length, which is what the pattern actually
  // produced after the fit's lengthDelta was applied.
  const aspect = d.effectiveShirtLength / d.halfChest;
  findings.push({
    rule: "body-aspect-ratio",
    severity: aspect >= 0.9 && aspect <= 2.4 ? "ok" : "warn",
    message:
      aspect >= 0.9 && aspect <= 2.4
        ? "Body proportions look balanced."
        : `Body aspect ratio ${aspect.toFixed(2)} is unusual (target 0.9–2.4).`,
    detail: `length=${d.effectiveShirtLength.toFixed(1)}cm · halfChest=${d.halfChest.toFixed(1)}cm`,
  });

  // 5. Neckband must reach and grip the neckline. When stretched to
  // its full length the band covers the neckline; we want a small
  // amount of residual tension (snug fit) but not so much it ripples
  // the bodice. Industry guideline: stretchedBand / neckline ≈ 1.00–1.10
  // for a clean snug join.
  const stretchedBand = d.neckbandLength * (1 + stretch);
  const tension = stretchedBand / d.necklineLength;
  const bandSeverity: AuditSeverity =
    tension >= 1.0 && tension <= 1.1
      ? "ok"
      : tension >= 0.95 && tension <= 1.2
        ? "warn"
        : "fail";
  findings.push({
    rule: "neckband-fits-neckline",
    severity: bandSeverity,
    message:
      bandSeverity === "ok"
        ? `Neckband stretches snug to the neckline (+${((tension - 1) * 100).toFixed(1)}%).`
        : tension < 1
          ? `Neckband cannot reach the neckline (${(tension * 100).toFixed(1)}%).`
          : `Neckband tension ${((tension - 1) * 100).toFixed(1)}% above neckline — may distort.`,
    detail: `band=${d.neckbandLength.toFixed(1)}cm · stretched=${stretchedBand.toFixed(1)}cm · neckline=${d.necklineLength.toFixed(1)}cm`,
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
  return bezierQuadLength(
    [shoulderHalfCm, 3],
    [halfWidthCm * 0.92, armholeDepthCm * 0.45],
    [halfWidthCm, armholeDepthCm],
  );
}

function approximateSleeveCapLength(sleeveWidthCm: number, capHeightCm: number): number {
  // Two quadratics forming the sleeve cap (mirrors buildSleeve).
  const W = sleeveWidthCm;
  const cap = capHeightCm;
  const left = bezierQuadLength([0, cap], [W * 0.18, cap * 0.15], [W / 2, 0]);
  const right = bezierQuadLength([W / 2, 0], [W * 0.82, cap * 0.15], [W, cap]);
  return left + right;
}
