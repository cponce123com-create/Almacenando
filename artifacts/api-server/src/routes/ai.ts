import { Router } from "express";
import { requireAuth } from "../lib/auth.js";

const router = Router();

router.post("/generate-will", requireAuth, async (req, res) => {
  const { beneficiaries, testatorData } = req.body;

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

  const beneficiariesText = beneficiaries
    .map((b: { relationship: string; name: string; bequest: string }) =>
      `- ${b.relationship} llamado/a ${b.name}: ${b.bequest}`
    )
    .join("\n");

  const today = new Date().toLocaleDateString("es-PE", {
    day: "numeric", month: "long", year: "numeric",
  });

  const albaceaClause = testatorData?.executor
    ? `El albacea designado es ${testatorData.executor}.`
    : "El albacea será designado en el instrumento notarial definitivo.";

  const previousWillClause = testatorData?.hasPreviousWill === "si"
    ? "El testador declara expresamente que revoca cualquier testamento anterior."
    : "El testador declara no haber otorgado testamento anterior.";

  const prompt = `Eres un asistente legal especializado en derecho sucesorio peruano.
Redacta un documento formal de "Últimas Voluntades" en español para Perú con los siguientes datos REALES del testador. NO dejes ningún campo en blanco — usa exactamente los datos proporcionados.

DATOS DEL TESTADOR:
- Nombre completo: ${testatorData?.fullName || "No proporcionado"}
- DNI: ${testatorData?.dni || "No proporcionado"}
- Estado civil: ${testatorData?.civilStatus || "No especificado"}
- Ciudad: ${testatorData?.city || "No proporcionada"}
- Domicilio: ${testatorData?.address || "No proporcionado"}
- Fecha: ${today}
- ${albaceaClause}
- ${previousWillClause}

BENEFICIARIOS Y BIENES:
${beneficiariesText}

INSTRUCCIONES ESTRICTAS:
1. Usar EXACTAMENTE los datos del testador proporcionados arriba — NO dejar espacios en blanco ni guiones para completar después
2. Formato de testamento informal pero legalmente orientado al sistema jurídico peruano
3. Incluir encabezado formal con los datos reales ya completados
4. Mencionar que es documento orientativo y debe formalizarse ante notario público
5. Incluir una sección por cada beneficiario con el bien o activo que se le destina, usando su nombre real
6. Incluir cláusulas estándar del derecho sucesorio peruano: legítima, libre disposición, albacea
7. Cerrar con espacio para firma y fecha
8. Lenguaje formal pero comprensible
9. Entre 800 y 1200 palabras
10. Al final incluir una sección de firma con el nombre real del testador ya escrito

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
