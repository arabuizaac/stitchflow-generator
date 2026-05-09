import { useMemo } from "react";
import type { Measurements } from "@/lib/patternGenerator";

/**
 * Responsive 2D T-shirt preview.
 *
 * The SVG is the MASTER SHAPE. Paths are never regenerated — only
 * isolated transform groups are scaled / translated within tight clamps,
 * so the silhouette always remains a clean fashion-flat illustration.
 */

interface Props {
  values: Measurements;
}

// Reference (default) measurements used to derive deltas.
const REF = {
  chest: 96,
  shoulder: 44,
  sleeveLength: 60,
  shirtLength: 72,
  neck: 38,
} as const;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export default function ResponsiveTshirt({ values }: Props) {
  const transforms = useMemo(() => {
    // --- Sleeve length: extend downward only. Max ±12%.
    const sleeveDelta = (values.sleeveLength - REF.sleeveLength) / REF.sleeveLength;
    const sleeveScaleY = 1 + clamp(sleeveDelta, -0.12, 0.12);

    // --- Chest: widen torso. Max ±8% width => ±4% scaleX from center.
    const chestDelta = (values.chest - REF.chest) / REF.chest;
    const torsoScaleX = 1 + clamp(chestDelta, -0.08, 0.08) * 0.5;

    // --- Shirt length: extend lower torso only. Max ±10%.
    const lenDelta = (values.shirtLength - REF.shirtLength) / REF.shirtLength;
    const torsoScaleY = 1 + clamp(lenDelta, -0.10, 0.10);

    // --- Shoulder width: shift sleeves outward. Max ±6%.
    const shoulderDelta = (values.shoulder - REF.shoulder) / REF.shoulder;
    const shoulderShift = clamp(shoulderDelta, -0.06, 0.06) * 14; // px

    // --- Neck: widen collar opening. Max ±5%.
    const neckDelta = (values.neck - REF.neck) / REF.neck;
    const collarScaleX = 1 + clamp(neckDelta, -0.05, 0.05);

    return { sleeveScaleY, torsoScaleX, torsoScaleY, shoulderShift, collarScaleX };
  }, [values.sleeveLength, values.chest, values.shirtLength, values.shoulder, values.neck]);

  const { sleeveScaleY, torsoScaleX, torsoScaleY, shoulderShift, collarScaleX } = transforms;

  // Anchors
  const CX = 100;          // horizontal center
  const SHOULDER_Y = 30;   // shoulder line — anchor for vertical scaling

  const groupStyle = { transition: "transform 180ms ease" } as const;

  return (
    <svg
      viewBox="0 0 200 240"
      xmlns="http://www.w3.org/2000/svg"
      className="w-[320px] max-w-[90%] h-auto"
      role="img"
      aria-label="T-shirt flat sketch responding to measurements"
    >
      <defs>
        <linearGradient id="tee-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#f4f6fa" />
        </linearGradient>
      </defs>

      {/* --- TORSO (front body) ----------------------------------------- */}
      <g
        style={{
          ...groupStyle,
          transform: `translate(${CX}px, ${SHOULDER_Y}px) scale(${torsoScaleX}, ${torsoScaleY}) translate(${-CX}px, ${-SHOULDER_Y}px)`,
          transformBox: "fill-box",
          transformOrigin: "0 0",
        }}
      >
        <path
          d="
            M 62 30
            L 88 24
            Q 100 18 112 24
            L 138 30
            L 142 92
            Q 146 158 138 218
            L 62 218
            Q 54 158 58 92
            Z
          "
          fill="url(#tee-fill)"
          stroke="#2b2f36"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        {/* hem detail — kept straight */}
        <line
          x1="62" y1="218" x2="138" y2="218"
          stroke="#2b2f36" strokeWidth="1.6" strokeLinecap="round"
        />
      </g>

      {/* --- LEFT SLEEVE ------------------------------------------------ */}
      <g
        style={{
          ...groupStyle,
          transform: `translate(${-shoulderShift}px, 0) translate(60px, 30px) scale(1, ${sleeveScaleY}) translate(-60px, -30px)`,
        }}
      >
        <path
          d="
            M 60 30
            L 38 36
            Q 24 52 28 86
            L 58 90
            Q 60 60 62 32
            Z
          "
          fill="url(#tee-fill)"
          stroke="#2b2f36"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        {/* sleeve hem */}
        <path
          d="M 28 86 Q 42 90 58 90"
          fill="none" stroke="#2b2f36" strokeWidth="1.2"
        />
      </g>

      {/* --- RIGHT SLEEVE (mirror) -------------------------------------- */}
      <g
        style={{
          ...groupStyle,
          transform: `translate(${shoulderShift}px, 0) translate(140px, 30px) scale(1, ${sleeveScaleY}) translate(-140px, -30px)`,
        }}
      >
        <path
          d="
            M 140 30
            L 162 36
            Q 176 52 172 86
            L 142 90
            Q 140 60 138 32
            Z
          "
          fill="url(#tee-fill)"
          stroke="#2b2f36"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="M 172 86 Q 158 90 142 90"
          fill="none" stroke="#2b2f36" strokeWidth="1.2"
        />
      </g>

      {/* --- COLLAR / NECKBAND ------------------------------------------ */}
      <g
        style={{
          ...groupStyle,
          transform: `translate(${CX}px, 22px) scale(${collarScaleX}, 1) translate(${-CX}px, -22px)`,
        }}
      >
        <path
          d="M 86 24 Q 100 12 114 24"
          fill="none" stroke="#2b2f36" strokeWidth="1.6" strokeLinecap="round"
        />
        {/* ribbed collar inner line */}
        <path
          d="M 88 27 Q 100 17 112 27"
          fill="none" stroke="#2b2f36" strokeWidth="0.9" opacity="0.55"
        />
      </g>

      {/* subtle stitch details — purely decorative, not transformed */}
      <g opacity="0.35">
        <path d="M 60 32 Q 100 26 140 32" fill="none" stroke="#2b2f36" strokeWidth="0.6" strokeDasharray="1.5 2" />
      </g>
    </svg>
  );
}
