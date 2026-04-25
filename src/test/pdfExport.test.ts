import { describe, it, expect, afterEach } from "vitest";
import { prepareSvgForExport, buildCroppedSvg } from "@/lib/pdfExport";

const VALID_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" width="100%">
  <rect width="200" height="100" fill="#fff"/>
  <path d="M0 0 L200 100" stroke="#000"/>
</svg>`;

const NO_VIEWBOX = `<svg xmlns="http://www.w3.org/2000/svg" width="100"><path d="M0 0L1 1"/></svg>`;
const NO_PATHS = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>`;
const BROKEN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="bad bad bad bad"><path d="M0 0L1 1"/></svg>`;
const ZERO_BOX = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 0 0"><path d="M0 0L1 1"/></svg>`;
const EMPTY = "";

let disposers: Array<() => void> = [];

afterEach(() => {
  for (const d of disposers.splice(0)) d();
});

describe("prepareSvgForExport", () => {
  it("accepts a well-formed SVG, pins width/height, and reports the viewBox", () => {
    const r = prepareSvgForExport(VALID_SVG);
    disposers.push(r.dispose);

    expect(r.viewBox).toEqual({ x: 0, y: 0, w: 200, h: 100 });
    expect(r.svg.getAttribute("width")).toBe("200");
    expect(r.svg.getAttribute("height")).toBe("100");
    expect(r.svg.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");
    // SVG is mounted somewhere in the document so getComputedStyle works.
    expect(r.svg.ownerDocument).toBeTruthy();
    expect(document.body.contains(r.svg)).toBe(true);
  });

  it("disposes by detaching the host from the document", () => {
    const r = prepareSvgForExport(VALID_SVG);
    expect(document.body.contains(r.svg)).toBe(true);
    r.dispose();
    expect(document.body.contains(r.svg)).toBe(false);
  });

  it("rejects an empty payload", () => {
    expect(() => prepareSvgForExport(EMPTY)).toThrow(/empty/i);
  });

  it("rejects an SVG without a viewBox", () => {
    expect(() => prepareSvgForExport(NO_VIEWBOX)).toThrow(/viewBox/);
  });

  it("rejects an SVG with a malformed viewBox", () => {
    expect(() => prepareSvgForExport(BROKEN)).toThrow(/viewBox/);
  });

  it("rejects an SVG with a zero-area viewBox", () => {
    expect(() => prepareSvgForExport(ZERO_BOX)).toThrow(/non-positive/);
  });

  it("rejects an SVG with no drawable geometry", () => {
    expect(() => prepareSvgForExport(NO_PATHS)).toThrow(/no drawable/);
  });
});

describe("buildCroppedSvg", () => {
  it("clones the source and rewrites viewBox/width/height to the crop rect", () => {
    const r = prepareSvgForExport(VALID_SVG);
    disposers.push(r.dispose);

    const tile = buildCroppedSvg(r.svg, 50, 25, 100, 50);
    disposers.push(tile.dispose);

    expect(tile.svg.getAttribute("viewBox")).toBe("50 25 100 50");
    expect(tile.svg.getAttribute("width")).toBe("100");
    expect(tile.svg.getAttribute("height")).toBe("50");
    // Original is untouched.
    expect(r.svg.getAttribute("viewBox")).toBe("0 0 200 100");
    // Path geometry was carried over.
    expect(tile.svg.querySelector("path")).toBeTruthy();
  });
});
