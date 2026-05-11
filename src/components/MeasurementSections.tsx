import { Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { type UnitSystem, fromCm, roundForUnit, toCm, unitSuffix } from "@/lib/units";

/**
 * Extended tailoring measurements.
 * Only the five primary keys (chest, shoulder, sleeveLength, shirtLength, neck)
 * drive pattern geometry today. The rest are collected, validated and stored
 * for upcoming drafting logic — they intentionally do not change the pattern
 * engine yet.
 */
export type ExtraKey =
  | "waist"
  | "armhole"
  | "bicep"
  | "wrist"
  | "backWidth"
  | "frontLength"
  | "acrossChest"
  | "shoulderToBust"
  | "bustSpan";

export type Extras = Partial<Record<ExtraKey, number>>; // values in cm

export interface FieldDef {
  key: string;
  label: string;
  description: string;
  /** Realistic [min,max] in cm — used for soft validation. */
  range: [number, number];
  primary?: boolean;
}

interface SectionDef {
  id: string;
  title: string;
  subtitle?: string;
  fields: FieldDef[];
}

export const SECTIONS: SectionDef[] = [
  {
    id: "basic",
    title: "Basic Measurements",
    subtitle: "Primary measurements used most frequently",
    fields: [
      {
        key: "chest",
        label: "Bust / Chest",
        description: "Measure around the fullest part of the chest.",
        range: [60, 160],
        primary: true,
      },
      {
        key: "waist",
        label: "Waist",
        description: "Measure around the natural waistline.",
        range: [50, 160],
      },
      {
        key: "shoulder",
        label: "Shoulder Width",
        description: "From shoulder point to shoulder point across the back.",
        range: [30, 60],
        primary: true,
      },
      {
        key: "neck",
        label: "Neck Circumference",
        description: "Measure around the base of the neck.",
        range: [28, 55],
        primary: true,
      },
      {
        key: "sleeveLength",
        label: "Sleeve Length",
        description: "From shoulder point to wrist or desired sleeve finish.",
        range: [10, 90],
        primary: true,
      },
      {
        key: "shirtLength",
        label: "Top Length",
        description: "From shoulder to desired hem length.",
        range: [40, 120],
        primary: true,
      },
    ],
  },
  {
    id: "fit",
    title: "Fit & Structure",
    subtitle: "Refines armhole, sleeve and back fit",
    fields: [
      {
        key: "armhole",
        label: "Armhole / Armscye",
        description: "Measure around the arm socket.",
        range: [30, 70],
      },
      {
        key: "bicep",
        label: "Bicep Circumference",
        description: "Around the fullest part of the upper arm.",
        range: [20, 60],
      },
      {
        key: "wrist",
        label: "Wrist Circumference",
        description: "For fitted or cuffed sleeves.",
        range: [12, 25],
      },
      {
        key: "backWidth",
        label: "Back Width",
        description: "Across the back from armhole to armhole.",
        range: [25, 55],
      },
      {
        key: "frontLength",
        label: "Front Length",
        description: "From shoulder to waist or hem across the front.",
        range: [30, 80],
      },
      {
        key: "acrossChest",
        label: "Across Chest",
        description: "Front chest width used for structured garments.",
        range: [25, 55],
      },
    ],
  },
  {
    id: "advanced",
    title: "Advanced Womenswear Fit",
    subtitle: "Advanced (Optional) — for structured bust-fit drafting",
    fields: [
      {
        key: "shoulderToBust",
        label: "Shoulder to Bust Point",
        description: "From shoulder seam area to bust apex.",
        range: [15, 40],
      },
      {
        key: "bustSpan",
        label: "Bust Span",
        description: "Distance between bust apex points.",
        range: [10, 30],
      },
    ],
  },
];

export interface ValidationIssue {
  key: string;
  label: string;
  message: string;
}

/**
 * Cross-field tailoring sanity rules. Only fires when a value is actually set.
 * Primary geometry inputs are validated separately by Zod in patternGenerator.
 */
export function validateExtras(
  extras: Extras,
  primary: { chest: number; shoulder: number },
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const all = SECTIONS.flatMap((s) => s.fields);
  const labelOf = (k: string) => all.find((f) => f.key === k)?.label ?? k;

  for (const f of all) {
    if (f.primary) continue;
    const v = extras[f.key as ExtraKey];
    if (v == null) continue;
    if (v <= 0) {
      issues.push({ key: f.key, label: f.label, message: "must be greater than zero" });
      continue;
    }
    const [min, max] = f.range;
    if (v < min || v > max) {
      issues.push({
        key: f.key,
        label: f.label,
        message: `should be between ${min}–${max} cm`,
      });
    }
  }

  if (extras.wrist != null && extras.wrist >= primary.chest) {
    issues.push({
      key: "wrist",
      label: "Wrist Circumference",
      message: "cannot exceed chest circumference",
    });
  }
  if (extras.bicep != null && extras.bicep >= primary.chest) {
    issues.push({
      key: "bicep",
      label: "Bicep Circumference",
      message: "cannot exceed chest circumference",
    });
  }
  if (extras.backWidth != null && extras.backWidth > primary.shoulder + 10) {
    issues.push({
      key: "backWidth",
      label: "Back Width",
      message: "should not exceed shoulder width by more than 10 cm",
    });
  }
  if (extras.bustSpan != null && extras.bustSpan > primary.chest / 2) {
    issues.push({
      key: "bustSpan",
      label: "Bust Span",
      message: "must be less than half of chest",
    });
  }
  return issues;
}

interface Props {
  unit: UnitSystem;
  primary: Record<string, number>;
  onPrimaryChange: (key: string, cm: number) => void;
  extras: Extras;
  onExtrasChange: (key: ExtraKey, cm: number | undefined) => void;
  issues: ValidationIssue[];
}

export function MeasurementSections({
  unit,
  primary,
  onPrimaryChange,
  extras,
  onExtrasChange,
  issues,
}: Props) {
  const issueMap = new Map(issues.map((i) => [i.key, i]));

  const handleInput = (field: FieldDef, raw: string) => {
    if (raw === "") {
      if (field.primary) onPrimaryChange(field.key, 0);
      else onExtrasChange(field.key as ExtraKey, undefined);
      return;
    }
    const num = Number(raw);
    if (Number.isNaN(num) || num < 0) return;
    const cm = toCm(num, unit);
    if (field.primary) onPrimaryChange(field.key, cm);
    else onExtrasChange(field.key as ExtraKey, cm);
  };

  const valueFor = (field: FieldDef): string => {
    const cm = field.primary
      ? primary[field.key]
      : extras[field.key as ExtraKey];
    if (cm == null || cm === 0) return "";
    return String(roundForUnit(fromCm(cm, unit), unit));
  };

  return (
    <TooltipProvider delayDuration={150}>
      <Accordion
        type="multiple"
        defaultValue={["basic"]}
        className="w-full divide-y divide-border border border-border rounded-md"
      >
        {SECTIONS.map((section) => (
          <AccordionItem
            key={section.id}
            value={section.id}
            className="border-b-0 px-3"
          >
            <AccordionTrigger className="py-3 hover:no-underline">
              <div className="text-left">
                <div className="text-sm font-semibold text-foreground">
                  {section.title}
                </div>
                {section.subtitle && (
                  <div className="text-[11px] text-muted-foreground font-normal mt-0.5">
                    {section.subtitle}
                  </div>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-4 pt-1">
              <div className="space-y-3">
                {section.fields.map((field) => {
                  const issue = issueMap.get(field.key);
                  const id = `m-${field.key}`;
                  return (
                    <div key={field.key} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <Label
                          htmlFor={id}
                          className="text-xs font-medium flex items-center gap-1.5"
                        >
                          {field.label}
                          {field.primary && (
                            <span className="text-[9px] uppercase tracking-wide text-primary font-semibold">
                              Required
                            </span>
                          )}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                aria-label={`More info about ${field.label}`}
                                className="text-muted-foreground hover:text-foreground transition-colors"
                              >
                                <Info className="h-3 w-3" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[220px] text-xs">
                              {field.description}
                            </TooltipContent>
                          </Tooltip>
                        </Label>
                      </div>
                      <div className="relative">
                        <Input
                          id={id}
                          data-testid={`input-${field.key}`}
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step={unit === "cm" ? "0.1" : "0.05"}
                          value={valueFor(field)}
                          onChange={(e) => handleInput(field, e.target.value)}
                          placeholder={field.primary ? "" : "Optional"}
                          aria-invalid={!!issue}
                          className={
                            "pr-12 h-9 text-sm " +
                            (issue ? "border-destructive focus-visible:ring-destructive" : "")
                          }
                          required={field.primary}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none">
                          {unitSuffix(unit)}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        {field.description}
                      </p>
                      {issue && (
                        <p className="text-[11px] text-destructive">
                          {issue.label} {issue.message}.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </TooltipProvider>
  );
}
