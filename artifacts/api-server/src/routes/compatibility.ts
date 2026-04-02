import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import OpenAI from "openai";
import { logger } from "../lib/logger.js";

const router = Router();

function getClient(): OpenAI {
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey  = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!baseURL || !apiKey) throw new Error("IA no configurada (AI_INTEGRATIONS_OPENAI_*)");
  return new OpenAI({ baseURL, apiKey });
}

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

router.post("/ai-analyze", requireAuth, async (req, res) => {
  try {
    const { name, code, category } = req.body as {
      name?: string; code?: string; category?: string;
    };
    if (!name?.trim()) {
      return res.status(400).json({ error: "El campo 'name' es requerido" });
    }

    const client = getClient();

    const substList = SUBSTANCES.map((s, i) => `${i + 1}. ${s}`).join("\n");

    const content = `Eres un experto en seguridad química industrial latinoamericana. \
Analiza este producto y determina su clase química y compatibilidades de almacenamiento seguro.

Producto: "${name.trim()}"${code ? ` (código: ${code})` : ""}${category ? ` (categoría registrada: ${category})` : ""}

Devuelve ÚNICAMENTE un JSON válido con esta estructura exacta:
{
  "claseDetectada": "ACIDO" | "BASE" | "SOLVENTE" | "COLORANTE" | "AUXILIAR" | "OTRO",
  "nombreQuimico": "<nombre IUPAC o nombre común del compuesto, si lo podés identificar>",
  "incompatibilidades": [
    { "sustancia": "<nombre exacto de la lista>", "nivel": "incompatible" | "caution" | "compatible", "motivo": "<razón breve en español, máx 10 palabras>" }
  ],
  "razonamiento": "<explicación de la clasificación y advertencias clave, en 1-2 oraciones en español>"
}

Evaluá CADA UNA de las siguientes ${SUBSTANCES.length} sustancias y devolvé todas en el array:
${substList}

Reglas de incompatibilidad críticas:
- Ácidos fuertes + Bases fuertes = incompatible (reacción exotérmica violenta, formación de sal + calor)
- NaOH / Soda cáustica / Hidróxido de sodio + H₂O₂ / Peróxido de hidrógeno = incompatible (descomposición violenta con liberación de O₂)
- Solventes orgánicos + Agentes oxidantes = incompatible (riesgo de incendio o explosión)
- Solventes inflamables + Aire / Oxígeno = incompatible (vapores inflamables, riesgo de ignición)
- Ácidos + Metales alcalinos = incompatible (liberación de H₂ inflamable)
- Ácidos + Amoníaco = incompatible (gas tóxico, formación de sales de amonio)
- Halógenos + Materiales inflamables = incompatible (oxidación violenta)
- Colorantes reactivos / dispersos + Agentes oxidantes fuertes = incompatible (degradación, posible ignición)
- Colorantes ácidos + Bases fuertes / Ácidos fuertes = caution (hidrólisis, cambio de color)
- Si la reacción exacta es desconocida o depende de concentración: usar "caution"
- Si es claramente seguro almacenar juntos: "compatible"`;

    const result = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content }],
      temperature: 0.1,
      response_format: { type: "json_object" },
    });

    const raw  = result.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);

    // Validate shape
    if (!parsed.claseDetectada || !Array.isArray(parsed.incompatibilidades)) {
      logger.warn({ raw }, "AI response shape inesperado en compatibility/ai-analyze");
      return res.status(500).json({ error: "Respuesta de IA con formato inesperado" });
    }

    return res.json(parsed);
  } catch (err) {
    logger.error({ err }, "Error en compatibility/ai-analyze");
    return res.status(500).json({ error: "Error al analizar con IA" });
  }
});

export default router;
