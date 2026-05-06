/**
 * Parametric 2D T-shirt silhouette.
 *
 * Pipeline (each step is a pure function):
 *   sanitize → computeBase → deriveVisual → buildPoints → buildPath → <svg/>
 *
 * The silhouette is a *visual mockup* (not a sewing pattern). It mirrors the
 * user's measurements so they can see how chest/shoulder/sleeve/length/neck
 * changes affect the garment shape in real time.
 *
 * All internal math is in centimetres. The SVG viewBox is sized in cm and
 * centred so the shirt always fits, regardless of measurement extremes.
 */

import { useMemo } from "react";

/* ------------------------------------------------------------------ */
/* 1. Inputs                                                           */
/* ------------------------------------------------------------------ */

export interface SilhouetteMeasurements {
  chest: number; // full chest circumference, cm
  shoulder: number; // shoulder seam to seam, cm
  sleeveLength: number; // shoulder point → cuff, cm
  shirtLength: number; // HPS → hem, cm
  neck: number; // neck circumference, cm
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
/* 3. computeBase — raw garment dimensions                             */
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
  width: number; // halfChest, mirrored across centre
  height: number; // shirt length
  shoulderHalf: number;
  neckHalf: number;
  neckDepth: number;
  shoulderDrop: number;
  sleeveDrop: number;
  armpitY: number;
  taper: number;
  sleeveLength: number;
}

function deriveVisual(b: Base): Visual {
  const width = b.halfChest;
  const height = b.shirtLength;
  // Neck opening width: ~ neck / π, with a sane minimum so very small inputs
  // still draw a visible curve.
  const neckHalf = Math.max(5, b.halfNeck / Math.PI + 1);
  return {
    width,
    height,
    shoulderHalf: Math.min(b.halfShoulder, width - 1),
    neckHalf,
    neckDepth: neckHalf * 0.6,
    shoulderDrop: height * 0.05,
    sleeveDrop: height * 0.22,
    armpitY: height * 0.28,
    taper: width * 0.08,
    sleeveLength: b.sleeveLength,
  };
}

/* ------------------------------------------------------------------ */
/* 5. buildPoints — symmetric anchor points                            */
/* ------------------------------------------------------------------ */

interface Pt {
  x: number;
  y: number;
}

interface Points {
  neckLeft: Pt;
  neckRight: Pt;
  neckBottom: Pt;
  shoulderLeft: Pt;
  shoulderRight: Pt;
  sleeveLeft: Pt;
  sleeveRight: Pt;
  sleeveCuffLeftInner: Pt;
  sleeveCuffRightInner: Pt;
  armpitLeft: Pt;
  armpitRight: Pt;
  hemLeft: Pt;
  hemRight: Pt;
}

function buildPoints(v: Visual): Points {
  // Coordinate system: centre x = 0, top y = 0, hem y = +height.
  const neckLeft: Pt = { x: -v.neckHalf, y: 0 };
  const neckRight: Pt = { x: v.neckHalf, y: 0 };
  const neckBottom: Pt = { x: 0, y: v.neckDepth };

  const shoulderLeft: Pt = { x: -v.shoulderHalf, y: v.shoulderDrop };
  const shoulderRight: Pt = { x: v.shoulderHalf, y: v.shoulderDrop };

  // CRITICAL: sleeves angle DOWNWARD from the shoulder.
  const sleeveDx = v.sleeveLength * 0.7;
  const sleeveLeft: Pt = {
    x: shoulderLeft.x - sleeveDx,
    y: shoulderLeft.y + v.sleeveDrop,
  };
  const sleeveRight: Pt = {
    x: shoulderRight.x + sleeveDx,
    y: shoulderRight.y + v.sleeveDrop,
  };
  // Inner cuff edge → meets armpit via a curve.
  const sleeveCuffLeftInner: Pt = {
    x: sleeveLeft.x + v.sleeveLength * 0.18,
    y: sleeveLeft.y + v.sleeveLength * 0.22,
  };
  const sleeveCuffRightInner: Pt = {
    x: sleeveRight.x - v.sleeveLength * 0.18,
    y: sleeveRight.y + v.sleeveLength * 0.22,
  };

  const armpitLeft: Pt = { x: -v.width, y: v.armpitY };
  const armpitRight: Pt = { x: v.width, y: v.armpitY };

  // Slight inward taper from armpit → hem (avoids boxy rectangle).
  const hemLeft: Pt = { x: -(v.width - v.taper), y: v.height };
  const hemRight: Pt = { x: v.width - v.taper, y: v.height };

  return {
    neckLeft,
    neckRight,
    neckBottom,
    shoulderLeft,
    shoulderRight,
    sleeveLeft,
    sleeveRight,
    sleeveCuffLeftInner,
    sleeveCuffRightInner,
    armpitLeft,
    armpitRight,
    hemLeft,
    hemRight,
  };
}

/* ------------------------------------------------------------------ */
/* 6. buildPath — single closed silhouette path                        */
/* ------------------------------------------------------------------ */

const fmt = (n: number) => n.toFixed(2);
const M = (p: Pt) => `M ${fmt(p.x)} ${fmt(p.y)}`;
const L = (p: Pt) => `L ${fmt(p.x)} ${fmt(p.y)}`;
const Q = (c: Pt, p: Pt) => `Q ${fmt(c.x)} ${fmt(c.y)} ${fmt(p.x)} ${fmt(p.y)}`;

function buildPath(p: Points): { body: string; neck: string } {
  // Body outline, traced clockwise starting at the right neck edge.
  const body = [
    M(p.neckRight),
    // Right shoulder slope (gentle quadratic curve)
    Q({ x: (p.neckRight.x + p.shoulderRight.x) / 2, y: p.shoulderRight.y * 0.4 }, p.shoulderRight),
    // Sleeve top (down + outward)
    Q(
      { x: p.shoulderRight.x + (p.sleeveRight.x - p.shoulderRight.x) * 0.55, y: p.shoulderRight.y },
      p.sleeveRight,
    ),
    // Cuff (short straight)
    L(p.sleeveCuffRightInner),
    // Sleeve underarm curve back to armpit
    Q(
      { x: (p.sleeveCuffRightInner.x + p.armpitRight.x) / 2, y: p.armpitRight.y - (p.armpitRight.y - p.sleeveCuffRightInner.y) * 0.2 },
      p.armpitRight,
    ),
    // Body side: armpit → hem (subtle inward taper)
    Q(
      { x: p.armpitRight.x - (p.armpitRight.x - p.hemRight.x) * 0.3, y: (p.armpitRight.y + p.hemRight.y) / 2 },
      p.hemRight,
    ),
    // Hem (straight across)
    L(p.hemLeft),
    // Mirror back up the left side
    Q(
      { x: p.armpitLeft.x - (p.armpitLeft.x - p.hemLeft.x) * 0.3, y: (p.armpitLeft.y + p.hemLeft.y) / 2 },
      p.armpitLeft,
    ),
    Q(
      { x: (p.sleeveCuffLeftInner.x + p.armpitLeft.x) / 2, y: p.armpitLeft.y - (p.armpitLeft.y - p.sleeveCuffLeftInner.y) * 0.2 },
      p.sleeveCuffLeftInner,
    ),
    L(p.sleeveLeft),
    Q(
      { x: p.shoulderLeft.x + (p.sleeveLeft.x - p.shoulderLeft.x) * 0.55, y: p.shoulderLeft.y },
      p.shoulderLeft,
    ),
    Q({ x: (p.neckLeft.x + p.shoulderLeft.x) / 2, y: p.shoulderLeft.y * 0.4 }, p.neckLeft),
    // Neckline (smooth scoop)
    Q(p.neckBottom, p.neckRight),
    "Z",
  ].join(" ");

  // Separate neckline highlight stroke (so it reads visually).
  const neck = [
    M(p.neckLeft),
    Q(p.neckBottom, p.neckRight),
  ].join(" ");

  return { body, neck };
}

/* ------------------------------------------------------------------ */
/* 7. React component                                                  */
/* ------------------------------------------------------------------ */

export interface TshirtSilhouetteProps {
  measurements: SilhouetteMeasurements;
  className?: string;
  /** Optional fill colour for the shirt body. Defaults to a soft neutral. */
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
    const paths = buildPath(points);

    // viewBox: fit the full silhouette including extended sleeves with padding.
    const sleeveExtent = visual.shoulderHalf + visual.sleeveLength * 0.7;
    const halfW = sleeveExtent + 4;
    const top = -4;
    const bottom = visual.height + 4;
    const viewBox = `${-halfW} ${top} ${halfW * 2} ${bottom - top}`;
    return { paths, viewBox };
  }, [measurements]);

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
        stroke="#2B2B2B"
        strokeWidth={1.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={paths.neck}
        fill="none"
        stroke="#2B2B2B"
        strokeWidth={1.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export default TshirtSilhouette;
