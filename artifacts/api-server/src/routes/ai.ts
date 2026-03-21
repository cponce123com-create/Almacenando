import { Router } from "express";
import { requireAuth } from "../lib/auth.js";

const router = Router();

router.post("/generate-will", requireAuth, async (req, res) => {
  const { beneficiaries } = req.body;

  if (!beneficiaries || !Array.isArray(beneficiaries) || beneficiaries.length === 0) {
    res.status(400).json({ error: "Se requiere al menos un beneficiario." });
    return;
  }

  const baseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;

  if (!baseUrl || !apiKey) {
    res.status(503).json({ error: "El servicio de IA no está configurado en este servidor." });
    return;
  }

  const beneficiaryList = beneficiaries
    .map((b: { relationship: string; name: string; bequest: string }, i: number) =>
      `${i + 1}. ${b.relationship} ${b.name}: "${b.bequest}"`
    )
    .join("\n");

  const prompt = `Eres un asistente legal especializado en derecho sucesorio peruano. 
Redacta un documento formal de "Últimas Voluntades" en español para Perú, 
basándote en la siguiente información proporcionada por el testador:

Beneficiarios y bienes:
${beneficiaryList}

El documento debe:
1. Tener el formato de un testamento informal pero legalmente orientado al sistema jurídico peruano
2. Incluir encabezado formal con espacio para nombre completo, DNI, domicilio y fecha
3. Mencionar que es un documento de carácter orientativo y que debe ser formalizado ante notario público
4. Incluir una sección por cada beneficiario con el bien o activo que se le destina
5. Incluir cláusulas estándar del derecho sucesorio peruano: legítima, libre disposición, albacea
6. Cerrar con espacio para firma y fecha
7. Usar lenguaje formal pero comprensible
8. Tener entre 800 y 1200 palabras

Redacta el documento completo ahora:`;

  try {
    const anthropicRes = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const errData = await anthropicRes.json().catch(() => ({}));
      console.error("Anthropic API error:", errData);
      res.status(502).json({ error: "Error al conectar con el servicio de IA." });
      return;
    }

    const data = await anthropicRes.json();
    const document = data.content?.[0]?.text ?? "";
    res.json({ document });
  } catch (err) {
    console.error("AI generate-will error:", err);
    res.status(500).json({ error: "Error inesperado al generar el documento." });
  }
});

export default router;
