import { Router } from "express";
import { db } from "@workspace/db";
import {
  legacyItemsTable,
  recipientsTable,
  trustedContactsTable,
  funeralPreferencesTable,
  activationSettingsTable,
  profilesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();

router.get("/stats", requireAuth, async (req, res) => {
  const userId = (req as typeof req & { userId: string }).userId;

  const [items, recipients, trustedContacts, funeralPrefs, activationSettings, profile] = await Promise.all([
    db.select().from(legacyItemsTable).where(eq(legacyItemsTable.userId, userId)),
    db.select().from(recipientsTable).where(eq(recipientsTable.userId, userId)),
    db.select().from(trustedContactsTable).where(eq(trustedContactsTable.userId, userId)),
    db.select().from(funeralPreferencesTable).where(eq(funeralPreferencesTable.userId, userId)).limit(1),
    db.select().from(activationSettingsTable).where(eq(activationSettingsTable.userId, userId)).limit(1),
    db.select().from(profilesTable).where(eq(profilesTable.userId, userId)).limit(1),
  ]);

  const activeItems = items.filter((i) => i.status === "active");
  const draftItems = items.filter((i) => i.status === "draft");
  const hasFuneral = funeralPrefs.length > 0 && !!(funeralPrefs[0]!.burialType || funeralPrefs[0]!.additionalNotes);
  const hasActivation = activationSettings.length > 0;
  const hasProfile = profile.length > 0 && !!(profile[0]!.fullName);

  const completionSteps = [
    { key: "profile", label: "Perfil completo", completed: hasProfile },
    { key: "legacy_items", label: "Al menos 1 elemento de legado", completed: items.length > 0 },
    { key: "recipients", label: "Al menos 1 destinatario", completed: recipients.length > 0 },
    { key: "trusted_contacts", label: "Al menos 2 contactos de confianza", completed: trustedContacts.length >= 2 },
    { key: "funeral", label: "Preferencias de sepelio", completed: hasFuneral },
    { key: "activation", label: "Configuración de activación", completed: hasActivation },
  ];

  const completedSteps = completionSteps.filter((s) => s.completed).length;
  const completionPercentage = Math.round((completedSteps / completionSteps.length) * 100);

  res.json({
    legacyItemsCount: items.length,
    activeItemsCount: activeItems.length,
    draftItemsCount: draftItems.length,
    recipientsCount: recipients.length,
    trustedContactsCount: trustedContacts.length,
    hasFuneralPreferences: hasFuneral,
    hasActivationSettings: hasActivation,
    completionPercentage,
    completionSteps,
  });
});

export default router;
