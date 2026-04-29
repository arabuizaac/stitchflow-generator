import { useMemo } from "react";
import { computeBase, type Measurements } from "@/lib/patternGenerator";

interface Props {
  /** Raw measurements — same shape consumed by generatePattern(). */
  measurements: Measurements;
}

/**
 * Real-time T-shirt silhouette derived from the SAME base values as
 * the pattern engine (`computeBase`).
 *
 * Anchor points (all in cm, pattern coordinate space):
 *   neck center / left / right / dip
 *   shoulder L/R · sleeve cuff outer/inner
 *   armpit L/R · hem L/R
 *
 * The full-body silhouette is built by mirroring the half-pattern math
 * (front piece) about the center fold so what the user sees mirrors
 * what will be cut.
 */
export const TshirtMockup = ({ measurements }: Props) => {
  const { d, neckband, viewBox } = useMemo(() => {
    const base = computeBase(measurements);

    // ── Pattern-space dimensions (cm) ─────────────────────────────
    // Full body width = 2 × halfChest (front piece is on the fold).
    const bodyHalfW = base.halfChest;                  // cm
    const bodyH = base.shirtLength;                    // cm
    const shoulderHalf = base.shoulderHalf;            // cm
    const shoulderDrop = base.shoulderDrop;            // cm
    const armholeDepth = base.armholeDepth;            // cm
    const neckHalf = base.neckWidth;                   // cm
    const neckDepth = base.frontNeckDepth;             // cm
    const sleeveLen = base.sleeveLength;               // cm

    // ── Anchor points in pattern space (origin: top-center) ───────
    // Y grows downward. X is centered at 0; mirror across x=0.
    const topY = 0;
    const shoulderY = topY + shoulderDrop;
    const armpitY = shoulderY + armholeDepth;
    const hemY = topY + bodyH;

    const neck_L = { x: -neckHalf, y: topY };
    const neck_R = { x: neckHalf, y: topY };
    const neck_dip = { x: 0, y: topY + neckDepth };

    const shoulder_L = { x: -shoulderHalf, y: shoulderY };
    const shoulder_R = { x: shoulderHalf, y: shoulderY };

    // Sleeve angle ~22° outward from vertical
    const sleeveAngle = (22 * Math.PI) / 180;
    const dx = Math.sin(sleeveAngle) * sleeveLen;
    const dy = Math.cos(sleeveAngle) * sleeveLen;

    const cuff_L_outer = { x: shoulder_L.x - dx, y: shoulder_L.y + dy };
    const cuff_R_outer = { x: shoulder_R.x + dx, y: shoulder_R.y + dy };

    // Cuff opening — proportional to the sleeve's natural width at the
    // armpit (≈ bodyHalfW − shoulderHalf). Keeps sleeves anatomically sane.
    const sleeveOpening = Math.max(6, (bodyHalfW - shoulderHalf) * 1.1);
    const perpX = Math.cos(sleeveAngle);
    const perpY = -Math.sin(sleeveAngle);
    const cuff_L_inner = {
      x: cuff_L_outer.x + sleeveOpening * perpX,
      y: cuff_L_outer.y - sleeveOpening * perpY,
    };
    const cuff_R_inner = {
      x: cuff_R_outer.x - sleeveOpening * perpX,
      y: cuff_R_outer.y + sleeveOpening * perpY,
    };

    const armpit_L = { x: -bodyHalfW, y: armpitY };
    const armpit_R = { x: bodyHalfW, y: armpitY };

    const hem_L = { x: -bodyHalfW, y: hemY };
    const hem_R = { x: bodyHalfW, y: hemY };

    // ── Build the silhouette path ─────────────────────────────────
    const path = [
      `M ${neck_L.x.toFixed(2)} ${neck_L.y.toFixed(2)}`,
      // Left shoulder slope (slight curve)
      `Q ${(neck_L.x + (shoulder_L.x - neck_L.x) * 0.45).toFixed(2)} ${(shoulderY - 0.4).toFixed(2)} ${shoulder_L.x.toFixed(2)} ${shoulder_L.y.toFixed(2)}`,
      // Sleeve top — gentle convex cap
      `Q ${(shoulder_L.x - dx * 0.45).toFixed(2)} ${(shoulder_L.y + dy * 0.32).toFixed(2)} ${cuff_L_outer.x.toFixed(2)} ${cuff_L_outer.y.toFixed(2)}`,
      // Cuff
      `L ${cuff_L_inner.x.toFixed(2)} ${cuff_L_inner.y.toFixed(2)}`,
      // Sleeve underside up to armpit (mirrors armhole curve direction)
      `Q ${(cuff_L_inner.x + (armpit_L.x - cuff_L_inner.x) * 0.55).toFixed(2)} ${(armpit_L.y - armholeDepth * 0.12).toFixed(2)} ${armpit_L.x.toFixed(2)} ${armpit_L.y.toFixed(2)}`,
      // Side seam
      `L ${hem_L.x.toFixed(2)} ${hem_L.y.toFixed(2)}`,
      // Hem (slight smile)
      `Q 0 ${(hemY + Math.max(0.5, bodyH * 0.012)).toFixed(2)} ${hem_R.x.toFixed(2)} ${hem_R.y.toFixed(2)}`,
      // Right side seam
      `L ${armpit_R.x.toFixed(2)} ${armpit_R.y.toFixed(2)}`,
      // Right sleeve underside
      `Q ${(cuff_R_inner.x + (armpit_R.x - cuff_R_inner.x) * 0.55).toFixed(2)} ${(armpit_R.y - armholeDepth * 0.12).toFixed(2)} ${cuff_R_inner.x.toFixed(2)} ${cuff_R_inner.y.toFixed(2)}`,
      `L ${cuff_R_outer.x.toFixed(2)} ${cuff_R_outer.y.toFixed(2)}`,
      // Right sleeve top
      `Q ${(shoulder_R.x + dx * 0.45).toFixed(2)} ${(shoulder_R.y + dy * 0.32).toFixed(2)} ${shoulder_R.x.toFixed(2)} ${shoulder_R.y.toFixed(2)}`,
      // Right shoulder slope
      `Q ${(neck_R.x + (shoulder_R.x - neck_R.x) * 0.45).toFixed(2)} ${(shoulderY - 0.4).toFixed(2)} ${neck_R.x.toFixed(2)} ${neck_R.y.toFixed(2)}`,
      // Front neckline scoop
      `Q 0 ${(neck_dip.y + 0.5).toFixed(2)} ${neck_L.x.toFixed(2)} ${neck_L.y.toFixed(2)}`,
      "Z",
    ].join(" ");

    // Inner neckband for visual depth
    const band = `M ${neck_L.x.toFixed(2)} ${neck_L.y.toFixed(2)} Q 0 ${(neck_dip.y + 1.2).toFixed(2)} ${neck_R.x.toFixed(2)} ${neck_R.y.toFixed(2)}`;

    // ── ViewBox: tight bounding box with padding, preserves ratio ─
    // Extreme X = max(|cuff_outer.x|, |hem|), extreme Y = hemY.
    const minX = Math.min(cuff_L_outer.x, hem_L.x);
    const maxX = Math.max(cuff_R_outer.x, hem_R.x);
    const minY = topY;
    const maxY = hemY + 1; // small slack for hem curve
    const padX = (maxX - minX) * 0.06;
    const padY = (maxY - minY) * 0.05;
    const vb = `${(minX - padX).toFixed(2)} ${(minY - padY).toFixed(2)} ${(maxX - minX + padX * 2).toFixed(2)} ${(maxY - minY + padY * 2).toFixed(2)}`;

    return { d: path, neckband: band, viewBox: vb };
  }, [
    measurements.chest,
    measurements.neck,
    measurements.shoulder,
    measurements.shirtLength,
    measurements.sleeveLength,
    measurements.fit,
    measurements.fabric,
    measurements.size,
  ]);

  return (
    <div className="rounded-md border border-border bg-secondary/30 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-foreground">Live preview</div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Derived from pattern base
        </div>
      </div>
      <div className="flex items-center justify-center px-2 py-3">
        <svg
          viewBox={viewBox}
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="xMidYMid meet"
          className="w-full max-w-[280px] h-auto block"
          aria-label="Live T-shirt silhouette derived from pattern base values"
          role="img"
        >
          <path
            d={d}
            fill="hsl(var(--foreground) / 0.04)"
            stroke="hsl(var(--foreground) / 0.82)"
            strokeWidth="0.6"
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            strokeLinecap="round"
            style={{ strokeWidth: 2 }}
          />
          <path
            d={neckband}
            fill="none"
            stroke="hsl(var(--foreground) / 0.55)"
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
            style={{ strokeWidth: 1.4 }}
          />
        </svg>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground text-center">
        Mirrors the pattern base · updates on every change
      </div>
    </div>
  );
};
