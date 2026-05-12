import { useCallback, useRef, useState } from "react";
import { Upload, Sparkles, Loader2, RefreshCw, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { fileToCompressedBase64 } from "@/lib/imageUtils";
import { toast } from "@/hooks/use-toast";

export type DetectedAttributes = {
  garmentType: "tshirt" | "hoodie" | "sweatshirt" | "blouse" | "tank" | "longsleeve";
  sleeveType: "sleeveless" | "cap" | "short" | "elbow" | "long";
  fitType: "slim" | "regular" | "oversized";
  necklineType: "crew" | "v" | "wide" | "mock";
  garmentLength: "cropped" | "regular" | "longline";
  confidence?: number;
};

const GARMENT_OPTS: DetectedAttributes["garmentType"][] = ["tshirt", "hoodie", "sweatshirt", "blouse", "tank", "longsleeve"];
const SLEEVE_OPTS: DetectedAttributes["sleeveType"][] = ["sleeveless", "cap", "short", "elbow", "long"];
const FIT_OPTS: DetectedAttributes["fitType"][] = ["slim", "regular", "oversized"];
const NECK_OPTS: DetectedAttributes["necklineType"][] = ["crew", "v", "wide", "mock"];
const LEN_OPTS: DetectedAttributes["garmentLength"][] = ["cropped", "regular", "longline"];

const LABELS: Record<string, string> = {
  tshirt: "T-shirt", hoodie: "Hoodie", sweatshirt: "Sweatshirt", blouse: "Blouse", tank: "Tank top", longsleeve: "Long sleeve",
  sleeveless: "Sleeveless", cap: "Cap sleeve", short: "Short sleeve", elbow: "Elbow", long: "Long sleeve",
  slim: "Slim fit", regular: "Regular", oversized: "Oversized",
  crew: "Crew neck", v: "V-neck", wide: "Wide neck", mock: "Mock neck",
  cropped: "Cropped", longline: "Longline",
};
const lab = (k: string) => LABELS[k] ?? k;

export type AppliedAttributes = Partial<DetectedAttributes>;

export function SketchAnalyzer({ onApply }: { onApply: (attrs: AppliedAttributes) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DetectedAttributes | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [lastFile, setLastFile] = useState<File | null>(null);

  const reset = () => {
    setPreviewUrl(null);
    setResult(null);
    setError(null);
    setLastFile(null);
  };

  const analyze = useCallback(async (file: File) => {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const { base64, mimeType, previewUrl } = await fileToCompressedBase64(file);
      setPreviewUrl(previewUrl);
      const { data, error: fnErr } = await supabase.functions.invoke("analyze-sketch", {
        body: { imageBase64: base64, mimeType },
      });
      if (fnErr) throw new Error(fnErr.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      const r = (data as any)?.result as DetectedAttributes;
      if (!r?.garmentType) throw new Error("Unexpected AI response");
      setResult(r);
      toast({ title: "Sketch analyzed", description: "Review and apply the detected settings." });
    } catch (e) {
      console.error(e);
      setError("AI analysis temporarily unavailable. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleFile = (file: File) => {
    if (!/^image\/(png|jpeg|jpg|webp)$/.test(file.type)) {
      setError("Unsupported format. Use JPG, PNG, or WEBP.");
      return;
    }
    setLastFile(file);
    analyze(file);
  };

  return (
    <Card className="p-5 space-y-4 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> AI Sketch Interpretation
          </h3>
          <p className="text-xs text-muted-foreground">
            Upload a sketch or photo — AI suggests garment settings. You stay in control.
          </p>
        </div>
        {previewUrl && (
          <Button variant="ghost" size="icon" onClick={reset} aria-label="Clear">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {!previewUrl && (
        <label
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
          className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 cursor-pointer transition-colors ${
            dragOver ? "border-primary bg-primary/5" : "border-border bg-secondary/30 hover:bg-secondary/50"
          }`}
        >
          <Upload className="h-6 w-6 text-muted-foreground" />
          <div className="text-sm font-medium">Drop a sketch or click to upload</div>
          <div className="text-[11px] text-muted-foreground">JPG · PNG · WEBP — sketches, photos, illustrations</div>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </label>
      )}

      {previewUrl && (
        <div className="grid grid-cols-[120px_1fr] gap-4">
          <div className="rounded-md overflow-hidden border border-border bg-secondary/30">
            <img src={previewUrl} alt="Garment preview" className="w-full h-full object-contain" />
          </div>
          <div className="min-w-0">
            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Analyzing garment…
              </div>
            )}
            {error && !loading && (
              <div className="space-y-2">
                <p className="text-sm text-destructive">{error}</p>
                <Button size="sm" variant="outline" onClick={() => lastFile && analyze(lastFile)}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1" /> Retry
                </Button>
              </div>
            )}
            {result && !loading && (
              <DetectedPanel
                value={result}
                onChange={setResult}
                onApply={() => {
                  onApply(result);
                  toast({ title: "Applied", description: "Settings updated from AI suggestions." });
                }}
              />
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function DetectedPanel({
  value,
  onChange,
  onApply,
}: {
  value: DetectedAttributes;
  onChange: (v: DetectedAttributes) => void;
  onApply: () => void;
}) {
  const set = <K extends keyof DetectedAttributes>(k: K, v: DetectedAttributes[K]) =>
    onChange({ ...value, [k]: v });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Detected features</span>
        {typeof value.confidence === "number" && (
          <span className="text-[10px] uppercase tracking-wide bg-secondary text-secondary-foreground rounded px-1.5 py-0.5">
            {Math.round(value.confidence * 100)}% conf.
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Garment">
          <SmallSelect value={value.garmentType} options={GARMENT_OPTS} onChange={(v) => set("garmentType", v as any)} />
        </Field>
        <Field label="Sleeve">
          <SmallSelect value={value.sleeveType} options={SLEEVE_OPTS} onChange={(v) => set("sleeveType", v as any)} />
        </Field>
        <Field label="Fit">
          <SmallSelect value={value.fitType} options={FIT_OPTS} onChange={(v) => set("fitType", v as any)} />
        </Field>
        <Field label="Neckline">
          <SmallSelect value={value.necklineType} options={NECK_OPTS} onChange={(v) => set("necklineType", v as any)} />
        </Field>
        <Field label="Length">
          <SmallSelect value={value.garmentLength} options={LEN_OPTS} onChange={(v) => set("garmentLength", v as any)} />
        </Field>
      </div>
      <Button size="sm" onClick={onApply} className="w-full">
        <Check className="h-3.5 w-3.5 mr-1" /> Apply to settings
      </Button>
      <p className="text-[10px] text-muted-foreground leading-relaxed">
        AI assists garment configuration only. The structured drafting engine generates the actual sewing pattern.
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function SmallSelect({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o} className="text-xs">{lab(o)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
