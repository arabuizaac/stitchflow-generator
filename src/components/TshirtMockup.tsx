import { useMemo } from "react";
import type { FitType } from "@/lib/patternGenerator";

interface Props {
  /** Chest circumference in cm */
  chest: number;
  /** Shirt body length in cm */
  shirtLength: number;
  /** Sleeve length in cm */
  sleeveLength: number;
  /** Shoulder width seam-to-seam in cm */
  shoulder: number;
  /** Neck circumference in cm */
  neck: number;
  fit: FitType;
}

/**
 * Lightweight 2D T-shirt mockup. Pure SVG, no animations beyond
 * CSS transitions on the path's `d` attribute (browsers will not
 * tween path data, so we rely on instant updates — which is what
 * the spec asks for: "feel fast and responsive").
 *
 * NOT a sewing pattern. Visual aid only.
 */
export const TshirtMockup = ({
  chest,
  shirtLength,
  sleeveLength,
  shoulder,
  neck,
  fit,
}: Props) => {
  const path = useMemo(() => {
    // Fit ease multiplier — broadens the silhouette visually.
    const fitEase = fit === "tight" ? 0.96 : fit === "relaxed" ? 1.12 : 1.04;

    // Map cm → SVG units. We center the shirt in a 240×300 viewBox.
    // Half-chest drives body half-width.
    const halfChest = Math.max(30, Math.min(80, (chest * fitEase) / 2));
    const halfShoulder = Math.max(18, Math.min(halfChest - 2, shoulder / 2));
    const bodyH = Math.max(80, Math.min(220, shirtLength * 1.6));
    const sleeveExt = Math.max(20, Math.min(120, sleeveLength * 1.1));
    const neckHalf = Math.max(8, Math.min(22, neck / 4));

    const cx = 120; // canvas center x
    const topY = 40; // shoulder line y

    // Key points
    const shoulderL = { x: cx - halfShoulder, y: topY };
    const shoulderR = { x: cx + halfShoulder, y: topY };

    // Sleeve direction: down & out at ~25°
    const sleeveAngle = Math.PI / 7;
    const sleeveDx = Math.sin(sleeveAngle) * sleeveExt;
    const sleeveDy = Math.cos(sleeveAngle) * sleeveExt;
    const sleeveCuffWidth = Math.max(10, halfShoulder * 0.35);

    // Sleeve cuff corners
    const cuffLOuter = { x: shoulderL.x - sleeveDx, y: shoulderL.y + sleeveDy };
    const cuffLInner = {
      x: cuffLOuter.x + sleeveCuffWidth * Math.cos(sleeveAngle),
      y: cuffLOuter.y + sleeveCuffWidth * Math.sin(sleeveAngle),
    };
    const cuffROuter = { x: shoulderR.x + sleeveDx, y: shoulderR.y + sleeveDy };
    const cuffRInner = {
      x: cuffROuter.x - sleeveCuffWidth * Math.cos(sleeveAngle),
      y: cuffROuter.y + sleeveCuffWidth * Math.sin(sleeveAngle),
    };

    // Underarm — slightly inside the chest line
    const armpitY = topY + Math.max(40, halfChest * 0.7);
    const underarmL = { x: cx - halfChest, y: armpitY };
    const underarmR = { x: cx + halfChest, y: armpitY };

    // Hem
    const hemY = topY + bodyH;
    const hemL = { x: cx - halfChest * 0.96, y: hemY };
    const hemR = { x: cx + halfChest * 0.96, y: hemY };

    // Neck cutout (simple curve)
    const neckL = { x: cx - neckHalf, y: topY };
    const neckR = { x: cx + neckHalf, y: topY };
    const neckDip = topY + neckHalf * 0.9;

    return {
      d: [
        `M ${neckL.x} ${neckL.y}`,
        `L ${shoulderL.x} ${shoulderL.y}`,
        `L ${cuffLOuter.x} ${cuffLOuter.y}`,
        `L ${cuffLInner.x} ${cuffLInner.y}`,
        `L ${underarmL.x} ${underarmL.y}`,
        `L ${hemL.x} ${hemY}`,
        `L ${hemR.x} ${hemY}`,
        `L ${underarmR.x} ${underarmR.y}`,
        `L ${cuffRInner.x} ${cuffRInner.y}`,
        `L ${cuffROuter.x} ${cuffROuter.y}`,
        `L ${shoulderR.x} ${shoulderR.y}`,
        `Q ${cx} ${neckDip} ${neckL.x} ${neckL.y}`,
        "Z",
      ].join(" "),
      neckPath: `M ${neckL.x} ${neckL.y} Q ${cx} ${neckDip} ${neckR.x} ${neckR.y}`,
    };
  }, [chest, shirtLength, sleeveLength, shoulder, neck, fit]);

  return (
    <div className="rounded-md border border-border bg-secondary/30 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-foreground">Live preview</div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Visual guide · not to scale
        </div>
      </div>
      <svg
        viewBox="0 0 240 300"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto block"
        aria-label="Live T-shirt silhouette mockup"
        role="img"
      >
        <path
          d={path.d}
          fill="hsl(var(--secondary))"
          stroke="hsl(var(--foreground))"
          strokeWidth="1.4"
          strokeLinejoin="round"
          style={{ transition: "d 120ms ease-out" }}
        />
        <path
          d={path.neckPath}
          fill="none"
          stroke="hsl(var(--foreground))"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
      <div className="mt-1 text-[10px] text-muted-foreground text-center">
        {fit.charAt(0).toUpperCase() + fit.slice(1)} fit · updates as you type
      </div>
    </div>
  );
};
