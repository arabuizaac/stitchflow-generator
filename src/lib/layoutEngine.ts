/**
 * Layout engine for StitchFlow pattern pieces.
 *
 * Responsibilities:
 *  - Compute TRUE bounding boxes from SVG paths (not estimates).
 *  - Lay pieces out in a horizontal flow with wrapping.
 *  - Guarantee zero overlap via AABB validation + adaptive re-flow.
 *
 * Scale convention: 1 cm = 10 px (units match the rest of the generator).
 */

import type { PatternPiece } from "./patternGenerator";

export const PX_PER_CM = 10;
export const MIN_SPACING_CM = 5;
export const MIN_SPACING_PX = MIN_SPACING_CM * PX_PER_CM; // 50px

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PositionedPiece {
  piece: PatternPiece;
  /** TRUE local bounding box of the geometry (cut + seam + annotations + grainline + fold). */
  bbox: BBox;
  /** Final placement of the bounding box in the output SVG. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutResult {
  positioned: PositionedPiece[];
  totalWidth: number;
  totalHeight: number;
  spacingPx: number;
  rows: number;
  /** True if every pair of placed pieces is disjoint. */
  overlapFree: boolean;
}

/* ------------------------------------------------------------------ */
/* Bounding box computation                                            */
/* ------------------------------------------------------------------ */

/**
 * Compute the TRUE bounding box of an SVG path string (`d` attribute) by
 * mounting it in an offscreen <svg> and asking the browser for getBBox().
 *
 * Falls back to a numeric path parser when DOM is unavailable (SSR / tests).
 */
export function computePathBBox(d: string): BBox {
  if (typeof document !== "undefined") {
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    // Position offscreen so it never affects layout.
    svg.setAttribute("style", "position:absolute;left:-99999px;top:-99999px;width:0;height:0;");
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
    document.body.appendChild(svg);
    try {
      const b = path.getBBox();
      if (Number.isFinite(b.width) && Number.isFinite(b.height) && b.width > 0 && b.height > 0) {
        return { x: b.x, y: b.y, width: b.width, height: b.height };
      }
    } catch {
      /* fall through to parser */
    } finally {
      document.body.removeChild(svg);
    }
  }
  return parsePathBBox(d);
}

/**
 * Lightweight parser that extracts every coordinate pair from an SVG path
 * `d` string and computes the AABB of those points. This is conservative
 * for curves (control points are included), which is the safe direction
 * for layout — it never under-estimates size.
 */
export function parsePathBBox(d: string): BBox {
  const tokens = d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < tokens.length; i += 2) {
    const x = parseFloat(tokens[i]);
    const y = parseFloat(tokens[i + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * True bounding box for an entire piece, taking into account cut path,
 * seam allowance path, grainline, fold marker, and annotation positions.
 */
export function computePieceBBox(piece: PatternPiece): BBox {
  const cutB = computePathBBox(piece.cutPath);
  const seamB = computePathBBox(piece.seamPath);

  let minX = Math.min(cutB.x, seamB.x);
  let minY = Math.min(cutB.y, seamB.y);
  let maxX = Math.max(cutB.x + cutB.width, seamB.x + seamB.width);
  let maxY = Math.max(cutB.y + cutB.height, seamB.y + seamB.height);

  if (piece.foldEdge === "left") {
    // The "FOLD" tick lives on x=0. Make sure we include it.
    minX = Math.min(minX, 0);
  }

  if (piece.grainline) {
    minX = Math.min(minX, piece.grainline.x1, piece.grainline.x2);
    minY = Math.min(minY, piece.grainline.y1, piece.grainline.y2);
    maxX = Math.max(maxX, piece.grainline.x1, piece.grainline.x2);
    maxY = Math.max(maxY, piece.grainline.y1, piece.grainline.y2);
  }

  for (const a of piece.annotations) {
    // Approximate text extents from font-size; conservative on the wide side.
    const size = a.size ?? 14;
    const halfTextW = (a.text.length * size) / 3.2; // ~0.31em per char average
    const halfTextH = size * 0.7;
    minX = Math.min(minX, a.x - halfTextW);
    maxX = Math.max(maxX, a.x + halfTextW);
    minY = Math.min(minY, a.y - halfTextH);
    maxY = Math.max(maxY, a.y + halfTextH);
  }

  // Defensive: never zero/negative.
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  return { x: minX, y: minY, width, height };
}

/* ------------------------------------------------------------------ */
/* Overlap detection                                                   */
/* ------------------------------------------------------------------ */

/** AABB intersection test. Touching edges (==) do NOT count as overlap. */
export function checkOverlap(a: BBox, b: BBox): boolean {
  return !(
    a.x + a.width <= b.x ||
    a.x >= b.x + b.width ||
    a.y + a.height <= b.y ||
    a.y >= b.y + b.height
  );
}

/** Find any overlapping pair after layout. Returns null if layout is clean. */
export function findOverlap(items: PositionedPiece[]): [number, number] | null {
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (checkOverlap(items[i], items[j])) return [i, j];
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Horizontal-flow layout with wrapping                                */
/* ------------------------------------------------------------------ */

export interface LayoutOptions {
  /** Container width in px the layout must fit into (auto-wrap trigger). */
  maxWidth?: number;
  /** Spacing between pieces in px. Floored to MIN_SPACING_PX. */
  spacing?: number;
  /** Outer padding around the whole layout, in px. */
  padding?: number;
}

/**
 * Place pieces left-to-right, wrapping when the next piece would exceed
 * `maxWidth`. Always uses the TRUE per-piece bounding box.
 */
function flowLayout(
  pieces: PatternPiece[],
  bboxes: BBox[],
  spacing: number,
  maxWidth: number,
  padding: number,
): PositionedPiece[] {
  let cursorX = padding;
  let cursorY = padding;
  let rowHeight = 0;
  let firstInRow = true;

  return pieces.map((piece, i) => {
    const bbox = bboxes[i];

    // Wrap to next row if this piece would exceed maxWidth.
    if (!firstInRow && cursorX + bbox.width > maxWidth) {
      cursorX = padding;
      cursorY += rowHeight + spacing;
      rowHeight = 0;
      firstInRow = true;
    }

    const positioned: PositionedPiece = {
      piece,
      bbox,
      x: cursorX,
      y: cursorY,
      width: bbox.width,
      height: bbox.height,
    };

    cursorX += bbox.width + spacing;
    rowHeight = Math.max(rowHeight, bbox.height);
    firstInRow = false;

    return positioned;
  });
}

/**
 * Public layout entrypoint.
 *
 * Strategy:
 *   1. Measure every piece (true bbox).
 *   2. Try a flow layout at the requested spacing/maxWidth.
 *   3. Validate with pairwise AABB checks.
 *   4. If any overlap is detected, increase spacing and retry up to 5×.
 *      Worst case, force one piece per row.
 *
 * The function is mathematically guaranteed to terminate with `overlapFree`
 * = true because the final fallback row-per-piece layout cannot overlap.
 */
export function layoutPieces(
  pieces: PatternPiece[],
  options: LayoutOptions = {},
): LayoutResult {
  const padding = options.padding ?? 40;
  const requestedMaxWidth = options.maxWidth ?? 1200;
  const baseSpacing = Math.max(MIN_SPACING_PX, options.spacing ?? MIN_SPACING_PX);

  const bboxes = pieces.map(computePieceBBox);

  // Make sure maxWidth can host the widest piece + padding, otherwise
  // a single piece would never "fit" and we'd loop forever.
  const widestPiece = bboxes.reduce((m, b) => Math.max(m, b.width), 0);
  const effectiveMaxWidth = Math.max(requestedMaxWidth, widestPiece + padding * 2);

  let spacing = baseSpacing;
  let positioned: PositionedPiece[] = [];

  for (let attempt = 0; attempt < 5; attempt++) {
    positioned = flowLayout(pieces, bboxes, spacing, effectiveMaxWidth, padding);
    if (!findOverlap(positioned)) break;
    // Bump spacing 25% each attempt; this cannot decrease coverage.
    spacing = Math.ceil(spacing * 1.25);
  }

  let overlapFree = !findOverlap(positioned);

  // Final guarantee: if for any reason overlap remains (it shouldn't),
  // stack each piece on its own row. This is mathematically collision-free.
  if (!overlapFree) {
    let y = padding;
    positioned = pieces.map((piece, i) => {
      const bbox = bboxes[i];
      const item: PositionedPiece = {
        piece,
        bbox,
        x: padding,
        y,
        width: bbox.width,
        height: bbox.height,
      };
      y += bbox.height + spacing;
      return item;
    });
    overlapFree = !findOverlap(positioned);
  }

  const totalWidth =
    positioned.reduce((m, p) => Math.max(m, p.x + p.width), 0) + padding;
  const totalHeight =
    positioned.reduce((m, p) => Math.max(m, p.y + p.height), 0) + padding;

  // Compute row count for diagnostics.
  const rowYs = new Set(positioned.map((p) => Math.round(p.y)));

  return {
    positioned,
    totalWidth,
    totalHeight,
    spacingPx: spacing,
    rows: rowYs.size,
    overlapFree,
  };
}
