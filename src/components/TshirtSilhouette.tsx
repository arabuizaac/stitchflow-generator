/**
 * Parametric 2D T-shirt silhouette — fashion flat / tech-sketch style.
 *
 * Pipeline:
 *   sanitize → computeBase → deriveVisual → buildPoints → buildPath → <svg/>
 *
 * Goal: match professional flat-sketch mockups with smooth sleeve caps,
 * defined armholes, natural shoulder slope, balanced body taper, and a
 * double-line ribbed neckline. All math is in centimetres; viewBox is
 * centred so the shirt always fits regardless of measurement extremes.
 */

import { useMemo } from "react";

/* ------------------------------------------------------------------ */
/* 1. Inputs                                                           */
/* ------------------------------------------------------------------ */

export interface SilhouetteMeasurements {
  chest: number;
  shoulder: number;
  sleeveLength: number;
  shirtLength: number;
  neck: number;
}

/* ------------------------------------------------------------------ */
/* 2. sanitize                                                         */
/* ------------------------------------------------------------------ */

function sanitize(m: SilhouetteMeasurements): SilhouetteMeasurements {
  const safe = (n: number, fallback: number) =>
    Number.isFinite(n) && n > 0 ? n : fallback;
  return {
    chest: Math.max(40, Math.min(200, safe(m.chest, 96))),
    shoulder: Math.max(20, Math.min(80, safe(m.shoulder, 44))),
    sleeveLength: Math.max(10, Math.min(90, safe(m.sleeveLength, 60))),
    shirtLength: Math.max(40, Math.min(120, safe(m.shirtLength, 72))),
    neck: Math.max(20, Math.min(80, safe(m.neck, 38))),
  };
}

/* ------------------------------------------------------------------ */
/* 3. computeBase                                                      */
/* ------------------------------------------------------------------ */

interface Base {
  halfChest: number;
  halfShoulder: number;
  halfNeck: number;
  shirtLength: number;
  sleeveLength: number;
}

function computeBase(m: SilhouetteMeasurements): Base {
  return {
    halfChest: m.chest / 2,
    halfShoulder: m.shoulder / 2,
    halfNeck: m.neck / 2,
    shirtLength: m.shirtLength,
    sleeveLength: m.sleeveLength,
  };
}

/* ------------------------------------------------------------------ */
/* 4. deriveVisual — proportional drawing values                       */
/* ------------------------------------------------------------------ */

interface Visual {
  width: number;          // halfChest, mirrored
  height: number;         // shirt length
  shoulderHalf: number;
  neckHalf: number;
  neckDepth: number;
  shoulderDrop: number;   // 5% of height
  sleeveDrop: number;     // 18% of height (cuff vertical drop from shoulder)
  armholeDepth: number;   // 28% of height (underarm Y)
  taper: number;          // 6% of width (waist inset)
  sleeveVisual: number;   // sleeveLength * 0.65 (horizontal extent factor)
}

function deriveVisual(b: Base): Visual {
  const width = b.halfChest;
  const height = b.shirtLength;
  const neckHalf = Math.max(5, b.halfNeck / Math.PI + 1);
  return {
    width,
    height,
    shoulderHalf: Math.min(b.halfShoulder, width - 1),
    neckHalf,
    neckDepth: neckHalf * 0.55,
    shoulderDrop: height * 0.05,
    sleeveDrop: height * 0.18,
    armholeDepth: height * 0.28,
    taper: width * 0.06,
    sleeveVisual: b.sleeveLength * 0.65,
  };
}

/* ------------------------------------------------------------------ */
/* 5. buildPoints — ordered anchor points (right side; mirror for left) */
/* ------------------------------------------------------------------ */

interface Pt { x: number; y: number; }

interface Points {
  neckRight: Pt;
  neckLeft: Pt;
  neckBottom: Pt;
  shoulderR: Pt;
  shoulderL: Pt;
  sleeveCapR: Pt;     // highest outer sleeve point
  sleeveCapL: Pt;
  sleeveEndR: Pt;     // outer cuff corner
  sleeveEndL: Pt;
  sleeveInnerR: Pt;   // inner cuff corner (under sleeve)
  sleeveInnerL: Pt;
  underarmR: Pt;
  underarmL: Pt;
  waistR: Pt;
  waistL: Pt;
  hemR: Pt;
  hemL: Pt;
}

function buildPoints(v: Visual): Points {
  // Centre x = 0, top y = 0, hem y = +height.
  const neckRight: Pt = { x: v.neckHalf, y: 0 };
  const neckLeft: Pt = { x: -v.neckHalf, y: 0 };
  const neckBottom: Pt = { x: 0, y: v.neckDepth };

  const shoulderR: Pt = { x: v.shoulderHalf, y: v.shoulderDrop };
  const shoulderL: Pt = { x: -v.shoulderHalf, y: v.shoulderDrop };

  // Sleeve cap = highest outer point of sleeve, slightly out & down from shoulder.
  const sleeveCapR: Pt = {
    x: shoulderR.x + v.sleeveVisual * 0.55,
    y: shoulderR.y + v.sleeveDrop * 0.35,
  };
  const sleeveCapL: Pt = { x: -sleeveCapR.x, y: sleeveCapR.y };

  // Sleeve end (outer cuff) — further out and down.
  const sleeveEndR: Pt = {
    x: shoulderR.x + v.sleeveVisual,
    y: shoulderR.y + v.sleeveDrop,
  };
  const sleeveEndL: Pt = { x: -sleeveEndR.x, y: sleeveEndR.y };

  // Inner cuff (under sleeve) — straight cuff edge, slightly above & inward.
  const cuffHeight = v.sleeveVisual * 0.32;
  const sleeveInnerR: Pt = {
    x: sleeveEndR.x - cuffHeight * 0.35,
    y: sleeveEndR.y - cuffHeight,
  };
  const sleeveInnerL: Pt = { x: -sleeveInnerR.x, y: sleeveInnerR.y };

  const underarmR: Pt = { x: v.width, y: v.armholeDepth };
  const underarmL: Pt = { x: -v.width, y: v.armholeDepth };

  // Waist — slight inward taper, ~60% down the body.
  const waistY = v.armholeDepth + (v.height - v.armholeDepth) * 0.55;
  const waistR: Pt = { x: v.width - v.taper, y: waistY };
  const waistL: Pt = { x: -waistR.x, y: waistY };

  // Hem — straight, slightly wider than waist for natural drape.
  const hemR: Pt = { x: v.width - v.taper * 0.4, y: v.height };
  const hemL: Pt = { x: -hemR.x, y: v.height };

  return {
    neckRight, neckLeft, neckBottom,
    shoulderR, shoulderL,
    sleeveCapR, sleeveCapL,
    sleeveEndR, sleeveEndL,
    sleeveInnerR, sleeveInnerL,
    underarmR, underarmL,
    waistR, waistL,
    hemR, hemL,
  };
}

/* ------------------------------------------------------------------ */
/* 6. buildPath                                                        */
/* ------------------------------------------------------------------ */

const f = (n: number) => n.toFixed(2);
const M = (p: Pt) => `M ${f(p.x)} ${f(p.y)}`;
const L = (p: Pt) => `L ${f(p.x)} ${f(p.y)}`;
const Q = (c: Pt, p: Pt) => `Q ${f(c.x)} ${f(c.y)} ${f(p.x)} ${f(p.y)}`;
const mid = (a: Pt, b: Pt, dx = 0, dy = 0): Pt => ({
  x: (a.x + b.x) / 2 + dx,
  y: (a.y + b.y) / 2 + dy,
});

function buildPath(p: Points, v: Visual): {
  body: string;
  neckOuter: string;
  neckInner: string;
} {
  // Trace clockwise from right neck edge.
  const body = [
    M(p.neckRight),

    // Neck → shoulder: gentle shoulder slope (control pulled slightly up).
    Q(mid(p.neckRight, p.shoulderR, 0, -v.shoulderDrop * 0.2), p.shoulderR),

    // Shoulder → sleeve cap: rounded dome top of sleeve.
    Q(
      { x: p.shoulderR.x + (p.sleeveCapR.x - p.shoulderR.x) * 0.45,
        y: p.shoulderR.y - v.sleeveDrop * 0.15 },
      p.sleeveCapR,
    ),

    // Sleeve cap → sleeve end: smooth outer sleeve curve.
    Q(
      { x: p.sleeveCapR.x + (p.sleeveEndR.x - p.sleeveCapR.x) * 0.6,
        y: p.sleeveCapR.y + (p.sleeveEndR.y - p.sleeveCapR.y) * 0.35 },
      p.sleeveEndR,
    ),

    // Cuff: straight edge across sleeve opening.
    L(p.sleeveInnerR),

    // Inner sleeve → underarm: inward armhole curve (concave).
    Q(
      { x: p.sleeveInnerR.x - (p.sleeveInnerR.x - p.underarmR.x) * 0.25,
        y: p.underarmR.y - (p.underarmR.y - p.sleeveInnerR.y) * 0.15 },
      p.underarmR,
    ),

    // Underarm → waist: slight inward taper.
    Q(
      { x: p.underarmR.x - (p.underarmR.x - p.waistR.x) * 0.2,
        y: (p.underarmR.y + p.waistR.y) / 2 },
      p.waistR,
    ),

    // Waist → hem: gentle outward flare.
    Q(
      { x: p.waistR.x + (p.hemR.x - p.waistR.x) * 0.4,
        y: (p.waistR.y + p.hemR.y) / 2 },
      p.hemR,
    ),

    // Hem: straight across.
    L(p.hemL),

    // Mirror up the left side.
    Q(
      { x: p.waistL.x + (p.hemL.x - p.waistL.x) * 0.4,
        y: (p.waistL.y + p.hemL.y) / 2 },
      p.waistL,
    ),
    Q(
      { x: p.underarmL.x - (p.underarmL.x - p.waistL.x) * 0.2,
        y: (p.underarmL.y + p.waistL.y) / 2 },
      p.underarmL,
    ),
    Q(
      { x: p.sleeveInnerL.x - (p.sleeveInnerL.x - p.underarmL.x) * 0.25,
        y: p.underarmL.y - (p.underarmL.y - p.sleeveInnerL.y) * 0.15 },
      p.sleeveInnerL,
    ),
    L(p.sleeveEndL),
    Q(
      { x: p.sleeveCapL.x + (p.sleeveEndL.x - p.sleeveCapL.x) * 0.6,
        y: p.sleeveCapL.y + (p.sleeveEndL.y - p.sleeveCapL.y) * 0.35 },
      p.sleeveCapL,
    ),
    Q(
      { x: p.shoulderL.x + (p.sleeveCapL.x - p.shoulderL.x) * 0.45,
        y: p.shoulderL.y - v.sleeveDrop * 0.15 },
      p.shoulderL,
    ),
    Q(mid(p.neckLeft, p.shoulderL, 0, -v.shoulderDrop * 0.2), p.neckLeft),

    // Outer neckline (closes the path).
    Q(p.neckBottom, p.neckRight),
    "Z",
  ].join(" ");

  // Outer neckline as its own stroke (overlays body).
  const neckOuter = [M(p.neckLeft), Q(p.neckBottom, p.neckRight)].join(" ");

  // Inner ribbed neckline: ~85% width, ~60% depth — sits below outer neck.
  const innerHalf = v.neckHalf * 0.85;
  const innerDepth = v.neckDepth * 0.6 + v.neckDepth * 0.4; // shifted down
  const innerLeft: Pt = { x: -innerHalf, y: v.neckDepth * 0.2 };
  const innerRight: Pt = { x: innerHalf, y: v.neckDepth * 0.2 };
  const innerBottom: Pt = { x: 0, y: innerDepth };
  const neckInner = [M(innerLeft), Q(innerBottom, innerRight)].join(" ");

  return { body, neckOuter, neckInner };
}

/* ------------------------------------------------------------------ */
/* 7. React component                                                  */
/* ------------------------------------------------------------------ */

export interface TshirtSilhouetteProps {
  measurements: SilhouetteMeasurements;
  className?: string;
  fill?: string;
}

export const TshirtSilhouette = ({
  measurements,
  className,
  fill = "hsl(var(--secondary))",
}: TshirtSilhouetteProps) => {
  const { paths, viewBox } = useMemo(() => {
    const sanitized = sanitize(measurements);
    const base = computeBase(sanitized);
    const visual = deriveVisual(base);
    const points = buildPoints(visual);
    const paths = buildPath(points, visual);

    const sleeveExtent = visual.shoulderHalf + visual.sleeveVisual;
    const halfW = sleeveExtent + 4;
    const top = -4;
    const bottom = visual.height + 4;
    const viewBox = `${-halfW} ${top} ${halfW * 2} ${bottom - top}`;
    return { paths, viewBox };
  }, [measurements]);

  const stroke = "#2B2B2B";
  return (
    <svg
      viewBox={viewBox}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="T-shirt silhouette preview"
    >
      <path
        d={paths.body}
        fill={fill}
        stroke={stroke}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={paths.neckOuter}
        fill="none"
        stroke={stroke}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={paths.neckInner}
        fill="none"
        stroke={stroke}
        strokeWidth={1}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.75}
      />
    </svg>
  );
};

export default TshirtSilhouette;
