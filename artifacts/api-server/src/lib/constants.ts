// ── File upload limits ────────────────────────────────────────────────────────
export const MAX_FILE_SIZE_MB = 15;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
export const MAX_PHOTOS_PER_RECORD = 5;

// ── Pagination defaults ───────────────────────────────────────────────────────
export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 500;

// ── Scheduled jobs ────────────────────────────────────────────────────────────
export const DAILY_CRON_SCHEDULE = "0 7 * * *";
export const LOW_STOCK_BATCH_SIZE = 100;
export const EXPIRING_LOTS_BATCH_SIZE = 100;
export const EXPIRING_LOTS_DAYS_THRESHOLD = 30;

// ── Tokens ────────────────────────────────────────────────────────────────────
export const ACCESS_TOKEN_EXPIRES_SECONDS = 15 * 60; // 15 min
export const REFRESH_TOKEN_EXPIRES_SECONDS = 7 * 24 * 60 * 60; // 7 days

// ── Rate limiting ──────────────────────────────────────────────────────────────
export const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_RATE_LIMIT_MAX = 10;
export const AI_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const AI_RATE_LIMIT_MAX = 20;
export const GENERAL_API_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const GENERAL_API_RATE_LIMIT_MAX = 500;
