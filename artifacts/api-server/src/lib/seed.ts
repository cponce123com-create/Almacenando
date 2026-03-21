import { db } from "@workspace/db";
import { adminsTable, usersTable, trustedContactsTable } from "@workspace/db";
import { count, eq, isNull } from "drizzle-orm";
import { hashPassword } from "./auth.js";
import { generateId } from "./id.js";
import { randomBytes } from "crypto";
import { logger } from "./logger.js";

export async function seedAdminIfNeeded() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminName = process.env.ADMIN_NAME || "Administrador";

  if (!adminEmail || !adminPassword) {
    if (process.env.NODE_ENV === "production") {
      const [adminCount] = await db.select({ total: count() }).from(adminsTable);
      if ((adminCount?.total ?? 0) === 0) {
        logger.error(
          "SECURITY: No admin account exists and ADMIN_EMAIL/ADMIN_PASSWORD are not set. " +
          "The admin panel is inaccessible. Set these env vars and restart to create the initial admin."
        );
      }
    }
    return;
  }

  if (process.env.NODE_ENV === "production") {
    const WEAK_PASSWORDS = ["admin1234", "admin123", "password", "1234", "legado123", "admin"];
    if (WEAK_PASSWORDS.includes(adminPassword)) {
      logger.error("SECURITY: ADMIN_PASSWORD is too weak. Server will not seed a weak admin in production.");
      return;
    }
  }

  try {
    const [adminCount] = await db.select({ total: count() }).from(adminsTable);
    if ((adminCount?.total ?? 0) > 0) {
      return;
    }

    logger.info({ email: adminEmail }, "Seeding initial admin and user accounts");

    const passwordHash = await hashPassword(adminPassword);
    const encryptionKey = randomBytes(32).toString("base64");

    await db.insert(usersTable).values({
      id: generateId(),
      email: adminEmail,
      passwordHash,
      encryptionKey,
      status: "active",
    }).onConflictDoNothing();

    await db.insert(adminsTable).values({
      id: generateId(),
      name: adminName,
      email: adminEmail,
      passwordHash,
      role: "admin",
    }).onConflictDoNothing();

    logger.info({ email: adminEmail }, "Admin and user accounts seeded successfully");
  } catch (err) {
    logger.error({ err }, "Failed to seed admin account");
  }
}

/** Backfill confirmToken for any trusted contacts that were created before this field was added */
export async function backfillContactTokens() {
  try {
    const contacts = await db
      .select({ id: trustedContactsTable.id })
      .from(trustedContactsTable)
      .where(isNull(trustedContactsTable.confirmToken));

    if (contacts.length === 0) return;

    logger.info({ count: contacts.length }, "Backfilling confirmToken for trusted contacts");

    for (const c of contacts) {
      await db
        .update(trustedContactsTable)
        .set({ confirmToken: randomBytes(32).toString("hex") })
        .where(eq(trustedContactsTable.id, c.id));
    }

    logger.info("confirmToken backfill complete");
  } catch (err) {
    logger.error({ err }, "Failed to backfill contact tokens");
  }
}
