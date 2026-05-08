import { useMemo } from "react";
import type { Measurements } from "@/lib/patternGenerator";

interface Props {
  measurements: Pick<
    Measurements,
    "chest" | "shoulder" | "sleeveLength" | "shirtLength" | "neck"
  >;
}

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

/**
 * Subtle, premium 2D fashion-flat preview.
 *
 * The base illustration is fixed; only a small set of group transforms
 * react to user measurements so the silhouette stays clean and never
 * distorts. Ratios are softened (sqrt + tight clamps) to avoid any
 * cartoon-like morphing.
 */
export function GarmentPreview({ measurements }: Props) {
  const t = useMemo(() => {
    const soften = (ratio: number, min: number, max: number) => {
      // sqrt damps the response; clamp prevents extremes
      const damped = Math.sign(ratio - 1) * Math.sqrt(Math.abs(ratio - 1)) + 1;
      return clamp(damped, min, max);
    };

    const chestScale = soften(measurements.chest / 96, 0.9, 1.12);
    const shoulderScale = soften(measurements.shoulder / 44, 0.92, 1.08);
    const bodyLenScale = soften(measurements.shirtLength / 72, 0.92, 1.15);
    const neckScale = soften(measurements.neck / 38, 0.9, 1.1);

    // Sleeve length: explicit short/medium/long bands
    let sleeveLenScale: number;
    if (measurements.sleeveLength < 20) sleeveLenScale = 0.45; // short
    else if (measurements.sleeveLength <= 35) sleeveLenScale = 0.7; // medium
    else sleeveLenScale = clamp(measurements.sleeveLength / 60, 0.85, 1.2);

    return { chestScale, shoulderScale, bodyLenScale, neckScale, sleeveLenScale };
  }, [measurements]);

  // Base coordinate system: 320 wide, 380 tall
  // Center x = 160, shoulder line y ≈ 70, hem y ≈ 320
  const stroke = "hsl(var(--pattern-stroke))";
  const fill = "hsl(0 0% 100%)";

  // Hem extension (extra pixels added downward only)
  const hemExtend = (t.bodyLenScale - 1) * 90;

  return (
    <svg
      viewBox="0 0 320 400"
      width="100%"
      className="w-[320px] max-w-[90%] h-auto select-none"
      role="img"
      aria-label="Live 2D garment preview reflecting current measurements"
    >
      <defs>
        <style>{`
          .gp-grp { transition: transform 220ms ease; transform-box: fill-box; transform-origin: center; }
          .gp-path { transition: d 220ms ease, transform 220ms ease; }
        `}</style>
      </defs>

      {/* Subtle drop shadow */}
      <ellipse cx="160" cy="378" rx="90" ry="5" fill="hsl(220 25% 12% / 0.06)" />

      {/* LEFT SLEEVE — anchored at shoulder, scales downward only */}
      <g
        className="gp-grp"
        style={{
          transform: `translate(${(1 - t.shoulderScale) * 18}px, 0) scaleY(${t.sleeveLenScale})`,
          transformOrigin: "70px 78px",
        }}
      >
        <path
          d="M 88 78 L 56 96 L 44 168 L 78 178 L 96 110 Z"
          fill={fill}
          stroke={stroke}
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </g>

      {/* RIGHT SLEEVE */}
      <g
        className="gp-grp"
        style={{
          transform: `translate(${(t.shoulderScale - 1) * 18}px, 0) scaleY(${t.sleeveLenScale})`,
          transformOrigin: "250px 78px",
        }}
      >
        <path
          d="M 232 78 L 264 96 L 276 168 L 242 178 L 224 110 Z"
          fill={fill}
          stroke={stroke}
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </g>

      {/* TORSO + HEM — width scales from chest, hem extends downward */}
      <g
        className="gp-grp"
        style={{
          transform: `scaleX(${t.chestScale})`,
          transformOrigin: "160px 80px",
        }}
      >
        <path
          d={`
            M 96 78
            L 132 70
            Q 160 64 188 70
            L 224 78
            L 230 130
            L 226 ${260 + hemExtend}
            Q 226 ${280 + hemExtend} 218 ${288 + hemExtend}
            L 102 ${288 + hemExtend}
            Q 94 ${280 + hemExtend} 94 ${260 + hemExtend}
            L 90 130
            Z
          `}
          fill={fill}
          stroke={stroke}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        {/* Side seam hints */}
        <path
          d={`M 94 132 L 96 ${258 + hemExtend}`}
          fill="none"
          stroke={stroke}
          strokeWidth="0.6"
          opacity="0.35"
        />
        <path
          d={`M 226 132 L 224 ${258 + hemExtend}`}
          fill="none"
          stroke={stroke}
          strokeWidth="0.6"
          opacity="0.35"
        />
      </g>

      {/* COLLAR — width scales subtly with neck measurement */}
      <g
        className="gp-grp"
        style={{
          transform: `scaleX(${t.neckScale})`,
          transformOrigin: "160px 70px",
        }}
      >
        {/* Collar opening */}
        <path
          d="M 132 70 Q 160 92 188 70"
          fill="hsl(220 15% 95%)"
          stroke={stroke}
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        {/* Neckband ribbing */}
        <path
          d="M 130 68 Q 160 88 190 68"
          fill="none"
          stroke={stroke}
          strokeWidth="0.8"
          opacity="0.55"
        />
      </g>

      {/* Shoulder seam hints */}
      <path
        d="M 96 78 Q 110 76 132 70"
        fill="none"
        stroke={stroke}
        strokeWidth="0.6"
        opacity="0.4"
      />
      <path
        d="M 224 78 Q 210 76 188 70"
        fill="none"
        stroke={stroke}
        strokeWidth="0.6"
        opacity="0.4"
      />

      {/* Hem stitch line */}
      <path
        d={`M 104 ${282 + hemExtend} L 216 ${282 + hemExtend}`}
        fill="none"
        stroke={stroke}
        strokeWidth="0.5"
        strokeDasharray="2 2"
        opacity="0.45"
      />
    </svg>
  );
}
