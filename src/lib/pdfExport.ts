/**
 * PDF export pipeline (vector, mobile-safe).
 *
 * The previous pipeline rasterised the SVG to a `<canvas>` and embedded
 * a PNG. iOS Safari has hard limits on canvas size and frequently
 * returns an invalid `toDataURL` payload, which surfaced as
 * "wrong PNG signature" on iPhone and missing pattern content on iPad.
 *
 * This module replaces the raster step entirely:
 *   1. Serialize the live SVG with `XMLSerializer`.
 *   2. Validate that it has paths and well-formed dimensions.
 *   3. Render directly into the PDF as vector geometry via
 *      `svg2pdf.js` (no canvas, no PNG, no image decoding).
 *   4. Emit the PDF as a `Blob` with `type: "application/pdf"` and use a
 *      mobile-safe download trigger that works on iOS, iPadOS, Android.
 */

import jsPDF from "jspdf";
import { svg2pdf } from "svg2pdf.js";

/* ------------------------------------------------------------------ */
/* SVG normalisation + validation                                      */
/* ------------------------------------------------------------------ */

/**
 * Parse an SVG string into a live `SVGSVGElement`, validate that it has
 * dimensions + at least one drawn path, and ensure it is attached to a
 * hidden DOM container so `getComputedStyle` works during rendering
 * (svg2pdf walks computed styles, not just attributes).
 *
 * Returns the element + a `dispose()` to remove it from the DOM.
 */
export function prepareSvgForExport(svgString: string): {
  svg: SVGSVGElement;
  widthPx: number;
  heightPx: number;
  viewBox: { x: number; y: number; w: number; h: number };
  dispose: () => void;
} {
  if (!svgString || svgString.length < 50) {
    throw new Error("SVG payload is empty — pattern was not generated.");
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, "image/svg+xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error("SVG markup is malformed.");
  }
  const svg = doc.documentElement as unknown as SVGSVGElement;
  if (!svg || svg.tagName.toLowerCase() !== "svg") {
    throw new Error("Document root is not an <svg>.");
  }

  // ---- Validate viewBox ----
  // Pattern paths are positioned in the viewBox coordinate system.
  // If it's missing the export will be empty.
  const vb = svg.getAttribute("viewBox");
  if (!vb) throw new Error("SVG is missing a viewBox.");
  const parts = vb.split(/\s+|,/).map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    throw new Error(`SVG viewBox is invalid: "${vb}".`);
  }
  const [vx, vy, vw, vh] = parts;
  if (vw <= 0 || vh <= 0) {
    throw new Error(`SVG viewBox dimensions are non-positive: ${vw}×${vh}.`);
  }

  // ---- Force concrete width/height attributes ----
  // Some downstream renderers (and iOS Safari's image loader) refuse
  // SVGs with width="100%" or no width at all. We pin them to the
  // viewBox values in user units.
  svg.setAttribute("width", String(vw));
  svg.setAttribute("height", String(vh));
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  // ---- Validate that there are pattern paths to export ----
  const paths = svg.querySelectorAll("path, line, polyline, polygon, rect, circle");
  if (paths.length === 0) {
    throw new Error("SVG has no drawable pattern geometry.");
  }

  // ---- Mount in a hidden container so layout/style queries work ----
  const host = document.createElement("div");
  host.setAttribute(
    "style",
    "position:fixed;left:-99999px;top:0;width:0;height:0;overflow:hidden;pointer-events:none;",
  );
  host.appendChild(svg);
  document.body.appendChild(host);

  return {
    svg,
    widthPx: vw,
    heightPx: vh,
    viewBox: { x: vx, y: vy, w: vw, h: vh },
    dispose: () => {
      try {
        host.remove();
      } catch {
        /* noop */
      }
    },
  };
}

/**
 * Build a *cropped* clone of `svg` whose viewBox covers only the source
 * rectangle (in viewBox units). The clone is mounted in the same hidden
 * host so it can be rendered with svg2pdf without rasterisation.
 *
 * Used by tiled export: each tile asks for a sub-rectangle of the full
 * pattern and svg2pdf renders only what's inside the cropped viewBox.
 */
export function buildCroppedSvg(
  source: SVGSVGElement,
  srcX: number,
  srcY: number,
  srcW: number,
  srcH: number,
): { svg: SVGSVGElement; dispose: () => void } {
  const clone = source.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("viewBox", `${srcX} ${srcY} ${srcW} ${srcH}`);
  clone.setAttribute("width", String(srcW));
  clone.setAttribute("height", String(srcH));
  clone.setAttribute("preserveAspectRatio", "xMinYMin slice");

  const host = document.createElement("div");
  host.setAttribute(
    "style",
    "position:fixed;left:-99999px;top:0;width:0;height:0;overflow:hidden;pointer-events:none;",
  );
  host.appendChild(clone);
  document.body.appendChild(host);

  return {
    svg: clone,
    dispose: () => {
      try {
        host.remove();
      } catch {
        /* noop */
      }
    },
  };
}

/* ------------------------------------------------------------------ */
/* Vector render: SVG → PDF                                            */
/* ------------------------------------------------------------------ */

export interface RenderSvgOpts {
  /** Top-left x in mm (PDF units). */
  x: number;
  /** Top-left y in mm. */
  y: number;
  /** Output width in mm. */
  width: number;
  /** Output height in mm. */
  height: number;
}

/**
 * Render `svg` directly into `pdf` as vector content. No canvas, no PNG.
 * `svg` must already be mounted in the DOM (use `prepareSvgForExport`).
 */
export async function renderSvgIntoPdf(
  svg: SVGSVGElement,
  pdf: jsPDF,
  opts: RenderSvgOpts,
): Promise<void> {
  await svg2pdf(svg, pdf, {
    x: opts.x,
    y: opts.y,
    width: opts.width,
    height: opts.height,
  });
}

/* ------------------------------------------------------------------ */
/* Mobile-safe download trigger                                        */
/* ------------------------------------------------------------------ */

/** True for iPhone/iPad/iPod incl. iPadOS reporting "MacIntel" + touch. */
function isIosLike(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  // iPadOS 13+ masquerades as desktop Safari but exposes touch points.
  // Use a maxTouchPoints check instead of the deprecated platform string
  // so we don't break in test environments.
  const nav = navigator as Navigator & { maxTouchPoints?: number };
  return /Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1;
}

/**
 * Save the PDF in a way that works on iOS, iPadOS, Android, and desktop.
 *
 *  - Desktop and Android Chrome: standard `<a download>` click.
 *  - iOS Safari: ignores the `download` attribute on object-URL anchors,
 *    so we open the PDF in a new tab where the user can use the system
 *    share sheet to save it. This avoids the silent "download did
 *    nothing" failure that the previous PNG pipeline produced.
 *
 * The Blob is always retyped to `application/pdf` even if jsPDF returned
 * `application/octet-stream`, which fixes the iPad "downloaded but
 * pattern missing" bug (Quick Look refused unknown MIME types).
 */
export function saveOrOpenPdf(pdf: jsPDF, filename: string): "downloaded" | "opened" {
  // jsPDF returns its own Blob; rewrap to guarantee the MIME type and
  // strip any byte-order quirks introduced by some Blob polyfills.
  const raw = pdf.output("blob");
  const blob = new Blob([raw], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);

  if (isIosLike()) {
    // Open in a new tab; iOS Safari renders the PDF inline and offers
    // a Share button to save to Files / send to other apps.
    const win = window.open(url, "_blank");
    if (!win) {
      // Popup blocked — fall back to in-place navigation so the user
      // still gets the PDF, just in the same tab.
      window.location.href = url;
    }
    // Keep the URL alive long enough for the new tab to fetch it.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return "opened";
  }

  // Desktop / Android: standard download.
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 60_000);
  return "downloaded";
}
