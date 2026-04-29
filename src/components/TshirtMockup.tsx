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
 * Realistic 2D T-shirt silhouette built from named anchor points.
 *
 * Anchors: neck (L/R/dip), shoulders (L/R), sleeve cuffs (outer/inner),
 * armpits (L/R), hem (L/R). Connected with smooth quadratic/cubic
 * curves to feel like a real garment outline rather than a polygon.
 *
 * Visual aid only — NOT a sewing pattern.
 */
export const TshirtMockup = ({
  chest,
  shirtLength,
  sleeveLength,
  shoulder,
  neck,
  fit,
}: Props) => {
  const geom = useMemo(() => {
    // Fit ease — broadens silhouette visually.
    const fitEase = fit === "tight" ? 0.97 : fit === "relaxed" ? 1.14 : 1.05;

    // ── Proportion rules (per spec) ────────────────────────────────
    // body width  = chest / 2 (with fit ease, mapped to SVG units)
    // shoulder    = aligns with sleeve start
    // sleeve drop = ~25% of body height
    // neck width  ≈ 18% of chest
    // neck depth  proportional to neck width
    //
    // We work in a 320×360 viewBox for breathing room.
    const VB_W = 320;
    const VB_H = 360;
    const cx = VB_W / 2;

    // Scale cm → SVG units. Chest of ~100cm → body half-width ~85u.
    const CM_TO_U = 1.7;

    const halfBody = Math.max(46, Math.min(130, (chest * fitEase * CM_TO_U) / 2));
    const halfShoulder = Math.max(
      28,
      Math.min(halfBody - 4, (shoulder * CM_TO_U) / 2),
    );
    const bodyH = Math.max(140, Math.min(260, shirtLength * 1.55));
    const sleeveExt = Math.max(28, Math.min(150, sleeveLength * 1.15));

    // Neck — width is ~18% of chest, depth proportional to width.
    const neckHalf = Math.max(12, Math.min(34, chest * 0.18 * CM_TO_U * 0.5));
    const neckDepth = neckHalf * 0.95;

    // Vertical layout — leave top padding for neck + shoulder slope.
    const topY = 56;
    const shoulderY = topY + 8; // shoulders slightly below top
    const armpitY = shoulderY + bodyH * 0.25; // sleeve drop ~25% body height
    const hemY = shoulderY + bodyH;

    // ── Anchor points ─────────────────────────────────────────────
    const neck_L = { x: cx - neckHalf, y: topY };
    const neck_R = { x: cx + neckHalf, y: topY };
    const neck_dip = { x: cx, y: topY + neckDepth };

    const shoulder_L = { x: cx - halfShoulder, y: shoulderY };
    const shoulder_R = { x: cx + halfShoulder, y: shoulderY };

    // Sleeve direction: down & outward (~22°)
    const sleeveAngle = (22 * Math.PI) / 180;
    const dx = Math.sin(sleeveAngle) * sleeveExt;
    const dy = Math.cos(sleeveAngle) * sleeveExt;

    const cuff_L_outer = { x: shoulder_L.x - dx, y: shoulder_L.y + dy };
    const cuff_R_outer = { x: shoulder_R.x + dx, y: shoulder_R.y + dy };

    // Cuff opening width — proportional to shoulder width.
    const cuffWidth = Math.max(14, halfShoulder * 0.42);
    const perpX = Math.cos(sleeveAngle);
    const perpY = -Math.sin(sleeveAngle);
    const cuff_L_inner = {
      x: cuff_L_outer.x + cuffWidth * perpX,
      y: cuff_L_outer.y - cuffWidth * perpY,
    };
    const cuff_R_inner = {
      x: cuff_R_outer.x - cuffWidth * perpX,
      y: cuff_R_outer.y + cuffWidth * perpY,
    };

    const armpit_L = { x: cx - halfBody, y: armpitY };
    const armpit_R = { x: cx + halfBody, y: armpitY };

    // Hem — slight A-line so it doesn't feel like a rectangle.
    const halfHem = halfBody * (fit === "relaxed" ? 1.02 : 0.98);
    const hem_L = { x: cx - halfHem, y: hemY };
    const hem_R = { x: cx + halfHem, y: hemY };

    // ── Path: smooth, continuous outline ──────────────────────────
    // Start at neck-left, sweep across shoulders & down sleeves,
    // curve under armpits, down sides to hem, across hem, mirror up,
    // then close with neckline curve.
    const d = [
      `M ${neck_L.x.toFixed(2)} ${neck_L.y.toFixed(2)}`,
      // Shoulder slope (slight curve, not straight)
      `Q ${(neck_L.x + (shoulder_L.x - neck_L.x) * 0.4).toFixed(2)} ${(shoulderY - 1).toFixed(2)} ${shoulder_L.x.toFixed(2)} ${shoulder_L.y.toFixed(2)}`,
      // Top of left sleeve — gentle curve to outer cuff
      `Q ${(shoulder_L.x - dx * 0.45).toFixed(2)} ${(shoulder_L.y + dy * 0.35).toFixed(2)} ${cuff_L_outer.x.toFixed(2)} ${cuff_L_outer.y.toFixed(2)}`,
      // Cuff opening (straight)
      `L ${cuff_L_inner.x.toFixed(2)} ${cuff_L_inner.y.toFixed(2)}`,
      // Underside of sleeve up to armpit (curved inward)
      `Q ${(cuff_L_inner.x + (armpit_L.x - cuff_L_inner.x) * 0.5).toFixed(2)} ${(armpit_L.y - 6).toFixed(2)} ${armpit_L.x.toFixed(2)} ${armpit_L.y.toFixed(2)}`,
      // Body side: armpit down to hem (very subtle taper)
      `L ${hem_L.x.toFixed(2)} ${hem_L.y.toFixed(2)}`,
      // Hem (slight smile curve)
      `Q ${cx.toFixed(2)} ${(hemY + 6).toFixed(2)} ${hem_R.x.toFixed(2)} ${hem_R.y.toFixed(2)}`,
      // Right body side
      `L ${armpit_R.x.toFixed(2)} ${armpit_R.y.toFixed(2)}`,
      // Right sleeve underside
      `Q ${(cuff_R_inner.x + (armpit_R.x - cuff_R_inner.x) * 0.5).toFixed(2)} ${(armpit_R.y - 6).toFixed(2)} ${cuff_R_inner.x.toFixed(2)} ${cuff_R_inner.y.toFixed(2)}`,
      // Right cuff
      `L ${cuff_R_outer.x.toFixed(2)} ${cuff_R_outer.y.toFixed(2)}`,
      // Top of right sleeve back to shoulder
      `Q ${(shoulder_R.x + dx * 0.45).toFixed(2)} ${(shoulder_R.y + dy * 0.35).toFixed(2)} ${shoulder_R.x.toFixed(2)} ${shoulder_R.y.toFixed(2)}`,
      // Right shoulder slope into neck
      `Q ${(neck_R.x + (shoulder_R.x - neck_R.x) * 0.4).toFixed(2)} ${(shoulderY - 1).toFixed(2)} ${neck_R.x.toFixed(2)} ${neck_R.y.toFixed(2)}`,
      // Neckline (front scoop)
      `Q ${cx.toFixed(2)} ${(neck_dip.y + 2).toFixed(2)} ${neck_L.x.toFixed(2)} ${neck_L.y.toFixed(2)}`,
      "Z",
    ].join(" ");

    // Inner neckband line for depth.
    const neckband = `M ${neck_L.x.toFixed(2)} ${neck_L.y.toFixed(2)} Q ${cx.toFixed(2)} ${(neck_dip.y + 5).toFixed(2)} ${neck_R.x.toFixed(2)} ${neck_R.y.toFixed(2)}`;

    return { d, neckband, VB_W, VB_H };
  }, [chest, shirtLength, sleeveLength, shoulder, neck, fit]);

  return (
    <div className="rounded-md border border-border bg-secondary/30 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-foreground">Live preview</div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Visual guide · not to scale
        </div>
      </div>
      <div className="flex items-center justify-center px-2 py-3">
        <svg
          viewBox={`0 0 ${geom.VB_W} ${geom.VB_H}`}
          xmlns="http://www.w3.org/2000/svg"
          className="w-full max-w-[280px] h-auto block"
          aria-label="Live T-shirt silhouette mockup"
          role="img"
        >
          <path
            d={geom.d}
            fill="hsl(var(--foreground) / 0.04)"
            stroke="hsl(var(--foreground) / 0.78)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <path
            d={geom.neckband}
            fill="none"
            stroke="hsl(var(--foreground) / 0.55)"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground text-center">
        {fit.charAt(0).toUpperCase() + fit.slice(1)} fit · updates as you type
      </div>
    </div>
  );
};
