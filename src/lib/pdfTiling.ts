/**
 * Multi-page PDF tiling.
 *
 * Slices a rendered pattern SVG into A4 page-sized tiles at 100% scale,
 * stamps crop marks + alignment guides + page coordinates on each tile,
 * and writes them into a jsPDF document.
 *
 * Coordinate convention:
 *  - Pattern SVG uses 1 cm = 10 px (PX_PER_CM from layoutEngine).
 *  - jsPDF uses millimetres (1 cm = 10 mm).
 *  - At 100% print scale, 1 px in the SVG == 1 mm on paper.
 */

import jsPDF from "jspdf";
import { PX_PER_CM } from "./layoutEngine";

export const A4_MM = { width: 210, height: 297 };
/** Printable margin on each side of the page (mm). */
export const PAGE_MARGIN_MM = 10;
/** Overlap between adjacent tiles (mm) so users can glue/tape easily. */
export const TILE_OVERLAP_MM = 10;

export interface TilingOptions {
  /** Paper size in mm. Defaults to A4. */
  pageWidthMm?: number;
  pageHeightMm?: number;
  /** Page margin in mm. */
  marginMm?: number;
  /** Tile overlap in mm to ease alignment. */
  overlapMm?: number;
  /** Header / cover text. */
  title?: string;
  subtitle?: string;
}

export interface TilingPlan {
  cols: number;
  rows: number;
  pageCount: number;
  tileContentWidthMm: number;
  tileContentHeightMm: number;
}

/**
 * Compute how many pages a pattern of the given dimensions (in cm) needs
 * when tiled across A4 sheets.
 */
export function planTiling(
  patternWidthCm: number,
  patternHeightCm: number,
  options: TilingOptions = {},
): TilingPlan {
  const pageW = options.pageWidthMm ?? A4_MM.width;
  const pageH = options.pageHeightMm ?? A4_MM.height;
  const margin = options.marginMm ?? PAGE_MARGIN_MM;
  const overlap = options.overlapMm ?? TILE_OVERLAP_MM;

  // Each tile's printable area is the page minus margins.
  // Adjacent tiles overlap by `overlap` mm, so the *effective* stride
  // between tiles is (printable - overlap).
  const printableW = pageW - margin * 2;
  const printableH = pageH - margin * 2;
  const strideW = printableW - overlap;
  const strideH = printableH - overlap;

  const widthMm = patternWidthCm * 10;
  const heightMm = patternHeightCm * 10;

  const cols = Math.max(1, Math.ceil((widthMm - overlap) / strideW));
  const rows = Math.max(1, Math.ceil((heightMm - overlap) / strideH));

  return {
    cols,
    rows,
    pageCount: cols * rows,
    tileContentWidthMm: printableW,
    tileContentHeightMm: printableH,
  };
}

/**
 * Render the pattern SVG to a single hi-res raster, then slice it into
 * A4 tiles and add each tile (with crop marks + page label) to the PDF.
 *
 * The full pattern is rasterised once at the print resolution so we can
 * crop sub-rectangles for each page without re-rendering.
 */
export async function addTiledPatternToPdf(
  pdf: jsPDF,
  svgString: string,
  patternWidthCm: number,
  patternHeightCm: number,
  options: TilingOptions = {},
): Promise<TilingPlan> {
  const pageW = options.pageWidthMm ?? A4_MM.width;
  const pageH = options.pageHeightMm ?? A4_MM.height;
  const margin = options.marginMm ?? PAGE_MARGIN_MM;
  const overlap = options.overlapMm ?? TILE_OVERLAP_MM;

  const plan = planTiling(patternWidthCm, patternHeightCm, options);
  const { cols, rows, tileContentWidthMm, tileContentHeightMm } = plan;

  // Total pattern in mm at 100% scale (1 SVG px == 1 mm).
  const patternWmm = patternWidthCm * 10;
  const patternHmm = patternHeightCm * 10;

  // Render full pattern to a high-DPI canvas so each tile crop is sharp.
  const dpi = 200; // ≈ 7.87 px/mm
  const pxPerMm = dpi / 25.4;
  const fullW = Math.ceil(patternWmm * pxPerMm);
  const fullH = Math.ceil(patternHmm * pxPerMm);

  const fullCanvas = await rasterizeSvg(svgString, fullW, fullH);
  const ctxFull = fullCanvas.getContext("2d")!;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const pageIndex = row * cols + col;
      if (pageIndex > 0) pdf.addPage();

      // Source rectangle (in pattern mm) for this tile.
      const srcXmm = col * (tileContentWidthMm - overlap);
      const srcYmm = row * (tileContentHeightMm - overlap);
      const srcWmm = Math.min(tileContentWidthMm, patternWmm - srcXmm);
      const srcHmm = Math.min(tileContentHeightMm, patternHmm - srcYmm);

      if (srcWmm <= 0 || srcHmm <= 0) continue;

      // Crop a tile from the full raster.
      const tileCanvas = document.createElement("canvas");
      const tileWpx = Math.ceil(srcWmm * pxPerMm);
      const tileHpx = Math.ceil(srcHmm * pxPerMm);
      tileCanvas.width = tileWpx;
      tileCanvas.height = tileHpx;
      const tctx = tileCanvas.getContext("2d")!;
      tctx.fillStyle = "#ffffff";
      tctx.fillRect(0, 0, tileWpx, tileHpx);
      tctx.drawImage(
        fullCanvas,
        Math.floor(srcXmm * pxPerMm),
        Math.floor(srcYmm * pxPerMm),
        tileWpx,
        tileHpx,
        0,
        0,
        tileWpx,
        tileHpx,
      );

      const dataUrl = tileCanvas.toDataURL("image/png");
      // Place at top-left of the printable area, sized at exactly 100%.
      pdf.addImage(dataUrl, "PNG", margin, margin, srcWmm, srcHmm);

      drawTileChrome(pdf, {
        pageW,
        pageH,
        margin,
        col,
        row,
        cols,
        rows,
        pageIndex,
        title: options.title,
        subtitle: options.subtitle,
      });
    }
  }

  return plan;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

interface ChromeOpts {
  pageW: number;
  pageH: number;
  margin: number;
  col: number;
  row: number;
  cols: number;
  rows: number;
  pageIndex: number;
  title?: string;
  subtitle?: string;
}

/**
 * Draw crop marks at the four corners of the printable area, plus an
 * alignment legend (column letter, row number, neighbour pages, scale
 * reminder). Crop marks sit on the page-margin edges so users can trim
 * along them and align tiles edge-to-edge.
 */
function drawTileChrome(pdf: jsPDF, o: ChromeOpts): void {
  const { pageW, pageH, margin, col, row, cols, rows, pageIndex } = o;
  const tickLen = 5; // mm
  pdf.setLineWidth(0.2);
  pdf.setDrawColor(20, 20, 20);

  // Crop marks (┌ ┐ └ ┘) at the inner corners of the margin.
  const x1 = margin;
  const y1 = margin;
  const x2 = pageW - margin;
  const y2 = pageH - margin;

  // top-left
  pdf.line(x1 - tickLen, y1, x1, y1);
  pdf.line(x1, y1 - tickLen, x1, y1);
  // top-right
  pdf.line(x2, y1, x2 + tickLen, y1);
  pdf.line(x2, y1 - tickLen, x2, y1);
  // bottom-left
  pdf.line(x1 - tickLen, y2, x1, y2);
  pdf.line(x1, y2, x1, y2 + tickLen);
  // bottom-right
  pdf.line(x2, y2, x2 + tickLen, y2);
  pdf.line(x2, y2, x2, y2 + tickLen);

  // Mid-edge alignment ticks help line up tiles when taping.
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  pdf.line(midX, y1 - tickLen, midX, y1);
  pdf.line(midX, y2, midX, y2 + tickLen);
  pdf.line(x1 - tickLen, midY, x1, midY);
  pdf.line(x2, midY, x2 + tickLen, midY);

  // Page coordinate label (e.g. "Page B2 of 6 · col 2 / 3 · row 2 / 2").
  const colLetter = String.fromCharCode(65 + col);
  const label = `Page ${colLetter}${row + 1}  ·  ${pageIndex + 1} / ${cols * rows}  ·  col ${col + 1}/${cols}  row ${row + 1}/${rows}`;
  pdf.setFontSize(8);
  pdf.setTextColor(40, 40, 40);
  pdf.text(label, margin, pageH - 4);

  // Scale reminder along the top edge.
  pdf.text("Print at 100% scale. Do not scale. Align using crop marks.", margin, 5);

  // Optional title/subtitle on the first page only.
  if (pageIndex === 0 && (o.title || o.subtitle)) {
    pdf.setFontSize(6);
    pdf.setTextColor(120, 120, 120);
    if (o.title) pdf.text(o.title, pageW - margin, 5, { align: "right" });
    if (o.subtitle) pdf.text(o.subtitle, pageW - margin, 9, { align: "right" });
  }
}

/**
 * Rasterise an SVG string into a canvas at the given pixel dimensions.
 * Uses an Image + object URL — works in all evergreen browsers.
 */
function rasterizeSvg(svg: string, width: number, height: number): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e instanceof Error ? e : new Error("Failed to rasterise SVG"));
    };
    img.src = url;
  });
}

/** Sanity helper: convert PX_PER_CM to mm-per-px to keep call sites honest. */
export const SVG_PX_PER_MM = PX_PER_CM / 10; // 1 (since 1 cm = 10 px = 10 mm)
