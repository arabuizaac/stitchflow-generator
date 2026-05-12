// Edge function: analyze a garment sketch / photo with Lovable AI Gateway (Gemini)
// Returns strict JSON describing detected garment attributes.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are a fashion technical designer assistant.
You will be shown a single garment image (sketch, illustration, or photo).
Identify ONLY the garment shown. Return STRICT JSON, no prose, no markdown, no code fences.

Schema:
{
  "garmentType": "tshirt" | "hoodie" | "sweatshirt" | "blouse" | "tank" | "longsleeve",
  "sleeveType": "sleeveless" | "cap" | "short" | "elbow" | "long",
  "fitType": "slim" | "regular" | "oversized",
  "necklineType": "crew" | "v" | "wide" | "mock",
  "garmentLength": "cropped" | "regular" | "longline",
  "confidence": number  // 0..1
}

If unsure on a field, pick the closest match. Never invent measurements.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { imageBase64, mimeType } = await req.json();
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return json({ error: "imageBase64 required" }, 400);
    }
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "AI gateway not configured" }, 500);

    const dataUrl = `data:${mimeType || "image/png"};base64,${imageBase64}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Analyze this garment image and return the JSON only." },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (res.status === 429) return json({ error: "Rate limited. Please try again shortly." }, 429);
    if (res.status === 402) return json({ error: "AI credits exhausted." }, 402);
    if (!res.ok) {
      const t = await res.text();
      console.error("Gateway error", res.status, t);
      return json({ error: "AI analysis temporarily unavailable. Please try again." }, 502);
    }

    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content ?? "{}";
    let parsed;
    try {
      parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (e) {
      console.error("Parse error", raw);
      return json({ error: "AI analysis temporarily unavailable. Please try again." }, 502);
    }

    return json({ result: parsed }, 200);
  } catch (e) {
    console.error("analyze-sketch error", e);
    return json({ error: "AI analysis temporarily unavailable. Please try again." }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
