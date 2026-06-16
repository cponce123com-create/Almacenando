import { eq, lt, and, lte, gte, sql, inArray } from "drizzle-orm";
import { db, productsTable, dyeLotsTable, notificationsTable, usersTable } from "@workspace/db";
import { logger } from "./logger.js";
import { generateId } from "./id.js";
import { emitNotification } from "./notification-events.js";
import { registerJob, runStartupJobs } from "./background-jobs.js";

const LOW_STOCK_BATCH_SIZE = 100;
const EXPIRING_LOTS_BATCH_SIZE = 100;
const EXPIRING_LOTS_DAYS_THRESHOLD = 30;

/**
 * Scheduled Jobs — Almacenando
 *
 * Se ejecutan diariamente a las 07:00 AM (hora local del servidor).
 * - Verifica stock bajo en productos (stock < minimum_stock)
 * - Verifica lotes próximos a vencer (dentro de 30 días)
 * - Crea notificaciones en la BD para los usuarios correspondientes
 */

const SUPERVISOR_ROLES = ["admin", "supervisor"];
const QUALITY_ROLES = ["admin", "quality"];

async function getUsersByRoles(roles: string[]): Promise<Array<{ id: string }>> {
  return db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(
      roles.length === 1
        ? eq(usersTable.role, roles[0]!)
        : sql`${usersTable.role} IN (${sql.join(roles.map((r) => sql`${r}`), sql`, `)})`,
    );
}

/**
 * Fetches all recent (< 24h), unread notification titles for a list of users
 * in a SINGLE query. Returns a Set of "userId::title" strings for O(1) lookup.
 */
async function getRecentNotificationKeys(
  userIds: string[],
  since: Date,
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();

  const rows = await db
    .select({ userId: notificationsTable.userId, title: notificationsTable.title })
    .from(notificationsTable)
    .where(
      and(
        inArray(notificationsTable.userId, userIds),
        eq(notificationsTable.isRead, false),
        gte(notificationsTable.createdAt, since),
      ),
    );

  return new Set(rows.map((r) => `${r.userId}::${r.title}`));
}

async function checkLowStock(): Promise<number> {
  const lowStockProducts = await db
    .select({
      id: productsTable.id,
      code: productsTable.code,
      name: productsTable.name,
      stock: productsTable.stock,
      minimumStock: productsTable.minimumStock,
    })
    .from(productsTable)
    .where(
      and(
        eq(productsTable.status, "active"),
        lt(productsTable.stock, productsTable.minimumStock),
      ),
    )
    .limit(LOW_STOCK_BATCH_SIZE);

  if (lowStockProducts.length === 0) {
    logger.info("Scheduled job: no low-stock products found");
    return 0;
  }

  const supervisors = await getUsersByRoles(SUPERVISOR_ROLES);
  if (supervisors.length === 0) return 0;

  const supervisorIds = supervisors.map((u) => u.id);
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // ONE query to get all recent notifications — no more N+1
  const recentKeys = await getRecentNotificationKeys(supervisorIds, twentyFourHoursAgo);

  let created = 0;
  const inserts: Array<{
    id: string;
    userId: string;
    title: string;
    message: string;
    type: string;
    link: string;
  }> = [];

  for (const product of lowStockProducts) {
    const title = `Stock bajo: ${product.name}`;
    const message = `${product.name} (${product.code}) tiene ${product.stock} unidades, por debajo del mínimo de ${product.minimumStock}.`;

    for (const user of supervisors) {
      const key = `${user.id}::${title}`;
      if (recentKeys.has(key)) continue; // already notified recently

      inserts.push({
        id: generateId(),
        userId: user.id,
        title,
        message,
        type: "low_stock",
        link: `/products`,
      });
      recentKeys.add(key); // prevent duplicates within this batch
      created++;
    }
  }

  // Bulk insert all new notifications in one shot
  if (inserts.length > 0) {
    const insertedRows = await db.insert(notificationsTable).values(inserts).returning({
      id: notificationsTable.id,
      title: notificationsTable.title,
      message: notificationsTable.message,
      type: notificationsTable.type,
      userId: notificationsTable.userId,
      createdAt: notificationsTable.createdAt,
    });

    // Emitir eventos SSE para cada notificación creada
    for (const n of insertedRows) {
      emitNotification({
        id: n.id,
        title: n.title,
        message: n.message,
        type: n.type,
        userId: n.userId,
        createdAt: n.createdAt.toISOString(),
      });
    }
  }

  logger.info({ count: lowStockProducts.length, notificationsCreated: created }, "Low-stock job completed");
  return created;
}

async function checkExpiringLots(): Promise<number> {
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  const now = new Date();

  const expiringLots = await db
    .select({
      id: dyeLotsTable.id,
      productId: dyeLotsTable.productId,
      batchCode: dyeLotsTable.lotNumber,
      expirationDate: dyeLotsTable.expirationDate,
      productName: productsTable.name,
      productCode: productsTable.code,
    })
    .from(dyeLotsTable)
    .innerJoin(productsTable, eq(dyeLotsTable.productId, productsTable.id))
    .where(
      and(
        lte(dyeLotsTable.expirationDate, thirtyDaysFromNow.toISOString().slice(0, 10)),
        gte(dyeLotsTable.expirationDate, now.toISOString().slice(0, 10)),
      ),
    )
    .limit(EXPIRING_LOTS_BATCH_SIZE);

  if (expiringLots.length === 0) {
    logger.info("Scheduled job: no expiring lots found");
    return 0;
  }

  const qualityUsers = await getUsersByRoles(QUALITY_ROLES);
  if (qualityUsers.length === 0) return 0;

  const qualityIds = qualityUsers.map((u) => u.id);
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // ONE query for all recent notifications — no more N+1
  const recentKeys = await getRecentNotificationKeys(qualityIds, twentyFourHoursAgo);

  let created = 0;
  const inserts: Array<{
    id: string;
    userId: string;
    title: string;
    message: string;
    type: string;
    link: string;
  }> = [];

  for (const lot of expiringLots) {
    const daysLeft = Math.ceil(
      (new Date(lot.expirationDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );

    const title = `Lote próximo a vencer: ${lot.lotNumber}`;
    const message = `El lote ${lot.lotNumber} de ${lot.productName} (${lot.productCode}) vence en ${daysLeft} días (${lot.expirationDate}).`;

    for (const user of qualityUsers) {
      const key = `${user.id}::${title}`;
      if (recentKeys.has(key)) continue;

      inserts.push({
        id: generateId(),
        userId: user.id,
        title,
        message,
        type: "expiring_lot",
        link: `/dye-lots`,
      });
      recentKeys.add(key);
      created++;
    }
  }

  // Bulk insert in one shot
  if (inserts.length > 0) {
    const insertedRows = await db.insert(notificationsTable).values(inserts).returning({
      id: notificationsTable.id,
      title: notificationsTable.title,
      message: notificationsTable.message,
      type: notificationsTable.type,
      userId: notificationsTable.userId,
      createdAt: notificationsTable.createdAt,
    });

    // Emitir eventos SSE para cada notificación creada
    for (const n of insertedRows) {
      emitNotification({
        id: n.id,
        title: n.title,
        message: n.message,
        type: n.type,
        userId: n.userId,
        createdAt: n.createdAt.toISOString(),
      });
    }
  }

  logger.info({ count: expiringLots.length, notificationsCreated: created }, "Expiring lots job completed");
  return created;
}

/**
 * Inicializa los jobs programados.
 * Se llama durante el arranque del servidor.
 */
export function startScheduledJobs(): void {
  registerJob("check-low-stock", "daily_7am", checkLowStock);
  registerJob("check-expiring-lots", "daily_7am", checkExpiringLots);
  runStartupJobs(10_000);
  logger.info("Background jobs registered (daily at 07:00 + startup run)");
}
