import { z } from "zod";

export type FitType = "tight" | "regular" | "relaxed";
export type FabricType = "cotton" | "jersey" | "rib";

export interface FabricProfile {
  /** Effective stretch ratio (0..1). 0.05 = 5% stretch beyond resting length. */
  stretch: number;
  /** Recovery factor (0..1). Higher = the fabric snaps back well after stretching. */
  recovery: number;
}

/**
 * Calibrated fabric properties used by the drafting engine.
 *
 * These numbers are conservative averages used by industrial pattern blocks:
 *  - cotton woven: very low stretch, near-perfect recovery.
 *  - single jersey knit: medium stretch, good recovery.
 *  - 1×1 rib knit: high stretch, excellent recovery — the canonical neckband fabric.
 */
export const FABRICS: Record<FabricType, FabricProfile> = {
  cotton: { stretch: 0.05, recovery: 0.95 },
  jersey: { stretch: 0.2, recovery: 0.9 },
  rib: { stretch: 0.4, recovery: 0.95 },
};

export interface FitProfile {
  /** Wearing ease added to chest circumference, in cm. */
  ease: number;
  /** Centimetres added to (or removed from) the requested shirt length. */
  lengthDelta: number;
  /** Cap height as a fraction of armhole depth — taller cap = narrower sleeve. */
  capHeightFactor: number;
  /** Multiplier on the fabric-derived sleeve cap ease (controls sleeve width). */
  sleeveEaseFactor: number;
  /** Extra cm added to chest/4 for armhole depth. */
  armholeExtra: number;
}

/**
 * Calibrated fit profiles that drive *visibly distinct* pattern geometry.
 *
 * Three levers per fit:
 *  - body width via `ease`
 *  - shirt length via `lengthDelta`
 *  - sleeve width via `capHeightFactor` (taller cap → narrower sleeve) and
 *    `sleeveEaseFactor` (multiplies the cap ease above the armhole)
 */
export const FITS: Record<FitType, FitProfile> = {
  tight:   { ease: 4,  lengthDelta: -4, capHeightFactor: 0.78, sleeveEaseFactor: 0.4, armholeExtra: 2 },
  regular: { ease: 10, lengthDelta:  0, capHeightFactor: 0.70, sleeveEaseFactor: 1.0, armholeExtra: 4 },
  relaxed: { ease: 18, lengthDelta:  4, capHeightFactor: 0.58, sleeveEaseFactor: 1.6, armholeExtra: 6 },
};

export interface Measurements {
  chest: number;
  shoulder: number;
  sleeveLength: number;
  shirtLength: number;
  neck: number;
  fit: FitType;
  fabric: FabricType;
}

/**
 * Strict input schema. Bounds are intentionally generous on the upper end
 * so the engine can serve a wide size range, while the lower bounds reject
 * obviously invalid values before any geometry runs. Sanitization (auto-
 * correction) happens in `clampMeasurements` after this schema accepts.
 */
export const MeasurementsSchema = z.object({
  chest: z.number().finite().min(40, "Chest must be at least 40 cm").max(200, "Chest must be 200 cm or less"),
  shoulder: z.number().finite().min(15, "Shoulder must be at least 15 cm").max(80, "Shoulder must be 80 cm or less"),
  sleeveLength: z.number().finite().min(10, "Sleeve length must be at least 10 cm").max(100, "Sleeve length must be 100 cm or less"),
  shirtLength: z.number().finite().min(30, "Shirt length must be at least 30 cm").max(150, "Shirt length must be 150 cm or less"),
  neck: z.number().finite().min(20, "Neck must be at least 20 cm").max(80, "Neck must be 80 cm or less"),
  fit: z.enum(["tight", "regular", "relaxed"]),
  fabric: z.enum(["cotton", "jersey", "rib"]).default("cotton"),
});

export interface PatternPiece {
  label: string;
  width: number;   // bounding box width in mm (with seam allowance)
  height: number;  // bounding box height in mm (with seam allowance)
  cutPath: string;       // finished (sewing) line
  seamPath: string;      // outer seam allowance line
  annotations: { x: number; y: number; text: string; size?: number; bold?: boolean }[];
  grainline?: { x1: number; y1: number; x2: number; y2: number };
  foldEdge?: "left" | null;
}

export interface PatternData {
  pieces: PatternPiece[];
  derived: {
    halfChest: number;
    frontWidth: number;
    backWidth: number;
    armholeDepth: number;
    /** Sleeve cap height actually used (fit-driven). */
    capHeight: number;
    sleeveWidth: number;
    /** Final shirt length after applying the fit's lengthDelta. */
    effectiveShirtLength: number;
    necklineLength: number;
    frontNecklineLength: number;
    backNecklineLength: number;
    neckbandLength: number;
    ease: number;
    fabric: FabricType;
    fabricProfile: FabricProfile;
    fit: FitType;
    fitProfile: FitProfile;
    /** Effective stretch the band is engineered against (stretch × recovery). */
    effectiveStretch: number;
  };
  measurements: Measurements;
}

const MM = 10; // 1 cm = 10 mm = 10 SVG units

/** Sleeve cap must clear the armhole by at most this fraction (3% per spec). */
const MAX_CAP_EXCESS = 0.03;
/** Iterative scaling tolerance, in cm (well inside the ±0.5 cm spec). */
const SLEEVE_TOLERANCE_CM = 0.05;

// Seam allowances in cm
const SA = {
  side: 1.2,
  shoulder: 1.0,
  neckline: 0.8,
  hem: 2.5,
};

/**
 * Sanitize measurements before any geometry is calculated.
 *
 * Rules:
 *  - chest is the primary reference and must be at least 60 cm.
 *  - shoulder must be at least 20 cm.
 *  - sleeveLength must be at least 40 cm.
 *  - shirtLength must be at least 60 cm.
 *  - neck cannot exceed chest / 2; if it does, fall back to chest / 3
 *    (a realistic anatomical proportion) instead of an aggressive clip.
 *  - fabric defaults to cotton when missing.
 */
export function clampMeasurements(m: Measurements): Measurements {
  const chest = Math.max(60, m.chest);
  const neck = m.neck > chest / 2 ? chest / 3 : Math.max(1, m.neck);
  return {
    ...m,
    chest,
    neck,
    sleeveLength: Math.max(40, m.sleeveLength),
    shirtLength: Math.max(60, m.shirtLength),
    shoulder: Math.max(20, m.shoulder),
    fabric: m.fabric ?? "cotton",
  };
}

/* ---------- Geometry helpers ---------- */

type Pt = [number, number];

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/**
 * Recursive De Casteljau subdivision for the arc length of a quadratic
 * Bézier curve. Subdivides until the control polygon's length is within
 * `tolerance` of the chord, then estimates the segment length as the
 * average of the two — accurate to well within a millimetre for any
 * curve we draw at garment scale.
 */
export function bezierQuadLength(p0: Pt, p1: Pt, p2: Pt, tolerance = 0.01): number {
  const chord = dist(p0, p2);
  const polygon = dist(p0, p1) + dist(p1, p2);
  // Flat-enough test: when the control polygon collapses to the chord,
  // the curve is well-approximated by their average.
  if (polygon - chord <= tolerance || polygon < 1e-9) {
    return (polygon + chord) / 2;
  }
  // De Casteljau midpoints split the curve into two sub-curves that
  // share C1 continuity at m012.
  const m01 = mid(p0, p1);
  const m12 = mid(p1, p2);
  const m012 = mid(m01, m12);
  // Halve the tolerance so total error stays bounded across recursion.
  return (
    bezierQuadLength(p0, m01, m012, tolerance / 2) +
    bezierQuadLength(m012, m12, p2, tolerance / 2)
  );
}

/**
 * Length of one half-piece's armhole curve, in cm.
 *
 * Mirrors the quadratic drawn by `buildBodyPiece`: from the shoulder end
 * down to the underarm point, with the control pulled inward to give a
 * scooped armhole shape.
 */
export function armholeCurveLength(
  halfWidthCm: number,
  armholeDepthCm: number,
  shoulderHalfCm: number,
  shoulderDropCm: number,
): number {
  return bezierQuadLength(
    [shoulderHalfCm, shoulderDropCm],
    [halfWidthCm * 0.92, armholeDepthCm * 0.45],
    [halfWidthCm, armholeDepthCm],
  );
}

/**
 * Total cap length for a sleeve of width `W` and cap height `cap`,
 * in the same units as the inputs. Matches the two quadratics drawn
 * by `buildSleeve` exactly.
 */
export function sleeveCapLength(W: number, cap: number): number {
  const left = bezierQuadLength([0, cap], [W * 0.18, cap * 0.15], [W / 2, 0]);
  const right = bezierQuadLength([W / 2, 0], [W * 0.82, cap * 0.15], [W, cap]);
  return left + right;
}

/**
 * Solve for the sleeve width whose cap arc length equals `targetCm`.
 *
 * Iterative proportional scaling: cap length is roughly linear in W for
 * fixed cap height, so each step scales W by `target / current`. This
 * converges to ±0.5 mm in 4–8 iterations for any realistic input.
 * Falls back to bisection if the proportional step ever overshoots.
 *
 * Returns `{ width, capLength, iterations, converged }` so callers can
 * verify the solver hit its tolerance.
 */
export function solveSleeveWidthForCap(
  targetCm: number,
  capHeightCm: number,
  toleranceCm = SLEEVE_TOLERANCE_CM,
  maxIterations = 50,
): { width: number; capLength: number; iterations: number; converged: boolean } {
  // Seed: at narrow widths the cap is roughly target − 2·cap on the chord;
  // start at half the target which is always below the answer.
  let width = Math.max(capHeightCm * 1.5, targetCm * 0.5);
  let capLength = sleeveCapLength(width, capHeightCm);

  // Bracket [lo, hi] for the bisection fallback.
  let lo = capHeightCm * 0.5;
  let hi = Math.max(targetCm * 2, capHeightCm * 4);
  while (sleeveCapLength(hi, capHeightCm) < targetCm) hi *= 1.5;

  let iterations = 0;
  let converged = false;
  for (; iterations < maxIterations; iterations++) {
    const diff = targetCm - capLength;
    if (Math.abs(diff) <= toleranceCm) {
      converged = true;
      break;
    }
    if (capLength < targetCm) lo = width;
    else hi = width;

    // Proportional scaling step.
    let next = width * (targetCm / capLength);
    // Guard: keep the step inside the bracket.
    if (next <= lo || next >= hi) next = (lo + hi) / 2;
    width = next;
    capLength = sleeveCapLength(width, capHeightCm);
  }
  return { width, capLength, iterations, converged };
}

/* ---------- Pattern generation ---------- */

export function generatePattern(input: Measurements): PatternData {
  const m = clampMeasurements(input);
  const fabric = FABRICS[m.fabric];

  const fit = FITS[m.fit];

  // Body adjustments for stretch fabrics.
  // Knits hug the body: reduce ease and shorten the armhole slightly so
  // the sleeve doesn't gape. Multipliers stay close to 1 for cotton.
  const easeAdjust = 1 - fabric.stretch * 0.5;        // cotton≈0.975, jersey≈0.9, rib≈0.8
  const armholeAdjust = 1 - fabric.stretch * 0.15;    // cotton≈0.9925, jersey≈0.97, rib≈0.94

  // Fit drives ease (body width), shirt length, cap height (sleeve width)
  // and cap ease factor — all three pattern-defining levers.
  const ease = fit.ease * easeAdjust;
  const halfChest = (m.chest + ease) / 2;          // cm
  const frontWidth = halfChest * 0.48;             // cm
  const backWidth = halfChest * 0.52;              // cm
  const armholeDepth = (m.chest / 4 + fit.armholeExtra) * armholeAdjust; // cm
  const capHeight = armholeDepth * fit.capHeightFactor;  // cm — fit-driven

  // Apply the fit's length delta and re-clamp so we never go below the
  // minimum shirt length even on tight fits.
  const shirtLength = Math.max(60, m.shirtLength + fit.lengthDelta);

  const neckWidth = m.neck / 5;                    // cm (half-width on fold)
  const frontNeckDepth = m.neck / 5 + 1;
  const backNeckDepth = 2.5;

  const shoulderHalf = m.shoulder / 2;             // cm (on fold)
  const shoulderDrop = 3;                          // cm

  // ---- Sleeve cap matched to actual armhole circumference ----
  // target = armhole × (1 + capEase). The cap ease is fabric-driven
  // (knits sit smoothly with less ease, wovens need more for movement)
  // and fit-modulated (relaxed sleeves carry more ease, tight less),
  // then hard-capped at MAX_CAP_EXCESS so we never exceed the spec's 3%.
  const armholeFrontCm = armholeCurveLength(frontWidth, armholeDepth, shoulderHalf, shoulderDrop);
  const armholeBackCm = armholeCurveLength(backWidth, armholeDepth, shoulderHalf, shoulderDrop);
  const armholeFullCm = armholeFrontCm + armholeBackCm;
  const fabricCapEase = Math.max(0, 0.05 - fabric.stretch * 0.1); // cotton≈4.5%, jersey≈3%, rib≈1%
  const capEase = Math.min(MAX_CAP_EXCESS, fabricCapEase * fit.sleeveEaseFactor);
  const target = armholeFullCm * (1 + capEase);
  const solved = solveSleeveWidthForCap(target, capHeight);
  // Post-condition guard: enforce the spec's "not shorter, not >3% over"
  // even if the iterative solver lands slightly off in pathological inputs.
  const minTarget = armholeFullCm;
  const maxTarget = armholeFullCm * (1 + MAX_CAP_EXCESS);
  let sleeveWidth = solved.width;
  if (solved.capLength < minTarget) {
    sleeveWidth = solveSleeveWidthForCap(minTarget, capHeight).width;
  } else if (solved.capLength > maxTarget) {
    sleeveWidth = solveSleeveWidthForCap(maxTarget, capHeight).width;
  }

  // body taper — keep 48/52 split for waist matching the body pieces
  const frontWaist = ((m.chest - 2 + ease) / 2) * 0.48;
  const backWaist = ((m.chest - 2 + ease) / 2) * 0.52;

  /* ---- Build FRONT piece (half, cut on fold; left edge = fold) ---- */
  const front = buildBodyPiece({
    label: "FRONT",
    halfWidth: frontWidth,
    waistHalf: frontWaist,
    length: shirtLength,
    armholeDepth,
    shoulderHalf,
    shoulderDrop,
    neckWidth,
    neckDepth: frontNeckDepth,
    cutNote: "Cut 1 on fold",
  });

  const back = buildBodyPiece({
    label: "BACK",
    halfWidth: backWidth,
    waistHalf: backWaist,
    length: shirtLength,
    armholeDepth,
    shoulderHalf,
    shoulderDrop,
    neckWidth,
    neckDepth: backNeckDepth,
    cutNote: "Cut 1 on fold",
  });

  /* ---- Sleeve ---- */
  const sleeve = buildSleeve({
    sleeveWidth,
    sleeveLength: m.sleeveLength,
    capHeight,
  });

  /* ---- Neckband (high-precision, fabric-aware) ---- */
  // The half-neckline curves are quadratic Béziers from the centre-front /
  // centre-back fold to the shoulder. Compute each with recursive De
  // Casteljau then double — both halves are mirrored on the fold.
  const frontHalfMm = bezierQuadLength(
    [0, frontNeckDepth * MM],
    [neckWidth * MM * 0.5, 0],
    [neckWidth * MM, 0],
  );
  const backHalfMm = bezierQuadLength(
    [0, backNeckDepth * MM],
    [neckWidth * MM * 0.5, 0],
    [neckWidth * MM, 0],
  );
  const frontNecklineCm = (frontHalfMm * 2) / MM;
  const backNecklineCm = (backHalfMm * 2) / MM;
  const necklineLengthCm = frontNecklineCm + backNecklineCm;

  // Smart band: shorter band → snug fit. Stretch is the primary driver,
  // recovery scales how aggressively we can pull in (a fabric that won't
  // snap back gets a longer, more forgiving band).
  const effectiveStretch = fabric.stretch * fabric.recovery;
  const neckbandLengthCm = necklineLengthCm * (1 - effectiveStretch * 0.6);
  const neckband = buildNeckband(neckbandLengthCm, 5);

  return {
    pieces: [front, back, sleeve, neckband],
    derived: {
      halfChest,
      frontWidth,
      backWidth,
      armholeDepth,
      capHeight,
      sleeveWidth,
      effectiveShirtLength: shirtLength,
      necklineLength: necklineLengthCm,
      frontNecklineLength: frontNecklineCm,
      backNecklineLength: backNecklineCm,
      neckbandLength: neckbandLengthCm,
      ease,
      fabric: m.fabric,
      fabricProfile: fabric,
      fit: m.fit,
      fitProfile: fit,
      effectiveStretch,
    },
    measurements: m,
  };
}

/* ---------- Piece builders (all in mm) ---------- */

interface BodyPieceArgs {
  label: string;
  halfWidth: number;       // cm
  waistHalf: number;       // cm
  length: number;          // cm
  armholeDepth: number;    // cm
  shoulderHalf: number;    // cm
  shoulderDrop: number;    // cm
  neckWidth: number;       // cm
  neckDepth: number;       // cm
  cutNote: string;
}

function buildBodyPiece(a: BodyPieceArgs): PatternPiece {
  const W = a.halfWidth * MM;
  const Wwaist = a.waistHalf * MM;
  const H = a.length * MM;
  const ah = a.armholeDepth * MM;
  const shHalf = a.shoulderHalf * MM;
  const shDrop = a.shoulderDrop * MM;
  const nW = a.neckWidth * MM;
  const nD = a.neckDepth * MM;

  // Coordinate system: (0,0) top-left = center fold at top
  // Left edge (x=0) = fold. Right edge = side seam.
  // Points:
  const neckTop: [number, number] = [0, nD];
  const neckShoulder: [number, number] = [nW, 0];
  const shoulderEnd: [number, number] = [shHalf, shDrop];
  const armholeEnd: [number, number] = [W, ah];
  const sideHem: [number, number] = [Wwaist, H];
  const hemFold: [number, number] = [0, H];

  // Control points (quadratic) - smooth curves
  const neckCtrl: [number, number] = [nW * 0.55, nD * 0.15];
  const armCtrl: [number, number] = [W * 0.92, ah * 0.45];
  // side seam slight inward curve toward waist
  const sideCtrl: [number, number] = [W - (W - Wwaist) * 0.4, ah + (H - ah) * 0.55];

  const cutPath = [
    `M ${neckTop[0]} ${neckTop[1]}`,
    `Q ${neckCtrl[0]} ${neckCtrl[1]} ${neckShoulder[0]} ${neckShoulder[1]}`,
    `L ${shoulderEnd[0]} ${shoulderEnd[1]}`,
    `Q ${armCtrl[0]} ${armCtrl[1]} ${armholeEnd[0]} ${armholeEnd[1]}`,
    `Q ${sideCtrl[0]} ${sideCtrl[1]} ${sideHem[0]} ${sideHem[1]}`,
    `L ${hemFold[0]} ${hemFold[1]}`,
    `Z`,
  ].join(" ");

  // Seam allowance: offset each edge outward
  const saSide = SA.side * MM;
  const saShoulder = SA.shoulder * MM;
  const saNeck = SA.neckline * MM;
  const saHem = SA.hem * MM;

  // SA polygon (approximation: offset key points)
  const saNeckTop: [number, number] = [neckTop[0], neckTop[1] - saNeck];
  const saNeckShoulder: [number, number] = [neckShoulder[0], neckShoulder[1] - saNeck];
  const saShoulderEnd: [number, number] = [shoulderEnd[0] + saShoulder * 0.6, shoulderEnd[1] - saShoulder * 0.8];
  const saArmEnd: [number, number] = [armholeEnd[0] + saSide, armholeEnd[1]];
  const saSideHem: [number, number] = [sideHem[0] + saSide, sideHem[1] + saHem];
  const saHemFold: [number, number] = [0, sideHem[1] + saHem];

  const saNeckCtrl: [number, number] = [neckCtrl[0], neckCtrl[1] - saNeck];
  const saArmCtrl: [number, number] = [armCtrl[0] + saSide, armCtrl[1]];
  const saSideCtrl: [number, number] = [sideCtrl[0] + saSide, sideCtrl[1]];

  const seamPath = [
    `M ${saNeckTop[0]} ${saNeckTop[1]}`,
    `Q ${saNeckCtrl[0]} ${saNeckCtrl[1]} ${saNeckShoulder[0]} ${saNeckShoulder[1]}`,
    `L ${saShoulderEnd[0]} ${saShoulderEnd[1]}`,
    `Q ${saArmCtrl[0]} ${saArmCtrl[1]} ${saArmEnd[0]} ${saArmEnd[1]}`,
    `Q ${saSideCtrl[0]} ${saSideCtrl[1]} ${saSideHem[0]} ${saSideHem[1]}`,
    `L ${saHemFold[0]} ${saHemFold[1]}`,
    `Z`,
  ].join(" ");

  const bboxW = Math.max(W, Wwaist) + saSide;
  const bboxH = H + saHem;

  const cx = bboxW / 2;
  const cy = ah + (H - ah) / 2;

  return {
    label: a.label,
    width: bboxW,
    height: bboxH,
    cutPath,
    seamPath,
    foldEdge: "left",
    grainline: { x1: cx, y1: ah + 30, x2: cx, y2: H - 60 },
    annotations: [
      { x: cx, y: cy - 30, text: a.label, size: 32, bold: true },
      { x: cx, y: cy, text: `${a.halfWidth.toFixed(1)} × ${a.length} cm (half)`, size: 14 },
      { x: cx, y: cy + 22, text: a.cutNote, size: 13 },
    ],
  };
}

interface SleeveArgs {
  sleeveWidth: number;   // cm (full width at cap)
  sleeveLength: number;  // cm
  capHeight: number;     // cm
}

function buildSleeve(a: SleeveArgs): PatternPiece {
  const W = a.sleeveWidth * MM;
  const L = a.sleeveLength * MM;
  const cap = a.capHeight * MM;
  const cuffInset = W * 0.1;

  // Coordinates: top-left bbox at (0, 0). Cap top at y=0.
  const leftCap: [number, number] = [0, cap];
  const topMid: [number, number] = [W / 2, 0];
  const rightCap: [number, number] = [W, cap];
  const rightCuff: [number, number] = [W - cuffInset, L];
  const leftCuff: [number, number] = [cuffInset, L];

  // Smooth sleeve cap with two quadratics, slight S-curve
  const leftCtrl: [number, number] = [W * 0.18, cap * 0.15];
  const rightCtrl: [number, number] = [W * 0.82, cap * 0.15];

  const cutPath = [
    `M ${leftCap[0]} ${leftCap[1]}`,
    `Q ${leftCtrl[0]} ${leftCtrl[1]} ${topMid[0]} ${topMid[1]}`,
    `Q ${rightCtrl[0]} ${rightCtrl[1]} ${rightCap[0]} ${rightCap[1]}`,
    `L ${rightCuff[0]} ${rightCuff[1]}`,
    `L ${leftCuff[0]} ${leftCuff[1]}`,
    `Z`,
  ].join(" ");

  const saSide = SA.side * MM;
  const saHem = SA.hem * MM;
  const saArm = SA.shoulder * MM;

  const seamPath = [
    `M ${leftCap[0] - saSide} ${leftCap[1]}`,
    `Q ${leftCtrl[0]} ${leftCtrl[1] - saArm} ${topMid[0]} ${topMid[1] - saArm}`,
    `Q ${rightCtrl[0]} ${rightCtrl[1] - saArm} ${rightCap[0] + saSide} ${rightCap[1]}`,
    `L ${rightCuff[0] + saSide} ${rightCuff[1] + saHem}`,
    `L ${leftCuff[0] - saSide} ${leftCuff[1] + saHem}`,
    `Z`,
  ].join(" ");

  const bboxW = W + saSide * 2;
  const bboxH = L + saHem + saArm;

  const cx = W / 2;
  const cy = cap + (L - cap) / 2;

  return {
    label: "SLEEVE",
    width: bboxW,
    height: bboxH,
    cutPath,
    seamPath,
    grainline: { x1: cx, y1: cap + 30, x2: cx, y2: L - 40 },
    annotations: [
      { x: cx, y: cy - 20, text: "SLEEVE", size: 30, bold: true },
      { x: cx, y: cy + 5, text: `${a.sleeveWidth.toFixed(1)} × ${a.sleeveLength} cm`, size: 14 },
      { x: cx, y: cy + 26, text: "Cut 2 (mirrored)", size: 13 },
    ],
  };
}

function buildNeckband(lengthCm: number, widthCm: number): PatternPiece {
  const W = lengthCm * MM;
  const H = widthCm * MM;
  const saSide = SA.shoulder * MM;
  const saTop = SA.neckline * MM;

  const cutPath = `M 0 0 L ${W} 0 L ${W} ${H} L 0 ${H} Z`;
  const seamPath = `M ${-saSide} ${-saTop} L ${W + saSide} ${-saTop} L ${W + saSide} ${H + saTop} L ${-saSide} ${H + saTop} Z`;

  const bboxW = W + saSide * 2;
  const bboxH = H + saTop * 2;

  return {
    label: "NECKBAND",
    width: bboxW,
    height: bboxH,
    cutPath,
    seamPath,
    annotations: [
      { x: W / 2, y: H / 2 - 6, text: "NECKBAND", size: 22, bold: true },
      { x: W / 2, y: H / 2 + 14, text: `${lengthCm.toFixed(1)} × ${widthCm} cm · Cut 1`, size: 12 },
    ],
  };
}

/* ---------- Layout + SVG ---------- */

import { layoutPieces, MIN_SPACING_PX, PX_PER_CM, type LayoutResult } from "./layoutEngine";

export interface BuildSvgOptions {
  /** Container width in px the layout should target. Defaults to 1200. */
  maxWidth?: number;
  /** Spacing between pieces in px. Floored to 5 cm. */
  spacing?: number;
  /** Outer padding around the layout in px. */
  padding?: number;
}

/**
 * Render the pattern to an SVG string using the robust layout engine.
 * Pieces are measured (true bbox) then placed in a horizontal flow with
 * automatic wrapping; layout is validated to be overlap-free.
 */
export function buildSvgString(data: PatternData, opts?: BuildSvgOptions): string {
  const layout = layoutPieces(data.pieces, {
    maxWidth: opts?.maxWidth ?? 1200,
    spacing: opts?.spacing ?? MIN_SPACING_PX,
    padding: opts?.padding ?? 40,
  });
  return renderLayoutSvg(layout);
}

/** Render a precomputed layout to an SVG string. */
export function renderLayoutSvg(layout: LayoutResult): string {
  const { positioned, totalWidth, totalHeight } = layout;

  const stroke = "#0f172a";
  const seamStroke = "#94a3b8";
  const labelFill = "#0f172a";
  const foldFill = "#3b82f6";

  const piecesSvg = positioned
    .map(({ piece, bbox, x, y }) => {
      // Translate piece-local geometry so its bbox top-left lands at (x, y).
      const tx = x - bbox.x;
      const ty = y - bbox.y;

      const annotations = piece.annotations
        .map(
          (a) =>
            `<text x="${a.x}" y="${a.y}" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="${
              a.size ?? 14
            }" font-weight="${a.bold ? 700 : 500}" fill="${labelFill}">${a.text}</text>`,
        )
        .join("");

      const grain = piece.grainline
        ? `
          <g stroke="${labelFill}" stroke-width="1.5" fill="none">
            <line x1="${piece.grainline.x1}" y1="${piece.grainline.y1}" x2="${piece.grainline.x2}" y2="${piece.grainline.y2}" />
            <polygon points="${piece.grainline.x1 - 5},${piece.grainline.y1 + 8} ${piece.grainline.x1 + 5},${piece.grainline.y1 + 8} ${piece.grainline.x1},${piece.grainline.y1 - 2}" fill="${labelFill}" />
            <polygon points="${piece.grainline.x2 - 5},${piece.grainline.y2 - 8} ${piece.grainline.x2 + 5},${piece.grainline.y2 - 8} ${piece.grainline.x2},${piece.grainline.y2 + 2}" fill="${labelFill}" />
          </g>
        `
        : "";

      const foldH = bbox.height;
      const fold =
        piece.foldEdge === "left"
          ? `<line x1="0" y1="${bbox.y}" x2="0" y2="${bbox.y + foldH}" stroke="${foldFill}" stroke-width="2" stroke-dasharray="8 6" />
             <text x="6" y="${bbox.y + foldH / 2}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="12" fill="${foldFill}" transform="rotate(-90, 6, ${bbox.y + foldH / 2})" text-anchor="middle">FOLD</text>`
          : "";

      return `
        <g transform="translate(${tx}, ${ty})">
          <path d="${piece.seamPath}" fill="none" stroke="${seamStroke}" stroke-width="1.2" stroke-dasharray="6 4" />
          <path d="${piece.cutPath}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linejoin="round" />
          ${fold}
          ${grain}
          ${annotations}
        </g>
      `;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${totalHeight}" width="100%" preserveAspectRatio="xMidYMid meet">
    <rect width="100%" height="100%" fill="#ffffff" />
    <defs>
      <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
        <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#e5e7eb" stroke-width="1" />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#grid)" opacity="0.4" />
    ${piecesSvg}
  </svg>`;
}

/** Total layout footprint in cm, useful for choosing PDF page size. */
export function getLayoutBounds(
  data: PatternData,
  opts?: BuildSvgOptions,
): { widthCm: number; heightCm: number; overlapFree: boolean } {
  const layout = layoutPieces(data.pieces, {
    maxWidth: opts?.maxWidth ?? 1200,
    spacing: opts?.spacing ?? MIN_SPACING_PX,
    padding: opts?.padding ?? 40,
  });
  return {
    widthCm: layout.totalWidth / PX_PER_CM,
    heightCm: layout.totalHeight / PX_PER_CM,
    overlapFree: layout.overlapFree,
  };
}
