/**
 * TshirtMockup — measurement-driven 2D T-shirt silhouette.
 *
 * Pipeline:
 *   computeBase(measurements) → deriveVisual(base) → getPoints(visual) → buildPath(points)
 *
 * No hardcoded shapes. Symmetric (left mirrors right).
 * Smooth Bézier curves on neckline and sleeve transitions.
 */

import { useMemo } from "react";

export interface MockupMeasurements {
  chest: number;        // cm, full circumference
  shoulder: number;     // cm, seam to seam
  sleeveLength: number; // cm
  shirtLength: number;  // cm
  neck: number;         // cm, circumference
}

/* ---------------- Stage 1: computeBase ---------------- */

interface Base {
  halfChest: number;
  halfShoulder: number;
  sleeve: number;
  length: number;
  halfNeck: number;
}

function computeBase(m: MockupMeasurements): Base {
  return {
    halfChest: m.chest / 2,
    halfShoulder: m.shoulder / 2,
    sleeve: m.sleeveLength,
    length: m.shirtLength,
    halfNeck: m.neck / 2,
  };
}

/* ---------------- Stage 2: deriveVisual ---------------- */
/**
 * Convert real-world cm into a normalized 2D visual frame.
 * We map the garment into a viewBox where the body length defines height
 * and the chest defines width — this preserves correct aspect ratio.
 */
interface Visual {
  // visual width/height of the garment (units = px in viewBox)
  bodyW: number;          // chest width (front projection)
  bodyH: number;          // total length
  shoulderW: number;      // shoulder seam width (visual)
  neckW: number;          // neckline opening width
  neckDepthFront: number; // how far neckline drops below shoulder line
  armpitDepth: number;    // distance from shoulder line down to armpit (≈28% of height)
  sleeveDrop: number;     // vertical sleeve drop at cuff (≈22% of height)
  sleeveExtend: number;   // horizontal sleeve extension beyond shoulder
  cuffWidth: number;      // sleeve cuff opening width
  hemTaper: number;       // slight body taper (waist narrowing) for realism
}

function deriveVisual(b: Base): Visual {
  // Scale: 1 cm = 4 px. Garment heights stay in a comfortable range.
  const S = 4;

  const bodyW = b.halfChest * 2 * S * 0.5; // chest is circumference; front projection ≈ half
  const bodyH = b.length * S;
  const shoulderW = Math.min(b.halfShoulder * 2 * S, bodyW * 1.02);

  // Neck opening proportional to neck circumference; clamp so it never
  // exceeds shoulder width.
  const neckW = Math.min(b.halfNeck * 2 * S * 0.55, shoulderW * 0.55);
  const neckDepthFront = neckW * 0.45;

  // Per spec proportions
  const armpitDepth = bodyH * 0.28;
  const sleeveDrop = bodyH * 0.22;

  // Sleeve extension beyond shoulder is driven by sleeveLength minus the
  // half-shoulder already covered by the body. Always positive.
  const sleeveExtend = Math.max(b.sleeve * S - shoulderW * 0.15, shoulderW * 0.25);
  const cuffWidth = Math.max(armpitDepth * 0.55, 18);

  // Slight taper at hem for realism — never aggressive.
  const hemTaper = bodyW * 0.04;

  return {
    bodyW,
    bodyH,
    shoulderW,
    neckW,
    neckDepthFront,
    armpitDepth,
    sleeveDrop,
    sleeveExtend,
    cuffWidth,
    hemTaper,
  };
}

/* ---------------- Stage 3: getPoints ---------------- */
/**
 * Anchor points on the silhouette. All coordinates are in viewBox space and
 * symmetric around x = 0 (we recenter into the viewBox in render).
 */
interface Points {
  // top center of neckline (front dip baseline)
  neckTopL: { x: number; y: number };
  neckTopR: { x: number; y: number };
  neckBottom: { x: number; y: number }; // deepest point of front neckline
  shoulderL: { x: number; y: number };
  shoulderR: { x: number; y: number };
  sleeveOuterTopL: { x: number; y: number };
  sleeveOuterTopR: { x: number; y: number };
  cuffOuterL: { x: number; y: number };
  cuffOuterR: { x: number; y: number };
  cuffInnerL: { x: number; y: number };
  cuffInnerR: { x: number; y: number };
  armpitL: { x: number; y: number };
  armpitR: { x: number; y: number };
  hemL: { x: number; y: number };
  hemR: { x: number; y: number };
}

function getPoints(v: Visual): Points {
  const halfBody = v.bodyW / 2;
  const halfShoulder = v.shoulderW / 2;
  const halfNeck = v.neckW / 2;

  // Vertical reference: y=0 is shoulder line. Neck rises slightly above it.
  const yShoulder = 0;
  const yNeckTop = -v.neckW * 0.08; // small rise so the neckline doesn't sit on shoulder line
  const yNeckBottom = yShoulder + v.neckDepthFront;
  const yArmpit = yShoulder + v.armpitDepth;
  const yCuff = yShoulder + v.sleeveDrop;
  const yHem = v.bodyH;

  return {
    neckTopL: { x: -halfNeck, y: yNeckTop },
    neckTopR: { x: halfNeck, y: yNeckTop },
    neckBottom: { x: 0, y: yNeckBottom },
    shoulderL: { x: -halfShoulder, y: yShoulder },
    shoulderR: { x: halfShoulder, y: yShoulder },
    sleeveOuterTopL: { x: -halfShoulder - v.sleeveExtend * 0.15, y: yShoulder + v.sleeveDrop * 0.15 },
    sleeveOuterTopR: { x: halfShoulder + v.sleeveExtend * 0.15, y: yShoulder + v.sleeveDrop * 0.15 },
    cuffOuterL: { x: -halfShoulder - v.sleeveExtend, y: yCuff },
    cuffOuterR: { x: halfShoulder + v.sleeveExtend, y: yCuff },
    cuffInnerL: { x: -halfShoulder - v.sleeveExtend + v.cuffWidth * 0.35, y: yCuff + v.cuffWidth * 0.35 },
    cuffInnerR: { x: halfShoulder + v.sleeveExtend - v.cuffWidth * 0.35, y: yCuff + v.cuffWidth * 0.35 },
    armpitL: { x: -halfBody, y: yArmpit },
    armpitR: { x: halfBody, y: yArmpit },
    hemL: { x: -halfBody + v.hemTaper, y: yHem },
    hemR: { x: halfBody - v.hemTaper, y: yHem },
  };
}

/* ---------------- Stage 4: buildPath ---------------- */

function buildPath(p: Points): string {
  // Helper for compact M/C/L formatting
  const f = (n: number) => n.toFixed(2);
  const M = (pt: { x: number; y: number }) => `M ${f(pt.x)} ${f(pt.y)}`;
  const L = (pt: { x: number; y: number }) => `L ${f(pt.x)} ${f(pt.y)}`;
  const C = (
    c1: { x: number; y: number },
    c2: { x: number; y: number },
    end: { x: number; y: number },
  ) => `C ${f(c1.x)} ${f(c1.y)}, ${f(c2.x)} ${f(c2.y)}, ${f(end.x)} ${f(end.y)}`;

  // Build clockwise starting from left neck top.
  // 1. Neckline: smooth Bézier dip from neckTopL → neckBottom → neckTopR
  // 2. Right shoulder slope (slight curve)
  // 3. Sleeve top → cuff outer (Bézier)
  // 4. Cuff edge (line)
  // 5. Cuff inner → armpit (Bézier — armhole curve)
  // 6. Side seam to hem (with slight taper)
  // 7. Hem (line)
  // 8. Left side seam up to armpit
  // 9. Armpit → cuff inner (Bézier)
  // 10. Cuff edge (line)
  // 11. Sleeve top → shoulder (Bézier)
  // 12. Shoulder back to neck top L

  const neckCtrl1 = { x: p.neckTopL.x * 0.45, y: p.neckBottom.y };
  const neckCtrl2 = { x: p.neckTopR.x * 0.45, y: p.neckBottom.y };

  // Shoulder slope: slight downward curve from neck top to shoulder point
  const shoulderRC1 = { x: p.neckTopR.x + (p.shoulderR.x - p.neckTopR.x) * 0.55, y: p.neckTopR.y + 1 };
  const shoulderRC2 = { x: p.shoulderR.x - 4, y: p.shoulderR.y - 1 };

  // Sleeve top curve: shoulderR → sleeveOuterTopR → cuffOuterR
  const sleeveTopRC1 = { x: p.shoulderR.x + (p.cuffOuterR.x - p.shoulderR.x) * 0.35, y: p.shoulderR.y };
  const sleeveTopRC2 = { x: p.cuffOuterR.x - (p.cuffOuterR.x - p.shoulderR.x) * 0.2, y: p.cuffOuterR.y - 4 };

  // Armhole curve: cuffInnerR → armpitR (the underarm scoop)
  const armholeRC1 = { x: p.cuffInnerR.x - 4, y: p.cuffInnerR.y + (p.armpitR.y - p.cuffInnerR.y) * 0.35 };
  const armholeRC2 = { x: p.armpitR.x + 6, y: p.armpitR.y - (p.armpitR.y - p.cuffInnerR.y) * 0.25 };

  // Mirror for left
  const shoulderLC1 = { x: p.neckTopL.x + (p.shoulderL.x - p.neckTopL.x) * 0.55, y: p.neckTopL.y + 1 };
  const shoulderLC2 = { x: p.shoulderL.x + 4, y: p.shoulderL.y - 1 };
  const sleeveTopLC1 = { x: p.shoulderL.x + (p.cuffOuterL.x - p.shoulderL.x) * 0.35, y: p.shoulderL.y };
  const sleeveTopLC2 = { x: p.cuffOuterL.x - (p.cuffOuterL.x - p.shoulderL.x) * 0.2, y: p.cuffOuterL.y - 4 };
  const armholeLC1 = { x: p.cuffInnerL.x + 4, y: p.cuffInnerL.y + (p.armpitL.y - p.cuffInnerL.y) * 0.35 };
  const armholeLC2 = { x: p.armpitL.x - 6, y: p.armpitL.y - (p.armpitL.y - p.cuffInnerL.y) * 0.25 };

  return [
    M(p.neckTopL),
    // Neckline dip
    C(neckCtrl1, neckCtrl2, p.neckTopR),
    // Right shoulder slope
    C(shoulderRC1, shoulderRC2, p.shoulderR),
    // Right sleeve top
    C(sleeveTopRC1, sleeveTopRC2, p.cuffOuterR),
    // Right cuff edge
    L(p.cuffInnerR),
    // Right armhole
    C(armholeRC1, armholeRC2, p.armpitR),
    // Right side seam to hem
    L(p.hemR),
    // Hem — subtle smile (control point dips slightly below hem line)
    C(
      { x: p.hemR.x * 0.5, y: p.hemR.y + (p.hemR.y - p.armpitR.y) * 0.025 },
      { x: p.hemL.x * 0.5, y: p.hemL.y + (p.hemL.y - p.armpitL.y) * 0.025 },
      p.hemL,
    ),
    // Left side seam up to armpit
    L(p.armpitL),
    // Left armhole
    C(armholeLC1, armholeLC2, p.cuffInnerL),
    // Left cuff edge
    L(p.cuffOuterL),
    // Left sleeve top
    C(sleeveTopLC2, sleeveTopLC1, p.shoulderL),
    // Left shoulder slope
    C(shoulderLC2, shoulderLC1, p.neckTopL),
    "Z",
  ].join(" ");
}

/* ---------------- Component ---------------- */

interface Props {
  measurements: MockupMeasurements;
  className?: string;
}

export function TshirtMockup({ measurements, className }: Props) {
  const { path, viewBox, neckPath } = useMemo(() => {
    const base = computeBase(measurements);
    const visual = deriveVisual(base);
    const points = getPoints(visual);
    const d = buildPath(points);

    // Neckline ribbing (inner curve), drawn as a separate stroke for realism.
    const f = (n: number) => n.toFixed(2);
    const neckInnerY = points.neckBottom.y + 6;
    const neckRib =
      `M ${f(points.neckTopL.x)} ${f(points.neckTopL.y + 4)} ` +
      `C ${f(points.neckTopL.x * 0.45)} ${f(neckInnerY)}, ` +
      `${f(points.neckTopR.x * 0.45)} ${f(neckInnerY)}, ` +
      `${f(points.neckTopR.x)} ${f(points.neckTopR.y + 4)}`;

    // Compute viewBox with padding
    const pad = 30;
    const minX = Math.min(points.cuffOuterL.x, points.armpitL.x) - pad;
    const maxX = Math.max(points.cuffOuterR.x, points.armpitR.x) + pad;
    const minY = points.neckTopL.y - pad;
    const maxY = points.hemL.y + pad;
    const w = maxX - minX;
    const h = maxY - minY;

    return {
      path: d,
      neckPath: neckRib,
      viewBox: `${minX} ${minY} ${w} ${h}`,
    };
  }, [measurements]);

  return (
    <svg
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      role="img"
      aria-label="T-shirt silhouette preview"
    >
      <path
        d={path}
        fill="hsl(var(--secondary))"
        fillOpacity={0.45}
        stroke="hsl(var(--foreground) / 0.7)"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={neckPath}
        fill="none"
        stroke="hsl(var(--foreground) / 0.55)"
        strokeWidth={1.5}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
