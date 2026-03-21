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

  const prompt = `Eres un abogado especialista en derecho sucesorio peruano con 20 años de experiencia notarial. 
Redacta un documento completo de "Últimas Voluntades" en español formal para Perú. 
Usa EXACTAMENTE los datos proporcionados — ningún campo debe quedar en blanco.

DATOS DEL TESTADOR (usar literalmente, sin modificar):
- Nombre completo: ${testatorData?.fullName}
- DNI: ${testatorData?.dni}
- Estado civil: ${testatorData?.civilStatus}
- Ciudad: ${testatorData?.city}
- Domicilio: ${testatorData?.address}
- Fecha actual: ${today}
- Albacea: ${testatorData?.executor ? testatorData.executor : "será designado en el instrumento notarial definitivo"}
- Testamento anterior: ${testatorData?.hasPreviousWill === "si" ? "Sí tiene y lo revoca expresamente" : "No tiene testamento anterior"}

BENEFICIARIOS Y BIENES (detallar extensamente cada uno):
${beneficiariesText}

INSTRUCCIONES ESTRICTAS DE REDACCIÓN:
1. El documento debe tener entre 1500 y 2000 palabras
2. Usar exclusivamente markdown con estos elementos: # para título principal, ## para cláusulas, ### para subcláusulas, **negrita** para nombres y conceptos clave, > para el aviso legal, - o 1. para listas, --- para separadores
3. Estructura OBLIGATORIA con estas secciones en este orden exacto:
   - Título: # DOCUMENTO DE ÚLTIMAS VOLUNTADES
   - Subtítulo en blockquote con aviso legal orientativo
   - Fecha y ciudad centrada en negrita
   - ## ENCABEZADO E IDENTIFICACIÓN DEL TESTADOR (párrafo formal con todos los datos)
   - ## PRIMERA CLÁUSULA — DECLARACIONES GENERALES (2 párrafos extensos sobre capacidad mental, libertad de voluntad, revocación de testamentos anteriores si aplica)
   - ## SEGUNDA CLÁUSULA — DE LA LEGÍTIMA Y LA CUOTA DE LIBRE DISPOSICIÓN (explicar artículos 723-727 del CC, mencionar a los herederos forzosos con sus nombres reales)
   - Una cláusula numerada por cada beneficiario: ## [NÚMERO EN ROMANO] CLÁUSULA — DESIGNACIÓN DE BIENES A FAVOR DE [NOMBRE EN MAYÚSCULAS] (2-3 párrafos extensos describiendo los bienes con detalle legal, mencionar SUNARP si son inmuebles, entidades financieras si es dinero, derechos de autor si es propiedad intelectual)
   - ## CLÁUSULA SOBRE EL ALBACEA (mencionar artículos 787 y siguientes, describir sus facultades)
   - ## CLÁUSULA SOBRE DEUDAS Y CARGAS (artículo 661 del CC)
   - ## CLÁUSULA FINAL — DISPOSICIONES GENERALES (2 párrafos sobre resolución de controversias, buena fe)
   - ## NOTA LEGAL IMPORTANTE (blockquote con aviso notarial detallado)
   - ## FIRMA Y SUSCRIPCIÓN (con nombre real, DNI real, ciudad real, fecha real)
4. Para cada bien legado, redactar al menos 3-4 líneas describiendo el bien, su naturaleza jurídica, y cómo debe realizarse la transferencia
5. Citar artículos específicos del Código Civil Peruano en cada cláusula
6. Usar lenguaje notarial formal: "lego y transfiero", "a título de herencia", "con todos los derechos reales", "conforme al ordenamiento jurídico"
7. Los nombres de personas siempre en MAYÚSCULAS
8. NO dejar espacios en blanco, guiones o campos por completar — todo debe estar lleno con los datos reales

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
