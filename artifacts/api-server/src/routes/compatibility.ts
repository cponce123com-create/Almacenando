import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { logger } from "../lib/logger.js";

const router = Router();

// ── Gemini REST helper ────────────────────────────────────────────────────────
// Usa la API gratuita de Gemini. Obtené tu clave en: https://aistudio.google.com/apikey
// Luego agregá GEMINI_API_KEY en las variables de entorno de Render.

function getGeminiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      "IA no configurada. Agregá GEMINI_API_KEY en las variables de entorno de Render."
    );
  }
  return key;
}

async function callGemini(prompt: string): Promise<string> {
  const key = getGeminiKey();
  const model = "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const errMsg = (errBody as any)?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`Gemini error: ${errMsg}`);
  }

  const data = await res.json() as any;
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
}

// ── Sustancias a evaluar ──────────────────────────────────────────────────────
const SUBSTANCES = [
  "Ácidos fuertes (HCl, H₂SO₄, HNO₃)",
  "Bases fuertes (NaOH, KOH)",
  "Agentes oxidantes (H₂O₂, KMnO₄)",
  "Agentes reductores",
  "Solventes orgánicos (acetona, etanol)",
  "Hidrocarburos (gasolina, hexano)",
  "Agua",
  "Aire / Oxígeno",
  "Halógenos (cloro, bromo)",
  "Metales alcalinos (sodio, potasio)",
  "Amoníaco",
  "Materiales inflamables",
];

// ── Ruta POST /api/compatibility/ai-analyze ───────────────────────────────────
router.post("/ai-analyze", requireAuth, async (req, res) => {
  try {
    const { name, code, category } = req.body as {
      name?: string; code?: string; category?: string;
    };
    if (!name?.trim()) {
      return res.status(400).json({ error: "El campo 'name' es requerido" });
    }

    const substList = SUBSTANCES.map((s, i) => `${i + 1}. ${s}`).join("\n");

    const prompt = `Eres un experto en seguridad química industrial latinoamericana. Analiza este producto y determina su clase química y compatibilidades de almacenamiento seguro.

Producto: "${name.trim()}"${code ? ` (código: ${code})` : ""}${category ? ` (categoría registrada: ${category})` : ""}

Devuelve ÚNICAMENTE un JSON válido con esta estructura exacta:
{
  "claseDetectada": "ACIDO" | "BASE" | "SOLVENTE" | "COLORANTE" | "AUXILIAR" | "OXIDANTE" | "TOXICO" | "PEROXIDO" | "GAS" | "INFLAMABLE" | "OTRO",
  "claseONU": "<número de clase ONU, ej: '3', '8', '5.1', '6.1', '4.1', etc.>",
  "nombreQuimico": "<nombre IUPAC o nombre común del compuesto, si lo podés identificar>",
  "incompatibilidades": [
    { "sustancia": "<nombre exacto de la lista>", "nivel": "incompatible" | "caution" | "compatible", "motivo": "<razón breve en español, máx 10 palabras>" }
  ],
  "razonamiento": "<explicación de la clasificación, clase ONU asignada y advertencias clave, en 2-3 oraciones en español>"
}

Evaluá CADA UNA de las siguientes ${SUBSTANCES.length} sustancias y devolvé todas en el array:
${substList}

--- CONTEXTO: CLASES ONU / SGA ---
Asigná la clase ONU según las siguientes equivalencias:
- ACIDO → Clase 8 (Corrosivos)
- BASE → Clase 8 (Corrosivos)
- SOLVENTE → Clase 3 (Líquidos Inflamables)
- OXIDANTE → Clase 5.1 (Comburentes/Oxidantes)
- PEROXIDO → Clase 5.2 (Peróxidos Orgánicos)
- TOXICO → Clase 6.1 (Tóxicos)
- GAS → Clase 2 (Gases)
- INFLAMABLE → Clase 4.1 (Sólidos Inflamables)
- COLORANTE → Clase 6.1 (Tóxicos) o Clase 9 (Varios), según toxicidad
- AUXILIAR / OTRO → Clase 9 (Varios Peligrosos)

Matriz ONU de incompatibilidad entre clases (fuente: Anexo SGA Naciones Unidas):
- Clase 3 (Líq. Inflamables) es INCOMPATIBLE con: 5.1 (Oxidantes), 4.1 (Sólidos Inflamables)
- Clase 8 (Corrosivos) requiere PRECAUCIÓN con: 3 (Líq. Inf.), 4.1 (Sól. Inf.), 6.1 (Tóxicos), 9 (Varios)
- Clase 5.1 (Oxidantes) es INCOMPATIBLE con: 3 (Líq. Inf.), 4.1 (Sól. Inf.), 4.2, 4.3, 5.2 (Peróxidos), 2 (Gases inflamables)
- Clase 5.2 (Peróxidos) es INCOMPATIBLE con: 1, 4.1, 4.2, 5.1, 3 (Líq. Inf.)
- Clase 4.1 (Sól. Inflamables) es INCOMPATIBLE con: 3 (Líq. Inf.), 5.1, 5.2
- Clase 9 (Varios) requiere PRECAUCIÓN con: 8 (Corrosivos), 5.1 (Oxidantes)

Reglas de incompatibilidad críticas individuales (prevalecen sobre la clase ONU):
- Ácidos fuertes + Bases fuertes = incompatible (reacción exotérmica violenta)
- NaOH/Soda cáustica + H₂O₂/Peróxido de hidrógeno = incompatible (descomposición violenta)
- Solventes orgánicos + Agentes oxidantes = incompatible (incendio/explosión)
- Solventes inflamables + Aire/Oxígeno = incompatible (vapores inflamables)
- Ácidos + Metales alcalinos = incompatible (H₂ inflamable)
- Ácidos + Amoníaco = incompatible (gas tóxico NH₄⁺)
- Halógenos + Materiales inflamables = incompatible (oxidación violenta)
- Colorantes reactivos/dispersos + Agentes oxidantes fuertes = incompatible
- Colorantes ácidos + Bases fuertes/Ácidos fuertes = caution (hidrólisis)
- Si la reacción exacta es desconocida o depende de concentración: usar "caution"
- Si es claramente seguro almacenar juntos: "compatible"`;

    const raw = await callGemini(prompt);
    const parsed = JSON.parse(raw);

    if (!parsed.claseDetectada || !Array.isArray(parsed.incompatibilidades)) {
      logger.warn({ raw }, "Gemini response shape inesperado en compatibility/ai-analyze");
      return res.status(500).json({ error: "Respuesta de IA con formato inesperado" });
    }

    return res.json(parsed);
  } catch (err) {
    logger.error({ err }, "Error en compatibility/ai-analyze");
    const message = err instanceof Error ? err.message : "Error desconocido";

    if (message.includes("IA no configurada")) {
      return res.status(503).json({ error: message });
    }
    if (message.includes("quota") || message.includes("429")) {
      return res.status(429).json({ error: "Límite de la API de IA alcanzado. Intentá de nuevo en unos minutos." });
    }
    if (message.includes("Gemini error")) {
      return res.status(502).json({ error: `Error de IA: ${message}` });
    }
    return res.status(500).json({ error: `Error al analizar con IA: ${message}` });
  }
});

export default router;
