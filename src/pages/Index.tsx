import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toast } from "@/hooks/use-toast";
import { Scissors, Download, Sparkles, AlertCircle, CheckCircle2, FileStack, Shirt, Ruler } from "lucide-react";
import jsPDF from "jspdf";
import {
  buildSvgString,
  generatePattern,
  clampMeasurements,
  getLayoutBounds,
  MeasurementsSchema,
  FABRICS,
  type Measurements,
  type FitType,
  type FabricType,
  type SizeType,
} from "@/lib/patternGenerator";
import { auditPattern } from "@/lib/patternAudit";
import { addTiledPatternToPdf, planTiling } from "@/lib/pdfTiling";
import {
  type UnitSystem,
  toCm,
  fromCm,
  roundForUnit,
  formatLength,
  unitSuffix,
} from "@/lib/units";

const DEFAULTS: Measurements = {
  chest: 96,
  shoulder: 44,
  sleeveLength: 60,
  shirtLength: 72,
  neck: 38,
  fit: "regular",
  fabric: "cotton",
  size: "M",
};

const SIZE_LABEL: Record<SizeType, string> = {
  S: "S",
  M: "M",
  L: "L",
  XL: "XL",
};

const FABRIC_LABEL: Record<FabricType, string> = {
  cotton: "Cotton",
  jersey: "Jersey",
  rib: "Rib",
};

const FIELDS: { key: keyof Omit<Measurements, "fit" | "fabric">; label: string; hint: string }[] = [
  { key: "chest", label: "Chest", hint: "Fullest part" },
  { key: "shoulder", label: "Shoulder Width", hint: "Seam to seam" },
  { key: "sleeveLength", label: "Sleeve Length", hint: "Min 40 cm / 15.7 in" },
  { key: "shirtLength", label: "Shirt Length", hint: "Min 60 cm / 23.6 in" },
  { key: "neck", label: "Neck", hint: "Around neck" },
];

const Index = () => {
  const [values, setValues] = useState<Measurements>(DEFAULTS);
  const [generated, setGenerated] = useState<Measurements | null>(DEFAULTS);
  const [unit, setUnit] = useState<UnitSystem>("cm");

  const pattern = useMemo(() => (generated ? generatePattern(generated) : null), [generated]);
  const svgString = useMemo(() => (pattern ? buildSvgString(pattern) : ""), [pattern]);
  const audit = useMemo(() => (pattern ? auditPattern(pattern) : null), [pattern]);
  const tilingPlan = useMemo(() => {
    if (!pattern) return null;
    const b = getLayoutBounds(pattern);
    return planTiling(b.widthCm, b.heightCm);
  }, [pattern]);

  const clamped = useMemo(() => clampMeasurements(values), [values]);
  const corrections: string[] = [];
  if (clamped.neck !== values.neck)
    corrections.push(
      `Neck adjusted to ${formatLength(clamped.neck, unit)} (must be ≤ chest/2; falls back to chest/3)`,
    );
  if (clamped.sleeveLength !== values.sleeveLength)
    corrections.push(`Sleeve raised to ${formatLength(clamped.sleeveLength, unit)}`);
  if (clamped.shirtLength !== values.shirtLength)
    corrections.push(`Shirt length raised to ${formatLength(clamped.shirtLength, unit)}`);

  /**
   * Input handler. The input field shows values in the user-selected unit.
   * We convert to cm immediately so internal state is always in cm —
   * this keeps every downstream calculation unit-agnostic.
   */
  const handleChange = (key: keyof Omit<Measurements, "fit">, raw: string) => {
    const num = Number(raw);
    if (isNaN(num)) {
      setValues((v) => ({ ...v, [key]: 0 }));
      return;
    }
    setValues((v) => ({ ...v, [key]: toCm(num, unit) }));
  };

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = MeasurementsSchema.safeParse(values);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      toast({
        title: "Invalid measurement",
        description: first?.message ?? "Please check your inputs.",
        variant: "destructive",
      });
      return;
    }
    const corrected = clampMeasurements(parsed.data as Measurements);
    setGenerated(corrected);
    setValues(corrected);
    toast({ title: "Pattern generated", description: "T-shirt pattern ready to preview." });
  };

  const handleDownloadPdf = async () => {
    if (!pattern) return;
    const bounds = getLayoutBounds(pattern);
    const totalCmWidth = bounds.widthCm + 4;
    const maxCmHeight = bounds.heightCm + 4;

    const orientation = totalCmWidth > maxCmHeight ? "landscape" : "portrait";
    const pdf = new jsPDF({ orientation, unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    pdf.setFontSize(16);
    pdf.text("StitchFlow – T-Shirt Pattern (Test version)", 10, 12);
    pdf.setFontSize(9);
    pdf.text(
      `Fit ${generated!.fit} · Chest ${formatLength(generated!.chest, unit)} · Shoulder ${formatLength(generated!.shoulder, unit)} · Sleeve ${formatLength(generated!.sleeveLength, unit)} · Length ${formatLength(generated!.shirtLength, unit)} · Neck ${formatLength(generated!.neck, unit)}`,
      10,
      18,
    );
    pdf.setFontSize(8);
    pdf.setTextColor(40, 40, 40);
    pdf.text(
      'Print at 100% scale. Disable "Fit to page" / "Shrink to fit". Verify the 5 cm square below measures 50 mm before cutting.',
      10,
      23,
    );

    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error("Failed to load SVG"));
        img.src = url;
      });

      const canvas = document.createElement("canvas");
      const scale = 3;
      const aspect = totalCmWidth / maxCmHeight;
      const drawW = pageW - 20;
      // Reserve more vertical space for the instructions header + footer.
      const drawH = Math.min(pageH - 70, drawW / aspect);
      const finalW = drawH * aspect <= drawW ? drawH * aspect : drawW;
      const finalH = finalW / aspect;

      canvas.width = finalW * scale * 4;
      canvas.height = finalH * scale * 4;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/png");

      pdf.addImage(dataUrl, "PNG", 10, 28, finalW, finalH);

      // ---- 5 cm × 5 cm calibration square (bottom-right of page) ----
      const sqSize = 50; // mm
      const sqX = pageW - 10 - sqSize;
      const sqY = pageH - 28 - sqSize;
      pdf.setLineWidth(0.4);
      pdf.setDrawColor(0, 0, 0);
      pdf.rect(sqX, sqY, sqSize, sqSize);
      pdf.setLineWidth(0.2);
      for (let i = 1; i < 5; i++) {
        const t = i * 10;
        pdf.line(sqX + t, sqY, sqX + t, sqY + 2);
        pdf.line(sqX, sqY + t, sqX + 2, sqY + t);
      }
      pdf.setDrawColor(150, 150, 150);
      pdf.line(sqX + sqSize / 2 - 3, sqY + sqSize / 2, sqX + sqSize / 2 + 3, sqY + sqSize / 2);
      pdf.line(sqX + sqSize / 2, sqY + sqSize / 2 - 3, sqX + sqSize / 2, sqY + sqSize / 2 + 3);
      pdf.setFontSize(7);
      pdf.setTextColor(20, 20, 20);
      pdf.text("5 cm test square", sqX, sqY - 1);
      pdf.setFontSize(6);
      pdf.setTextColor(110, 110, 110);
      pdf.text("Must measure 50 mm × 50 mm", sqX, sqY + sqSize + 3);

      // ---- Footer: legend + step-by-step ----
      pdf.setFontSize(8);
      pdf.setTextColor(20, 20, 20);
      pdf.text(
        "Solid = cut line  ·  Dashed grey = seam allowance  ·  Dashed blue = cut on fold  ·  ↕ = grainline",
        10,
        pageH - 18,
      );
      pdf.setFontSize(7);
      pdf.setTextColor(80, 80, 80);
      pdf.text(
        "1) Print 100%  2) Verify 5 cm square  3) Cut on solid lines  4) Place grainline parallel to selvedge  5) Pin & cut fabric",
        10,
        pageH - 13,
      );
      pdf.setFontSize(6);
      pdf.setTextColor(120, 120, 120);
      pdf.text(
        "Test version — minor adjustments may be needed depending on fabric and sewing method. Always sew a sample first.",
        10,
        pageH - 6,
      );
      pdf.save("stitchflow-tshirt-pattern.pdf");
      toast({ title: "Downloaded", description: "Your T-shirt pattern PDF is ready." });
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const handleDownloadTiledPdf = async () => {
    if (!pattern) return;
    const bounds = getLayoutBounds(pattern);
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    try {
      const plan = await addTiledPatternToPdf(pdf, svgString, bounds.widthCm, bounds.heightCm, {
        title: "StitchFlow – T-Shirt Pattern",
        subtitle: `Fit ${generated!.fit} · Chest ${formatLength(generated!.chest, unit)}`,
      });
      pdf.save("stitchflow-tshirt-pattern-tiled.pdf");
      toast({
        title: "Tiled PDF downloaded",
        description: `${plan.pageCount} A4 page${plan.pageCount === 1 ? "" : "s"} (${plan.cols}×${plan.rows}). Print at 100% scale and align using crop marks.`,
      });
    } catch (e) {
      toast({
        title: "Tiling failed",
        description: e instanceof Error ? e.message : "Could not generate tiled PDF.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/60 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className="h-9 w-9 rounded-lg flex items-center justify-center"
              style={{ background: "var(--gradient-hero)" }}
            >
              <Scissors className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight">StitchFlow</h1>
              <p className="text-xs text-muted-foreground -mt-0.5">T-Shirt Pattern Generator</p>
            </div>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary px-2.5 py-1 rounded-full">
            <Sparkles className="h-3 w-3" /> Pro
          </span>
        </div>
      </header>

      {/* Hero */}
      <section className="container py-10 md:py-14 text-center">
        <h2 className="text-3xl md:text-5xl font-bold tracking-tight max-w-2xl mx-auto leading-tight">
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: "var(--gradient-hero)" }}
          >
            Print-ready T-shirt patterns
          </span>{" "}
          for testing.
        </h2>
        <p className="mt-4 text-muted-foreground max-w-lg mx-auto text-sm md:text-base">
          Enter your measurements, choose a fit, and generate a print-ready pattern with seam allowances.
        </p>
        <div className="mt-5 max-w-xl mx-auto rounded-md border border-border bg-secondary/60 px-3 py-2 text-[12px] text-muted-foreground flex items-start gap-2 text-left">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            <strong className="text-foreground">Test version.</strong> Minor adjustments may be
            needed depending on your fabric, stretch and sewing method. Always sew a small
            sample first.
          </span>
        </div>
      </section>

      {/* Form + Preview */}
      <main className="container pb-20 grid gap-6 lg:grid-cols-[380px_1fr]">
        <Card className="p-6 h-fit shadow-[var(--shadow-card)]">
          <form onSubmit={handleGenerate} className="space-y-5">
            <div>
              <h3 className="font-semibold text-lg">Measurements</h3>
              <p className="text-xs text-muted-foreground">
                All values in {unit === "cm" ? "centimeters" : "inches"} — internal math always uses cm
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Ruler className="h-3.5 w-3.5" /> Units
              </Label>
              <ToggleGroup
                type="single"
                value={unit}
                onValueChange={(v) => v && setUnit(v as UnitSystem)}
                className="grid grid-cols-2 gap-2"
                data-testid="toggle-unit"
              >
                {(["cm", "inch"] as UnitSystem[]).map((u) => (
                  <ToggleGroupItem
                    key={u}
                    value={u}
                    data-testid={`toggle-unit-${u}`}
                    className="border border-border data-[state=on]:bg-primary data-[state=on]:text-primary-foreground text-xs h-9"
                  >
                    {u === "cm" ? "Centimeters (cm)" : "Inches (in)"}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <p className="text-[11px] text-muted-foreground">
                1 in = 2.54 cm. Switching units re-displays existing values without changing the pattern.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Size Grade</Label>
              <ToggleGroup
                type="single"
                value={values.size ?? "M"}
                onValueChange={(v) => v && setValues((s) => ({ ...s, size: v as SizeType }))}
                className="grid grid-cols-4 gap-2"
                data-testid="toggle-size"
              >
                {(["S", "M", "L", "XL"] as SizeType[]).map((s) => (
                  <ToggleGroupItem
                    key={s}
                    value={s}
                    data-testid={`toggle-size-${s}`}
                    className="border border-border data-[state=on]:bg-primary data-[state=on]:text-primary-foreground text-xs h-9"
                  >
                    {SIZE_LABEL[s]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <p className="text-[11px] text-muted-foreground">
                Grade adds to base measurements: chest ±10/20 · shoulder ±3/6 · length ±4/8 cm
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Fit Type</Label>
              <ToggleGroup
                type="single"
                value={values.fit}
                onValueChange={(v) => v && setValues((s) => ({ ...s, fit: v as FitType }))}
                className="grid grid-cols-3 gap-2"
              >
                {(["tight", "regular", "relaxed"] as FitType[]).map((f) => (
                  <ToggleGroupItem
                    key={f}
                    value={f}
                    data-testid={`toggle-fit-${f}`}
                    className="border border-border data-[state=on]:bg-primary data-[state=on]:text-primary-foreground capitalize text-xs h-9"
                  >
                    {f}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <p className="text-[11px] text-muted-foreground">
                Ease: tight +4 · regular +10 · relaxed +18 cm — also drives length &amp; sleeve width
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Shirt className="h-3.5 w-3.5" /> Fabric
              </Label>
              <ToggleGroup
                type="single"
                value={values.fabric}
                onValueChange={(v) => v && setValues((s) => ({ ...s, fabric: v as FabricType }))}
                className="grid grid-cols-3 gap-2"
                data-testid="toggle-fabric"
              >
                {(Object.keys(FABRICS) as FabricType[]).map((f) => (
                  <ToggleGroupItem
                    key={f}
                    value={f}
                    data-testid={`toggle-fabric-${f}`}
                    className="border border-border data-[state=on]:bg-primary data-[state=on]:text-primary-foreground capitalize text-xs h-9"
                  >
                    {FABRIC_LABEL[f]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <p className="text-[11px] text-muted-foreground">
                Stretch: cotton 5% · jersey 20% · rib 40% — affects ease, armhole &amp; neckband
              </p>
            </div>

            <div className="space-y-4">
              {FIELDS.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <div className="flex items-baseline justify-between">
                    <Label htmlFor={f.key} className="text-sm font-medium">
                      {f.label}
                    </Label>
                    <span className="text-[11px] text-muted-foreground">{f.hint}</span>
                  </div>
                  <div className="relative">
                    <Input
                      id={f.key}
                      type="number"
                      inputMode="decimal"
                      min={unit === "cm" ? 1 : 0.5}
                      step={unit === "cm" ? "0.1" : "0.05"}
                      value={
                        values[f.key]
                          ? roundForUnit(fromCm(values[f.key] as number, unit), unit)
                          : ""
                      }
                      onChange={(e) => handleChange(f.key, e.target.value)}
                      className="pr-12"
                      required
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                      {unitSuffix(unit)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {corrections.length > 0 && (
              <div className="rounded-md bg-secondary/70 border border-border p-3 text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <AlertCircle className="h-3.5 w-3.5" /> Auto-corrections on generate
                </div>
                {corrections.map((c) => (
                  <div key={c} className="text-muted-foreground">
                    • {c}
                  </div>
                ))}
              </div>
            )}

            <Button type="submit" className="w-full" size="lg">
              <Sparkles className="h-4 w-4" />
              Generate Pattern
            </Button>
          </form>
        </Card>

        <Card className="p-4 md:p-6 shadow-[var(--shadow-card)] flex flex-col">
          <div className="flex items-center justify-between mb-4 gap-3">
            <div>
              <h3 className="font-semibold text-lg">Preview</h3>
              <p className="text-xs text-muted-foreground">
                {pattern
                  ? `${FABRIC_LABEL[pattern.derived.fabric]} (${(pattern.derived.fabricProfile.stretch * 100).toFixed(0)}% stretch) · Half chest ${formatLength(pattern.derived.halfChest, unit)} · Armhole ${formatLength(pattern.derived.armholeDepth, unit)} · Neckline ${formatLength(pattern.derived.necklineLength, unit)} → Band ${formatLength(pattern.derived.neckbandLength, unit)}`
                  : "Generate a pattern to preview"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleDownloadTiledPdf}
                variant="outline"
                disabled={!pattern}
                size="sm"
                title={
                  tilingPlan
                    ? `${tilingPlan.pageCount} A4 page${tilingPlan.pageCount === 1 ? "" : "s"} (${tilingPlan.cols}×${tilingPlan.rows})`
                    : undefined
                }
              >
                <FileStack className="h-4 w-4" />
                <span className="hidden sm:inline">
                  Tiled PDF{tilingPlan ? ` · ${tilingPlan.pageCount}p` : ""}
                </span>
              </Button>
              <Button onClick={handleDownloadPdf} variant="outline" disabled={!pattern} size="sm">
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Single page</span>
              </Button>
            </div>
          </div>

          <div className="flex-1 rounded-lg border border-border bg-white overflow-auto p-3 min-h-[400px] flex items-center justify-center">
            {svgString ? (
              <div className="w-full" dangerouslySetInnerHTML={{ __html: svgString }} />
            ) : (
              <p className="text-sm text-muted-foreground">No pattern yet</p>
            )}
          </div>

          {pattern && (
            <>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <Stat label="Front (half)" value={formatLength(pattern.derived.frontWidth, unit)} />
                <Stat label="Back (half)" value={formatLength(pattern.derived.backWidth, unit)} />
                <Stat label="Armhole depth" value={formatLength(pattern.derived.armholeDepth, unit)} />
                <Stat label="Sleeve width" value={formatLength(pattern.derived.sleeveWidth, unit)} />
              </div>
              {/* Line legend */}
              <div className="mt-4 rounded-md border border-border bg-card p-3">
                <div className="text-xs font-semibold mb-2">Line legend</div>
                <div className="grid sm:grid-cols-2 gap-y-1.5 gap-x-4 text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-7 h-0 border-t-2 border-foreground" />
                    <span><strong className="text-foreground">Solid line</strong> = Cut line</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-7 h-0 border-t-2 border-dashed border-muted-foreground/70" />
                    <span><strong className="text-foreground">Dashed line</strong> = Seam allowance</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-7 h-0 border-t-2 border-dashed border-primary" />
                    <span><strong className="text-primary">Dashed blue</strong> = Cut on fold</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-7 text-center text-foreground font-bold">↕</span>
                    <span><strong className="text-foreground">Arrow</strong> = Grainline (parallel to fabric)</span>
                  </div>
                </div>
              </div>

              {/* Print & cut instructions */}
              <div className="mt-3 rounded-md border border-border bg-secondary/40 p-3">
                <div className="text-xs font-semibold mb-2">How to print &amp; cut</div>
                <ol className="text-[11px] text-muted-foreground space-y-1 list-decimal list-inside marker:text-foreground">
                  <li><strong className="text-foreground">Print at 100% scale</strong> — disable "Fit to page" / "Shrink to fit" in the print dialog.</li>
                  <li>Measure the <strong className="text-foreground">5 cm test square</strong> with a ruler. It must be exactly 50 mm. If not, reprint.</li>
                  <li>Cut along the <strong className="text-foreground">solid outer lines</strong> (these include seam allowance).</li>
                  <li>For the tiled PDF, align pages using the <strong className="text-foreground">+ marks</strong> on each edge, then tape them together.</li>
                  <li>Place the pattern on fabric with the <strong className="text-foreground">grainline arrow</strong> parallel to the selvedge. Place fold edges on a fabric fold.</li>
                  <li>Pin the pattern down and cut around it. Transfer notch marks before unpinning.</li>
                </ol>
              </div>

              {audit && (
                <div className="mt-4 rounded-md border border-border bg-secondary/40 p-3 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    {audit.pass ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                        Tailor audit · all checks passed
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-3.5 w-3.5" />
                        Tailor audit · review warnings
                      </>
                    )}
                  </div>
                  {audit.findings.map((f) => (
                    <div
                      key={f.rule}
                      className={
                        "text-[11px] flex gap-1.5 " +
                        (f.severity === "ok"
                          ? "text-muted-foreground"
                          : f.severity === "warn"
                            ? "text-foreground"
                            : "text-destructive")
                      }
                    >
                      <span>
                        {f.severity === "ok" ? "✓" : f.severity === "warn" ? "!" : "✗"}
                      </span>
                      <span className="flex-1">
                        {f.message}
                        {f.detail && (
                          <span className="text-muted-foreground"> — {f.detail}</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Card>
      </main>
    </div>
  );
};

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-md bg-secondary/60 px-3 py-2">
    <div className="text-muted-foreground">{label}</div>
    <div className="font-semibold text-foreground mt-0.5">{value}</div>
  </div>
);

export default Index;
