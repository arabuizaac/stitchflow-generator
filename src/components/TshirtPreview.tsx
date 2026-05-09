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

export function TshirtPreview({ fit, sleeveLengthCm, chestCm, neckCm }: TshirtPreviewProps) {
  const fitVariant = fitToVariant(fit);
  const sleeveVariant = sleeveToVariant(sleeveLengthCm);
  const neckVariant = neckToVariant(neckCm, chestCm);
  const key = `${fitVariant}-${sleeveVariant}`;
  const src = VARIANTS[fitVariant][sleeveVariant];

  // Track previous src so we can crossfade between professionally drawn
  // variants — the underlying SVG paths are NEVER stretched or morphed.
  const [current, setCurrent] = useState(src);
  const [previous, setPrevious] = useState<string | null>(null);

  useEffect(() => {
    if (src === current) return;
    setPrevious(current);
    setCurrent(src);
    const t = setTimeout(() => setPrevious(null), 260);
    return () => clearTimeout(t);
  }, [src, current]);

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
          />
        )}
        <img
          key={`curr-${current}`}
          src={current}
          alt={`${LABELS[fitVariant]} t-shirt with ${SLEEVE_LABELS[sleeveVariant].toLowerCase()}`}
          width={512}
          height={640}
          loading="lazy"
          className="absolute inset-0 w-full h-full object-contain animate-[fade-in_240ms_ease-out]"
        />
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
      </div>
    </div>
  );
}

const Chip = ({ children }: { children: React.ReactNode }) => (
  <span className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground bg-secondary/70 border border-border rounded-full px-2 py-0.5">
    {children}
  </span>
);
