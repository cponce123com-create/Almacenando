import { db } from "@workspace/db";
import { adminsTable, usersTable } from "@workspace/db";
import { count } from "drizzle-orm";
import { hashPassword } from "./auth.js";
import { generateId } from "./id.js";
import { randomBytes } from "crypto";
import { logger } from "./logger.js";

export async function seedAdminIfNeeded() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminName = process.env.ADMIN_NAME || "Administrador";

  if (!adminEmail || !adminPassword) {
    return;
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
