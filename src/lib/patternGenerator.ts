export type FitType = "slim" | "regular" | "loose";

export interface Measurements {
  chest: number;
  shoulder: number;
  sleeveLength: number;
  shirtLength: number;
  neck: number;
  fit: FitType;
}

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
    sleeveWidth: number;
    necklineLength: number;
    neckbandLength: number;
    ease: number;
  };
  measurements: Measurements;
}

const MM = 10; // 1 cm = 10 mm = 10 SVG units

const EASE: Record<FitType, number> = { slim: 6, regular: 10, loose: 14 };
const ARMHOLE_EXTRA: Record<FitType, number> = { slim: 3, regular: 4, loose: 5 };

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
  };
}

/* ---------- Geometry helpers ---------- */

// approximate quadratic bezier length using subdivision
function quadLength(p0: [number, number], p1: [number, number], p2: [number, number], steps = 24) {
  let len = 0;
  let prev = p0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = (1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0];
    const y = (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1];
    len += Math.hypot(x - prev[0], y - prev[1]);
    prev = [x, y];
  }
  return len;
}

/* ---------- Pattern generation ---------- */

export function generatePattern(input: Measurements): PatternData {
  const m = clampMeasurements(input);
  const ease = EASE[m.fit];
  const halfChest = (m.chest + ease) / 2;          // cm
  const frontWidth = halfChest * 0.48;             // cm
  const backWidth = halfChest * 0.52;              // cm
  const armholeDepth = m.chest / 4 + ARMHOLE_EXTRA[m.fit]; // cm
  const sleeveWidth = armholeDepth * 1.8;          // cm
  const capHeight = armholeDepth * 0.7;            // cm

  const neckWidth = m.neck / 5;                    // cm (half-width on fold)
  const frontNeckDepth = m.neck / 5 + 1;
  const backNeckDepth = 2.5;

  const shoulderHalf = m.shoulder / 2;             // cm (on fold)
  const shoulderDrop = 3;                          // cm

  // body taper
  const waistHalf = (m.chest - 2 + ease) / 2 * 0.5; // half of waist on fold (matches half pieces)
  // Use 48/52 split for waist too
  const frontWaist = ((m.chest - 2 + ease) / 2) * 0.48;
  const backWaist = ((m.chest - 2 + ease) / 2) * 0.52;

  /* ---- Build FRONT piece (half, cut on fold; left edge = fold) ---- */
  const front = buildBodyPiece({
    label: "FRONT",
    halfWidth: frontWidth,
    waistHalf: frontWaist,
    length: m.shirtLength,
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
    length: m.shirtLength,
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

  /* ---- Neckband ---- */
  // Approximate neckline length from front + back neck curves (full circumference, both halves)
  const frontNeckLen = quadLength(
    [0, frontNeckDepth * MM],
    [neckWidth * MM * 0.5, 0],
    [neckWidth * MM, 0]
  ) * 2; // both halves (mirrored on fold)
  const backNeckLen = quadLength(
    [0, backNeckDepth * MM],
    [neckWidth * MM * 0.5, 0],
    [neckWidth * MM, 0]
  ) * 2;
  const necklineLengthMm = frontNeckLen + backNeckLen;
  const necklineLengthCm = necklineLengthMm / MM;
  const neckbandLengthCm = necklineLengthCm * 0.85;
  const neckband = buildNeckband(neckbandLengthCm, 5);

  return {
    pieces: [front, back, sleeve, neckband],
    derived: {
      halfChest,
      frontWidth,
      backWidth,
      armholeDepth,
      sleeveWidth,
      necklineLength: necklineLengthCm,
      neckbandLength: neckbandLengthCm,
      ease,
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
    cutPath: `<g transform="translate(${saSide}, ${saArm})">${""}</g>` ? cutPath : cutPath,
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
