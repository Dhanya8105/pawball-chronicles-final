/**
 * apps/api/src/lib/pagination.ts
 *
 * One place for parsing `?page=&pageSize=` query params, so every list
 * endpoint clamps them the same way (page >= 1, 1 <= pageSize <= 50).
 */

export interface PageParams {
  page: number;
  pageSize: number;
  skip: number;
}

export function parsePageParams(
  query: Record<string, unknown>,
  defaultPageSize = 20
): PageParams {
  const page = Math.max(1, toInt(query.page, 1));
  const pageSize = Math.min(50, Math.max(1, toInt(query.pageSize, defaultPageSize)));
  return { page, pageSize, skip: (page - 1) * pageSize };
}

function toInt(value: unknown, fallback: number): number {
  const n = parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}
