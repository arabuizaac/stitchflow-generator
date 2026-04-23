import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Scissors, Download, Sparkles } from "lucide-react";
import jsPDF from "jspdf";
import { buildSvgString, generatePattern, type Measurements } from "@/lib/patternGenerator";

const DEFAULTS: Measurements = {
  chest: 96,
  shoulder: 44,
  sleeveLength: 60,
  shirtLength: 72,
  neck: 38,
};

const FIELDS: { key: keyof Measurements; label: string; hint: string }[] = [
  { key: "chest", label: "Chest", hint: "Around fullest part" },
  { key: "shoulder", label: "Shoulder Width", hint: "Seam to seam" },
  { key: "sleeveLength", label: "Sleeve Length", hint: "Shoulder to cuff" },
  { key: "shirtLength", label: "Shirt Length", hint: "Shoulder to hem" },
  { key: "neck", label: "Neck", hint: "Around the neck" },
];

const Index = () => {
  const [values, setValues] = useState<Measurements>(DEFAULTS);
  const [generated, setGenerated] = useState<Measurements | null>(DEFAULTS);

  const pattern = useMemo(() => (generated ? generatePattern(generated) : null), [generated]);
  const svgString = useMemo(() => (pattern ? buildSvgString(pattern) : ""), [pattern]);

  const handleChange = (key: keyof Measurements, raw: string) => {
    const num = Number(raw);
    setValues((v) => ({ ...v, [key]: isNaN(num) ? 0 : num }));
  };

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    const invalid = Object.entries(values).find(([, v]) => !v || v <= 0);
    if (invalid) {
      toast({ title: "Invalid measurement", description: `Please enter a positive value for ${invalid[0]}.`, variant: "destructive" });
      return;
    }
    setGenerated({ ...values });
    toast({ title: "Pattern generated", description: "Scroll down to preview your pattern." });
  };

  const handleDownloadPdf = async () => {
    if (!pattern) return;
    const totalCmWidth = pattern.pieces.reduce((s, p) => s + p.width / 10, 0) + 5 * (pattern.pieces.length - 1) + 4;
    const maxCmHeight = Math.max(...pattern.pieces.map((p) => p.height / 10)) + 4;

    const orientation = totalCmWidth > maxCmHeight ? "landscape" : "portrait";
    const pdf = new jsPDF({ orientation, unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    pdf.setFontSize(16);
    pdf.text("StitchFlow – Shirt Pattern", 10, 12);
    pdf.setFontSize(9);
    pdf.text(
      `Chest ${generated!.chest}cm · Shoulder ${generated!.shoulder}cm · Sleeve ${generated!.sleeveLength}cm · Length ${generated!.shirtLength}cm · Neck ${generated!.neck}cm`,
      10,
      18,
    );

    // Use SVG as image via canvas
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
      const drawH = Math.min(pageH - 30, drawW / aspect);
      const finalW = drawH * aspect <= drawW ? drawH * aspect : drawW;
      const finalH = finalW / aspect;

      canvas.width = finalW * scale * 4;
      canvas.height = finalH * scale * 4;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/png");

      pdf.addImage(dataUrl, "PNG", 10, 25, finalW, finalH);
      pdf.setFontSize(8);
      pdf.text("Note: PDF preview is not to scale. Use measurements for cutting reference.", 10, pageH - 6);
      pdf.save("stitchflow-pattern.pdf");
      toast({ title: "Downloaded", description: "Your pattern PDF is ready." });
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/60 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ background: "var(--gradient-hero)" }}>
              <Scissors className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight">StitchFlow</h1>
              <p className="text-xs text-muted-foreground -mt-0.5">Shirt Pattern Generator</p>
            </div>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary px-2.5 py-1 rounded-full">
            <Sparkles className="h-3 w-3" /> MVP
          </span>
        </div>
      </header>

      {/* Hero */}
      <section className="container py-10 md:py-14 text-center">
        <h2 className="text-3xl md:text-5xl font-bold tracking-tight max-w-2xl mx-auto leading-tight">
          Sew smarter. <span className="bg-clip-text text-transparent" style={{ backgroundImage: "var(--gradient-hero)" }}>Pattern in seconds.</span>
        </h2>
        <p className="mt-4 text-muted-foreground max-w-lg mx-auto text-sm md:text-base">
          Enter your measurements and instantly generate a clean, downloadable shirt pattern.
        </p>
      </section>

      {/* Form + Preview */}
      <main className="container pb-20 grid gap-6 lg:grid-cols-[380px_1fr]">
        <Card className="p-6 h-fit shadow-[var(--shadow-card)]">
          <form onSubmit={handleGenerate} className="space-y-5">
            <div>
              <h3 className="font-semibold text-lg">Measurements</h3>
              <p className="text-xs text-muted-foreground">All values in centimeters</p>
            </div>

            <div className="space-y-4">
              {FIELDS.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <div className="flex items-baseline justify-between">
                    <Label htmlFor={f.key} className="text-sm font-medium">{f.label}</Label>
                    <span className="text-[11px] text-muted-foreground">{f.hint}</span>
                  </div>
                  <div className="relative">
                    <Input
                      id={f.key}
                      type="number"
                      inputMode="decimal"
                      min={1}
                      step="0.1"
                      value={values[f.key] || ""}
                      onChange={(e) => handleChange(f.key, e.target.value)}
                      className="pr-12"
                      required
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">cm</span>
                  </div>
                </div>
              ))}
            </div>

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
                  ? `Front ${pattern.derived.frontWidth.toFixed(1)}cm · Back ${pattern.derived.backWidth.toFixed(1)}cm · Sleeve ${pattern.derived.sleeveWidth.toFixed(1)}cm`
                  : "Generate a pattern to preview"}
              </p>
            </div>
            <Button onClick={handleDownloadPdf} variant="outline" disabled={!pattern} size="sm">
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Download PDF</span>
            </Button>
          </div>

          <div className="flex-1 rounded-lg border border-border bg-white overflow-auto p-3 min-h-[400px] flex items-center justify-center">
            {svgString ? (
              <div className="w-full" dangerouslySetInnerHTML={{ __html: svgString }} />
            ) : (
              <p className="text-sm text-muted-foreground">No pattern yet</p>
            )}
          </div>

          {pattern && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <Stat label="Front width" value={`${pattern.derived.frontWidth.toFixed(1)} cm`} />
              <Stat label="Back width" value={`${pattern.derived.backWidth.toFixed(1)} cm`} />
              <Stat label="Armhole depth" value={`${pattern.derived.armholeDepth.toFixed(1)} cm`} />
              <Stat label="Sleeve width" value={`${pattern.derived.sleeveWidth.toFixed(1)} cm`} />
            </div>
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
