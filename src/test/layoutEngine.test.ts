import { describe, it, expect } from "vitest";
import { generatePattern, type FitType, type Measurements } from "@/lib/patternGenerator";
import {
  layoutPieces,
  findOverlap,
  checkOverlap,
  MIN_SPACING_PX,
  PX_PER_CM,
} from "@/lib/layoutEngine";

const fits: FitType[] = ["tight", "regular", "relaxed"];

// A spread of realistic and extreme measurements.
const cases: Measurements[] = [];
for (const fit of fits) {
  for (const chest of [70, 90, 110, 140, 180]) {
    for (const length of [60, 80, 110]) {
      cases.push({
        chest,
        shoulder: Math.max(20, chest * 0.45),
        sleeveLength: Math.max(40, chest * 0.6),
        shirtLength: length,
        neck: Math.min(chest / 2, chest * 0.35),
        fit,
        fabric: "cotton",
      });
    }
  }
}

describe("layoutEngine", () => {
  it("checkOverlap basic AABB", () => {
    expect(
      checkOverlap(
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 5, y: 5, width: 10, height: 10 },
      ),
    ).toBe(true);

    // Touching edges do not count as overlap.
    expect(
      checkOverlap(
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 10, y: 0, width: 10, height: 10 },
      ),
    ).toBe(false);
  });

  it.each(cases)(
    "produces zero-overlap layout for %o",
    (m) => {
      const pattern = generatePattern(m);
      const layout = layoutPieces(pattern.pieces, { maxWidth: 1200 });

      expect(layout.overlapFree).toBe(true);
      expect(findOverlap(layout.positioned)).toBeNull();

      // Every pair must respect MIN_SPACING_PX gap on at least one axis.
      for (let i = 0; i < layout.positioned.length; i++) {
        for (let j = i + 1; j < layout.positioned.length; j++) {
          const a = layout.positioned[i];
          const b = layout.positioned[j];
          const horizontalGap =
            a.x + a.width <= b.x
              ? b.x - (a.x + a.width)
              : b.x + b.width <= a.x
                ? a.x - (b.x + b.width)
                : -1;
          const verticalGap =
            a.y + a.height <= b.y
              ? b.y - (a.y + a.height)
              : b.y + b.height <= a.y
                ? a.y - (b.y + b.height)
                : -1;
          // At least one axis must have a positive gap (= no overlap),
          // and the largest non-negative gap must meet MIN_SPACING_PX.
          const maxGap = Math.max(horizontalGap, verticalGap);
          expect(maxGap).toBeGreaterThanOrEqual(MIN_SPACING_PX - 1);
        }
      }
    },
  );

  it("wraps to multiple rows when maxWidth is small", () => {
    const pattern = generatePattern({
      chest: 100,
      shoulder: 45,
      sleeveLength: 60,
      shirtLength: 70,
      neck: 38,
      fit: "regular",
      fabric: "cotton",
    });
    const layout = layoutPieces(pattern.pieces, { maxWidth: 400 });
    expect(layout.overlapFree).toBe(true);
    expect(layout.rows).toBeGreaterThan(1);
  });

  it("uses true bounding boxes with width >= 1px", () => {
    const pattern = generatePattern({
      chest: 90,
      shoulder: 42,
      sleeveLength: 55,
      shirtLength: 70,
      neck: 36,
      fit: "regular",
    });
    const layout = layoutPieces(pattern.pieces);
    for (const p of layout.positioned) {
      expect(p.width).toBeGreaterThan(0);
      expect(p.height).toBeGreaterThan(0);
      // Sanity: width should be at least a few cm.
      expect(p.width).toBeGreaterThan(PX_PER_CM);
    }
  });
});
