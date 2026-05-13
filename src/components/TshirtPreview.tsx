import { useEffect, useState } from "react";
import slimShort from "@/assets/tshirt/slim-short.png";
import slimRegular from "@/assets/tshirt/slim-regular.png";
import slimLong from "@/assets/tshirt/slim-long.png";
import regularShort from "@/assets/tshirt/regular-short.png";
import regularRegular from "@/assets/tshirt/regular-regular.png";
import regularLong from "@/assets/tshirt/regular-long.png";
import oversizedShort from "@/assets/tshirt/oversized-short.png";
import oversizedRegular from "@/assets/tshirt/oversized-regular.png";
import oversizedLong from "@/assets/tshirt/oversized-long.png";
import type { FitType } from "@/lib/patternGenerator";

type FitVariant = "slim" | "regular" | "oversized";
type SleeveVariant = "short" | "regular" | "long";
type NeckVariant = "tight" | "regular" | "wide";

const VARIANTS: Record<FitVariant, Record<SleeveVariant, string>> = {
  slim: { short: slimShort, regular: slimRegular, long: slimLong },
  regular: { short: regularShort, regular: regularRegular, long: regularLong },
  oversized: { short: oversizedShort, regular: oversizedRegular, long: oversizedLong },
};

/** Map ease-driven fit type to a visual fit variant. */
function fitToVariant(fit: FitType): FitVariant {
  if (fit === "tight") return "slim";
  if (fit === "relaxed") return "oversized";
  return "regular";
}

/** Sleeve length (cm) → visual sleeve variant. */
function sleeveToVariant(sleeveCm: number): SleeveVariant {
  if (sleeveCm < 25) return "short";
  if (sleeveCm > 55) return "long";
  return "regular";
}

/** Neck (cm) relative to chest → collar tightness. Used as a subtle CSS hint. */
function neckToVariant(neckCm: number, chestCm: number): NeckVariant {
  const ratio = neckCm / chestCm;
  if (ratio < 0.36) return "tight";
  if (ratio > 0.44) return "wide";
  return "regular";
}

interface TshirtPreviewProps {
  fit: FitType;
  sleeveLengthCm: number;
  chestCm: number;
  neckCm: number;
  /** waist / chest ratio. 1.0 = straight side seams, <1 = tapered. */
  waistRatio?: number;
  /** cuff / sleeveWidth ratio. <0.8 = visibly tapered cuff. */
  cuffRatio?: number;
  /** Optional debug overlay with armhole / sleeve / waist guides. */
  debug?: boolean;
}

const LABELS: Record<FitVariant, string> = {
  slim: "Slim fit",
  regular: "Regular fit",
  oversized: "Oversized fit",
};
const SLEEVE_LABELS: Record<SleeveVariant, string> = {
  short: "Short sleeve",
  regular: "Regular sleeve",
  long: "Long sleeve",
};

export function TshirtPreview({
  fit,
  sleeveLengthCm,
  chestCm,
  neckCm,
  waistRatio = 1,
  cuffRatio = 0.8,
  debug = false,
}: TshirtPreviewProps) {
  const fitVariant = fitToVariant(fit);
  const sleeveVariant = sleeveToVariant(sleeveLengthCm);
  const neckVariant = neckToVariant(neckCm, chestCm);
  const src = VARIANTS[fitVariant][sleeveVariant];

  const [current, setCurrent] = useState(src);
  const [previous, setPrevious] = useState<string | null>(null);

  useEffect(() => {
    if (src === current) return;
    setPrevious(current);
    setCurrent(src);
    const t = setTimeout(() => setPrevious(null), 260);
    return () => clearTimeout(t);
  }, [src, current]);

  // Subtle waist taper: scale the lower torso horizontally without
  // distorting the upper body. We use CSS clip-path to isolate the lower
  // half and scale it along the X axis. Clamped to a believable range.
  const safeWaist = Math.max(0.78, Math.min(1.08, waistRatio));
  const waistScale = `scaleX(${safeWaist.toFixed(3)})`;
  const safeCuff = Math.max(0.55, Math.min(1.0, cuffRatio));

  // Debug guides are drawn over the illustration in a flat SVG overlay.
  const guides = debug ? (
    <svg
      viewBox="0 0 100 125"
      preserveAspectRatio="none"
      aria-hidden="true"
      className="absolute inset-0 w-full h-full pointer-events-none"
    >
      {/* Chest balance line */}
      <line x1="12" y1="42" x2="88" y2="42" stroke="hsl(var(--primary))" strokeWidth="0.4" strokeDasharray="1.5 1" opacity="0.7" />
      <text x="13" y="40.5" fill="hsl(var(--primary))" fontSize="2.4">chest</text>
      {/* Armhole depth */}
      <line x1="20" y1="30" x2="20" y2="48" stroke="hsl(var(--destructive))" strokeWidth="0.4" opacity="0.6" />
      <line x1="80" y1="30" x2="80" y2="48" stroke="hsl(var(--destructive))" strokeWidth="0.4" opacity="0.6" />
      <text x="21" y="48" fill="hsl(var(--destructive))" fontSize="2.4">armhole</text>
      {/* Waist guide (uses waistRatio to position) */}
      <line
        x1={50 - 38 * safeWaist}
        y1="68"
        x2={50 + 38 * safeWaist}
        y2="68"
        stroke="hsl(var(--primary))"
        strokeWidth="0.4"
        strokeDasharray="1.5 1"
        opacity="0.7"
      />
      <text x={50 - 38 * safeWaist + 1} y="66.5" fill="hsl(var(--primary))" fontSize="2.4">waist</text>
      {/* Sleeve cuff guide */}
      <line
        x1={6 + (1 - safeCuff) * 4}
        y1="55"
        x2={6 + (1 - safeCuff) * 4 + 8 * safeCuff}
        y2="55"
        stroke="hsl(var(--destructive))"
        strokeWidth="0.4"
        opacity="0.6"
      />
    </svg>
  ) : null;

  return (
    <div className="w-full">
      <div
        className="relative mx-auto flex items-center justify-center"
        style={{
          width: "min(320px, 90%)",
          aspectRatio: "512 / 640",
        }}
      >
        {previous && (
          <img
            key={`prev-${previous}`}
            src={previous}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-contain animate-[fade-out_240ms_ease-out_forwards]"
            style={{
              clipPath: "inset(45% 0 0 0)",
              transform: waistScale,
              transformOrigin: "50% 100%",
            }}
          />
        )}
        {/* Upper body — never deformed */}
        <img
          src={current}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-contain"
          style={{ clipPath: "inset(0 0 55% 0)" }}
        />
        {/* Lower body — receives subtle waist scale */}
        <img
          key={`curr-${current}`}
          src={current}
          alt={`${LABELS[fitVariant]} t-shirt with ${SLEEVE_LABELS[sleeveVariant].toLowerCase()}`}
          width={512}
          height={640}
          loading="lazy"
          className="absolute inset-0 w-full h-full object-contain animate-[fade-in_240ms_ease-out]"
          style={{
            clipPath: "inset(45% 0 0 0)",
            transform: waistScale,
            transformOrigin: "50% 100%",
            transition: "transform 240ms ease-out",
          }}
        />
        {guides}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
        <Chip>{LABELS[fitVariant]}</Chip>
        <Chip>{SLEEVE_LABELS[sleeveVariant]}</Chip>
        <Chip>
          {neckVariant === "tight"
            ? "Tight collar"
            : neckVariant === "wide"
              ? "Wide collar"
              : "Regular collar"}
        </Chip>
        {safeWaist < 0.97 && <Chip>Tapered waist</Chip>}
        {safeCuff < 0.78 && sleeveVariant === "long" && <Chip>Tapered cuff</Chip>}
      </div>
    </div>
  );
}

const Chip = ({ children }: { children: React.ReactNode }) => (
  <span className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground bg-secondary/70 border border-border rounded-full px-2 py-0.5">
    {children}
  </span>
);
