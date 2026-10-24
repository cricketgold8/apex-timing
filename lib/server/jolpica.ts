import "server-only";
import type { z } from "zod";
import { fetchJson } from "./upstream";

/**
 * Jolpica-F1 client (Ergast-compatible API, https://api.jolpi.ca). Used for championship rounds,
 * classified results, qualifying and standings. Responses are paginated (max 100 rows per page).
 */

export const JOLPICA_PROVIDER = "Jolpica-F1";
const BASE = (process.env.JOLPICA_BASE_URL ?? "https://api.jolpi.ca/ergast/f1").replace(/\/$/, "");

/** Results change only when a round is completed or amended; half an hour keeps amendments visible the same day. */
const TTL = 30 * 60 * 1000;

export async function jolpica<T>(path: string, schema: z.ZodType<T>): Promise<{ data: T; url: string }> {
  const url = `${BASE}/${path.replace(/^\//, "")}`;
  const json = await fetchJson(url, { provider: JOLPICA_PROVIDER, ttlMs: TTL, spacingMs: 260 });
  return { data: schema.parse(json), url };
}

/** Fetches every page of a paginated race-table endpoint and concatenates the pages. */
export async function jolpicaAllPages<T extends { MRData: { total: string } }>(
  path: string,
  schema: z.ZodType<T>,
  merge: (pages: T[]) => T,
): Promise<{ data: T; urls: string[] }> {
  const sep = path.includes("?") ? "&" : "?";
  const first = await jolpica(`${path}${sep}limit=100&offset=0`, schema);
  const total = Number(first.data.MRData.total);
  const pages: T[] = [first.data];
  const urls = [first.url];
  for (let offset = 100; offset < total; offset += 100) {
    const page = await jolpica(`${path}${sep}limit=100&offset=${offset}`, schema);
    pages.push(page.data);
    urls.push(page.url);
  }
  return { data: merge(pages), urls };
}
