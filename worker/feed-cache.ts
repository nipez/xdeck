import { PERSONAL_MODE, currentPeriod } from "../shared/constants";
import type { DeckPost } from "../shared/types";
import type { Env } from "./env";

export type CachedFeed = {
  posts: DeckPost[];
  newestPostId: string | null;
  newestPostedAt: string | null;
  fetchedAt: string;
  ageMs: number;
  fresh: boolean;
};

function sqliteNowToMs(sqliteTs: string): number {
  // D1 datetime('now') is "YYYY-MM-DD HH:MM:SS" UTC
  const iso = sqliteTs.includes("T")
    ? sqliteTs
    : sqliteTs.replace(" ", "T") + "Z";
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

export async function readFeedCache(
  env: Env,
  columnId: string,
  userId: string,
): Promise<CachedFeed | null> {
  const row = await env.DB.prepare(
    `SELECT posts_json, newest_post_id, newest_posted_at, fetched_at
     FROM feed_cache WHERE column_id = ? AND user_id = ?`,
  )
    .bind(columnId, userId)
    .first<{
      posts_json: string;
      newest_post_id: string | null;
      newest_posted_at: string | null;
      fetched_at: string;
    }>();

  if (!row) return null;

  let posts: DeckPost[] = [];
  try {
    posts = JSON.parse(row.posts_json) as DeckPost[];
  } catch {
    posts = [];
  }

  const ageMs = Date.now() - sqliteNowToMs(row.fetched_at);
  return {
    posts: posts.map((p) => ({ ...p, source: "cache" as const })),
    newestPostId: row.newest_post_id,
    newestPostedAt: row.newest_posted_at,
    fetchedAt: row.fetched_at,
    ageMs,
    fresh: ageMs >= 0 && ageMs < PERSONAL_MODE.feedCacheTtlMs,
  };
}

export async function writeFeedCache(
  env: Env,
  columnId: string,
  userId: string,
  posts: DeckPost[],
): Promise<void> {
  const newest = posts[0] ?? null;
  await env.DB.prepare(
    `INSERT INTO feed_cache
       (column_id, user_id, posts_json, newest_post_id, newest_posted_at, fetched_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(column_id) DO UPDATE SET
       user_id = excluded.user_id,
       posts_json = excluded.posts_json,
       newest_post_id = excluded.newest_post_id,
       newest_posted_at = excluded.newest_posted_at,
       fetched_at = datetime('now')`,
  )
    .bind(
      columnId,
      userId,
      JSON.stringify(posts.slice(0, 50)),
      newest?.id ?? null,
      newest?.postedAt ?? null,
    )
    .run();
}

/** Merge live posts (newest-first) ahead of cached, de-dupe by id. */
export function mergeFeedPosts(
  live: DeckPost[],
  cached: DeckPost[],
  limit = 50,
): DeckPost[] {
  const seen = new Set<string>();
  const out: DeckPost[] = [];
  for (const p of [...live, ...cached]) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}

export async function ensureUsageRow(env: Env, userId: string) {
  const period = currentPeriod();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO usage_counters (user_id, period, mentions_count, reads_count)
     VALUES (?, ?, 0, 0)`,
  )
    .bind(userId, period)
    .run();
}

/** Count approximate X post reads for the billing period. */
export async function incrementReads(
  env: Env,
  userId: string,
  count: number,
): Promise<void> {
  if (count <= 0) return;
  await ensureUsageRow(env, userId);
  await env.DB.prepare(
    `UPDATE usage_counters SET reads_count = COALESCE(reads_count, 0) + ?
     WHERE user_id = ? AND period = ?`,
  )
    .bind(count, userId, currentPeriod())
    .run();
}
