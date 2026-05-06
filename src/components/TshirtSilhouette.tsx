/**
 * Parametric 2D T-shirt silhouette — fashion flat sketch style.
 *
 * Strategy: build ONE half (right side) using cubic Béziers, then mirror
 * via an SVG <use> with scale(-1, 1) for perfect symmetry. All math is in
 * centimetres; viewBox is centred so the shirt always fits.
 */

import { useMemo } from "react";

/* ---------- 1. Inputs ---------- */
export interface SilhouetteMeasurements {
  chest: number;
  shoulder: number;
  sleeveLength: number;
  shirtLength: number;
  neck: number;
}

/* ---------- 2. sanitize ---------- */
function sanitize(m: SilhouetteMeasurements): SilhouetteMeasurements {
  const safe = (n: number, fb: number) =>
    Number.isFinite(n) && n > 0 ? n : fb;
  return {
    chest: Math.max(40, Math.min(200, safe(m.chest, 96))),
    shoulder: Math.max(20, Math.min(80, safe(m.shoulder, 44))),
    sleeveLength: Math.max(10, Math.min(90, safe(m.sleeveLength, 60))),
    shirtLength: Math.max(40, Math.min(120, safe(m.shirtLength, 72))),
    neck: Math.max(20, Math.min(80, safe(m.neck, 38))),
  };
}

/* ---------- 3-4. derived visuals ---------- */
interface Visual {
  width: number;
  height: number;
  shoulderHalf: number;
  neckHalf: number;
  neckDepth: number;
  shoulderDrop: number;
  sleeveDrop: number;
  armholeY: number;
  taper: number;
  sleeveExt: number; // horizontal extent of sleeve from shoulder
}

function deriveVisual(m: SilhouetteMeasurements): Visual {
  const width = m.chest / 2;
  const height = m.shirtLength;
  const neckHalf = Math.max(5, m.neck / (2 * Math.PI) + 2);
  return {
    width,
    height,
    shoulderHalf: Math.min(m.shoulder / 2, width - 1),
    neckHalf,
    neckDepth: neckHalf * 0.5,
    shoulderDrop: height * 0.05,
    sleeveDrop: height * 0.18,
    armholeY: height * 0.28,
    taper: width * 0.06,
    sleeveExt: m.sleeveLength * 0.65,
  };
}

/* ---------- 5. build half-path (right side) ---------- */
interface Pt { x: number; y: number; }
const f = (n: number) => n.toFixed(2);
const M = (p: Pt) => `M ${f(p.x)} ${f(p.y)}`;
const L = (p: Pt) => `L ${f(p.x)} ${f(p.y)}`;
const C = (c1: Pt, c2: Pt, p: Pt) =>
  `C ${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(p.x)} ${f(p.y)}`;

interface HalfPaths {
  half: string;
  neckOuterHalf: string;
  neckInnerHalf: string;
  centerTopY: number;
  centerBottomY: number;
}

function buildHalf(v: Visual): HalfPaths {
  // Anchor points (right side).
  const neckTop: Pt = { x: v.neckHalf, y: 0 };
  const shoulder: Pt = { x: v.shoulderHalf, y: v.shoulderDrop };

  // Sleeve cap = highest outer point.
  const capX = shoulder.x + v.sleeveExt * 0.55;
  const capY = shoulder.y + v.sleeveDrop * 0.35;
  const sleeveCap: Pt = { x: capX, y: capY };

  // Outer cuff corner.
  const cuffOuter: Pt = {
    x: shoulder.x + v.sleeveExt,
    y: shoulder.y + v.sleeveDrop,
  };
  // Inner cuff corner — short, mostly-horizontal cuff edge,
  // perpendicular-ish to the sleeve direction.
  const cuffH = v.sleeveExt * 0.30;
  const cuffInner: Pt = {
    x: cuffOuter.x - cuffH * 0.95,
    y: cuffOuter.y - cuffH * 0.30,
  };

  const underarm: Pt = { x: v.width, y: v.armholeY };

  const waistY = v.armholeY + (v.height - v.armholeY) * 0.55;
  const waist: Pt = { x: v.width - v.taper, y: waistY };

  const hem: Pt = { x: v.width - v.taper * 0.5, y: v.height };
  const hemCenter: Pt = { x: 0, y: v.height };

  // ---- Build path: starts at center-top of neck, goes around right side,
  //      ends at center-bottom of hem. Mirror will close the loop.
  const neckCenterTop: Pt = { x: 0, y: v.neckDepth };

  // Neck → shoulder (gentle slope, cubic).
  const nsC1: Pt = { x: neckTop.x + (shoulder.x - neckTop.x) * 0.35, y: neckTop.y + 0.5 };
  const nsC2: Pt = { x: neckTop.x + (shoulder.x - neckTop.x) * 0.7, y: shoulder.y - v.shoulderDrop * 0.1 };

  // Shoulder → sleeve cap (rounded outer top of sleeve).
  const ssC1: Pt = { x: shoulder.x + (sleeveCap.x - shoulder.x) * 0.25, y: shoulder.y - v.sleeveDrop * 0.05 };
  const ssC2: Pt = { x: sleeveCap.x - (sleeveCap.x - shoulder.x) * 0.20, y: sleeveCap.y - v.sleeveDrop * 0.10 };

  // Sleeve cap → outer cuff (smooth dome down to cuff).
  const scC1: Pt = { x: sleeveCap.x + (cuffOuter.x - sleeveCap.x) * 0.55, y: sleeveCap.y + (cuffOuter.y - sleeveCap.y) * 0.20 };
  const scC2: Pt = { x: cuffOuter.x - (cuffOuter.x - sleeveCap.x) * 0.10, y: cuffOuter.y - (cuffOuter.y - sleeveCap.y) * 0.30 };

  // Cuff inner → underarm (concave inward armhole).
  const auC1: Pt = { x: cuffInner.x - (cuffInner.x - underarm.x) * 0.15, y: cuffInner.y + (underarm.y - cuffInner.y) * 0.25 };
  const auC2: Pt = { x: cuffInner.x - (cuffInner.x - underarm.x) * 0.45, y: underarm.y - (underarm.y - cuffInner.y) * 0.10 };

  // Underarm → waist (gentle inward taper).
  const uwC1: Pt = { x: underarm.x - (underarm.x - waist.x) * 0.25, y: underarm.y + (waist.y - underarm.y) * 0.35 };
  const uwC2: Pt = { x: waist.x + (underarm.x - waist.x) * 0.15, y: waist.y - (waist.y - underarm.y) * 0.25 };

  // Waist → hem (slight outward flare).
  const whC1: Pt = { x: waist.x + (hem.x - waist.x) * 0.5, y: waist.y + (hem.y - waist.y) * 0.4 };
  const whC2: Pt = { x: hem.x, y: hem.y - (hem.y - waist.y) * 0.2 };

  // Outer neckline control points — first control is HORIZONTAL from center
  // so the mirrored half meets smoothly (no V at center top).
  const neckOC1: Pt = { x: v.neckHalf * 0.35, y: v.neckDepth };
  const neckOC2: Pt = { x: v.neckHalf * 0.85, y: v.neckDepth * 0.45 };

  const half = [
    M(neckCenterTop),
    C(neckOC1, neckOC2, neckTop),
    C(nsC1, nsC2, shoulder),
    C(ssC1, ssC2, sleeveCap),
    C(scC1, scC2, cuffOuter),
    L(cuffInner),
    C(auC1, auC2, underarm),
    C(uwC1, uwC2, waist),
    C(whC1, whC2, hem),
    L(hemCenter),
  ].join(" ");

  // Outer neckline (separate stroke for clarity, right half).
  const neckOuterHalf = [
    M(neckCenterTop),
    C(neckOC1, neckOC2, neckTop),
  ].join(" ");

  // Inner ribbed neckline (~85% width, parallel curve below outer).
  const innerHalfW = v.neckHalf * 0.85;
  const innerDepth = v.neckDepth * 1.5;
  const innerRight: Pt = { x: innerHalfW, y: v.neckDepth * 0.30 };
  const innerC1: Pt = { x: innerHalfW * 0.35, y: innerDepth };
  const innerC2: Pt = { x: innerHalfW * 0.85, y: innerDepth * 0.55 };
  const neckInnerHalf = [
    M({ x: 0, y: innerDepth }),
    C(innerC1, innerC2, innerRight),
  ].join(" ");

  return {
    half,
    neckOuterHalf,
    neckInnerHalf,
    centerTopY: v.neckDepth,
    centerBottomY: v.height,
  };
}

/* ---------- 7. component ---------- */
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
  const { halfPaths, viewBox, visual } = useMemo(() => {
    const m = sanitize(measurements);
    const visual = deriveVisual(m);
    const halfPaths = buildHalf(visual);
    const sleeveExtent = visual.shoulderHalf + visual.sleeveExt;
    const halfW = sleeveExtent + 5;
    const top = -5;
    const bottom = visual.height + 5;
    const viewBox = `${-halfW} ${top} ${halfW * 2} ${bottom - top}`;
    return { halfPaths, viewBox, visual };
  }, [measurements]);

  const stroke = "#2B2B2B";
  const sw = 1.6;

  return (
    <svg
      viewBox={viewBox}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="T-shirt silhouette preview"
    >
      <defs>
        <path id="ts-half" d={halfPaths.half} />
        <path id="ts-neck-outer-half" d={halfPaths.neckOuterHalf} />
        <path id="ts-neck-inner-half" d={halfPaths.neckInnerHalf} />
      </defs>

      {/* Filled body: right half + mirrored left half */}
      <g fill={fill} stroke="none">
        <use href="#ts-half" />
        <use href="#ts-half" transform="scale(-1,1)" />
        {/* Fill the central seam between the two halves */}
        <rect
          x={-0.5}
          y={visual.neckDepth}
          width={1}
          height={visual.height - visual.neckDepth}
        />
      </g>

      {/* Outline strokes */}
      <g
        fill="none"
        stroke={stroke}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <use href="#ts-half" />
        <use href="#ts-half" transform="scale(-1,1)" />
        <use href="#ts-neck-outer-half" />
        <use href="#ts-neck-outer-half" transform="scale(-1,1)" />
      </g>

      {/* Inner rib neckline (thinner, lighter) */}
      <g
        fill="none"
        stroke={stroke}
        strokeWidth={1}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.8}
      >
        <use href="#ts-neck-inner-half" />
        <use href="#ts-neck-inner-half" transform="scale(-1,1)" />
      </g>
    </svg>
  );
};

export default TshirtSilhouette;
