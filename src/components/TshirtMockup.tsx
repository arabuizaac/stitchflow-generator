import { useMemo } from "react";
import { computeBase, type Measurements } from "@/lib/patternGenerator";

interface Props {
  /** Raw measurements — same shape consumed by generatePattern(). */
  measurements: Measurements;
}

/**
 * Realistic T-shirt silhouette derived from the SAME base values as
 * the pattern engine (`computeBase`). Uses cubic Béziers for shoulder
 * slopes and sleeve caps so the outline feels like a real garment
 * sketch — no triangular sleeves, no sharp shoulder corners.
 *
 * Anchor points (cm, pattern coordinate space, mirrored about x=0):
 *   neck L/R/dip · shoulder L/R · sleeve cuff outer/inner
 *   armpit L/R · hem L/R
 */
export const TshirtMockup = ({ measurements }: Props) => {
  const geom = useMemo(() => {
    if (!measurements) return null;
    const base = computeBase(measurements);

    // ── Pattern dimensions (cm) ───────────────────────────────────
    const bodyHalfW = base.halfChest;
    const bodyH = base.shirtLength;
    const shoulderHalf = base.shoulderHalf;
    const shoulderDrop = base.shoulderDrop;
    const armholeDepth = base.armholeDepth;
    const neckHalf = base.neckWidth;
    const neckDepth = base.frontNeckDepth;
    const sleeveLen = base.sleeveLength;

    // ── Vertical anchors ──────────────────────────────────────────
    // sleeve drop (top→armpit)  ≈ 25–30% body height
    // armpit_y ≥ shoulderY + armholeDepth — keep the pattern truth
    const topY = 0;
    const shoulderY = topY + shoulderDrop;
    const armpitY = shoulderY + armholeDepth;
    const hemY = topY + bodyH;

    // ── Horizontal anchors ────────────────────────────────────────
    const neck_L = { x: -neckHalf, y: topY };
    const neck_R = { x: neckHalf, y: topY };
    const neck_dip = { x: 0, y: topY + neckDepth };

    const shoulder_L = { x: -shoulderHalf, y: shoulderY };
    const shoulder_R = { x: shoulderHalf, y: shoulderY };

    // Sleeve angle ~24° outward from vertical — reads as a real sleeve.
    const sleeveAngle = (24 * Math.PI) / 180;
    const dx = Math.sin(sleeveAngle) * sleeveLen;
    const dy = Math.cos(sleeveAngle) * sleeveLen;

    const cuff_L_outer = { x: shoulder_L.x - dx, y: shoulder_L.y + dy };
    const cuff_R_outer = { x: shoulder_R.x + dx, y: shoulder_R.y + dy };

    // Cuff opening — proportional to the sleeve at the armpit. Keeps
    // the cuff narrower than the bicep so the sleeve looks tapered.
    const sleeveAtArmpit = Math.max(8, (bodyHalfW - shoulderHalf) * 1.15);
    const cuffOpening = Math.max(6, sleeveAtArmpit * 0.78);
    const perpX = Math.cos(sleeveAngle); // perpendicular to sleeve axis
    const perpY = -Math.sin(sleeveAngle);
    const cuff_L_inner = {
      x: cuff_L_outer.x + cuffOpening * perpX,
      y: cuff_L_outer.y - cuffOpening * perpY,
    };
    const cuff_R_inner = {
      x: cuff_R_outer.x - cuffOpening * perpX,
      y: cuff_R_outer.y + cuffOpening * perpY,
    };

    const armpit_L = { x: -bodyHalfW, y: armpitY };
    const armpit_R = { x: bodyHalfW, y: armpitY };
    const hem_L = { x: -bodyHalfW, y: hemY };
    const hem_R = { x: bodyHalfW, y: hemY };

    // ── Path construction (clockwise from left cuff) ─────────────
    // We build with cubic Béziers for shoulders and sleeve caps so
    // every transition is smooth. Vertical body sides stay straight.
    //
    // Helper for cubic control points relative to two anchors.
    const f = (n: number) => n.toFixed(2);

    // Sleeve top cap (outer→shoulder): convex cap, control points
    // pulled OUT and UP slightly to give the cap a natural arc.
    const capLx_c1 = cuff_L_outer.x + (shoulder_L.x - cuff_L_outer.x) * 0.35;
    const capLy_c1 = cuff_L_outer.y - (cuff_L_outer.y - shoulder_L.y) * 0.55;
    const capLx_c2 = shoulder_L.x - (shoulder_L.x - cuff_L_outer.x) * 0.18;
    const capLy_c2 = shoulder_L.y + (cuff_L_outer.y - shoulder_L.y) * 0.05;

    // Mirror for right cap (shoulder→cuff)
    const capRx_c1 = shoulder_R.x + (cuff_R_outer.x - shoulder_R.x) * 0.18;
    const capRy_c1 = shoulder_R.y + (cuff_R_outer.y - shoulder_R.y) * 0.05;
    const capRx_c2 = cuff_R_outer.x - (cuff_R_outer.x - shoulder_R.x) * 0.35;
    const capRy_c2 = cuff_R_outer.y - (cuff_R_outer.y - shoulder_R.y) * 0.55;

    // Shoulder slope (shoulder→neck): subtle slope downward into neck.
    // Keep it as a gentle quadratic — straight feels stiff, deep feels droopy.
    const shL_qx = neck_L.x + (shoulder_L.x - neck_L.x) * 0.35;
    const shL_qy = shoulderY - 0.5;
    const shR_qx = neck_R.x + (shoulder_R.x - neck_R.x) * 0.35;
    const shR_qy = shoulderY - 0.5;

    // Sleeve underside (cuff_inner→armpit): concave curve to suggest
    // the inner-arm scoop. Control point sits ABOVE (smaller y) the
    // straight line midpoint.
    const underL_qx = (cuff_L_inner.x + armpit_L.x) / 2 + armholeDepth * 0.05;
    const underL_qy = (cuff_L_inner.y + armpit_L.y) / 2 - armholeDepth * 0.18;
    const underR_qx = (cuff_R_inner.x + armpit_R.x) / 2 - armholeDepth * 0.05;
    const underR_qy = (cuff_R_inner.y + armpit_R.y) / 2 - armholeDepth * 0.18;

    // Hem smile — very subtle convex curve.
    const hem_qy = hemY + Math.max(0.4, bodyH * 0.01);

    // Front neckline scoop — control depth slightly past the dip so
    // the curve feels like a real crew/scoop neck rather than a vee.
    const neck_qy = neck_dip.y + 0.6;

    const d = [
      // Start: outer left cuff
      `M ${f(cuff_L_outer.x)} ${f(cuff_L_outer.y)}`,
      // Cuff (straight, short segment)
      `L ${f(cuff_L_inner.x)} ${f(cuff_L_inner.y)}`,
      // Sleeve underside up to armpit (concave curve)
      `Q ${f(underL_qx)} ${f(underL_qy)} ${f(armpit_L.x)} ${f(armpit_L.y)}`,
      // Body side seam (vertical, straight)
      `L ${f(hem_L.x)} ${f(hem_L.y)}`,
      // Hem (subtle smile)
      `Q 0 ${f(hem_qy)} ${f(hem_R.x)} ${f(hem_R.y)}`,
      // Right side seam
      `L ${f(armpit_R.x)} ${f(armpit_R.y)}`,
      // Right sleeve underside
      `Q ${f(underR_qx)} ${f(underR_qy)} ${f(cuff_R_inner.x)} ${f(cuff_R_inner.y)}`,
      // Right cuff
      `L ${f(cuff_R_outer.x)} ${f(cuff_R_outer.y)}`,
      // Right sleeve cap (cuff → shoulder) — cubic
      `C ${f(capRx_c2)} ${f(capRy_c2)} ${f(capRx_c1)} ${f(capRy_c1)} ${f(shoulder_R.x)} ${f(shoulder_R.y)}`,
      // Right shoulder slope into neck — quadratic
      `Q ${f(shR_qx)} ${f(shR_qy)} ${f(neck_R.x)} ${f(neck_R.y)}`,
      // Front neckline scoop
      `Q 0 ${f(neck_qy)} ${f(neck_L.x)} ${f(neck_L.y)}`,
      // Left shoulder slope into shoulder point
      `Q ${f(shL_qx)} ${f(shL_qy)} ${f(shoulder_L.x)} ${f(shoulder_L.y)}`,
      // Left sleeve cap (shoulder → cuff_outer) — cubic
      `C ${f(capLx_c2)} ${f(capLy_c2)} ${f(capLx_c1)} ${f(capLy_c1)} ${f(cuff_L_outer.x)} ${f(cuff_L_outer.y)}`,
      "Z",
    ].join(" ");

    // Inner neckband — slightly deeper scoop suggesting ribbing.
    const band = `M ${f(neck_L.x)} ${f(neck_L.y)} Q 0 ${f(neck_dip.y + 1.4)} ${f(neck_R.x)} ${f(neck_R.y)}`;

    // ── ViewBox: tight bounds with padding, preserves aspect ─────
    const minX = Math.min(cuff_L_outer.x, hem_L.x);
    const maxX = Math.max(cuff_R_outer.x, hem_R.x);
    const minY = topY;
    const maxY = hemY + 1.2;
    const padX = (maxX - minX) * 0.06;
    const padY = (maxY - minY) * 0.05;
    const viewBox = `${f(minX - padX)} ${f(minY - padY)} ${f(maxX - minX + padX * 2)} ${f(maxY - minY + padY * 2)}`;

    return { d, neckband: band, viewBox };
  }, [
    measurements?.chest,
    measurements?.neck,
    measurements?.shoulder,
    measurements?.shirtLength,
    measurements?.sleeveLength,
    measurements?.fit,
    measurements?.fabric,
    measurements?.size,
  ]);

  if (!geom) return null;

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
          viewBox={geom.viewBox}
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="xMidYMid meet"
          className="w-full max-w-[280px] h-auto block"
          aria-label="Live T-shirt silhouette derived from pattern base values"
          role="img"
        >
          <path
            d={geom.d}
            fill="hsl(var(--foreground) / 0.04)"
            stroke="hsl(var(--foreground) / 0.85)"
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            strokeLinecap="round"
            style={{ strokeWidth: 2 }}
          />
          <path
            d={geom.neckband}
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
