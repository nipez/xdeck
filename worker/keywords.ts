import {
  CRON_KEYWORD_LOOKBACK_MINUTES,
  PLAN_LIMITS,
  currentPeriod,
} from "../shared/constants";
import type { UsageStatus } from "../shared/types";
import { decryptSecret, randomId } from "./crypto";
import type { Env } from "./env";
import { isDemoMode } from "./env";
import { fetchTimelinePosts } from "./x";

export async function getUsage(env: Env, userId: string): Promise<UsageStatus> {
  const plan = PLAN_LIMITS.starter;
  const period = currentPeriod();
  const kw = await env.DB.prepare(
    `SELECT COUNT(*) as c FROM keywords WHERE user_id = ? AND active = 1`,
  )
    .bind(userId)
    .first<{ c: number }>();
  const usage = await env.DB.prepare(
    `SELECT mentions_count FROM usage_counters WHERE user_id = ? AND period = ?`,
  )
    .bind(userId, period)
    .first<{ mentions_count: number }>();

  const mentionsUsed = usage?.mentions_count ?? 0;
  return {
    plan: plan.name,
    maxKeywords: plan.maxKeywords,
    maxMentionsPerMonth: plan.maxMentionsPerMonth,
    keywordsUsed: kw?.c ?? 0,
    mentionsUsed,
    period,
    capped: mentionsUsed >= plan.maxMentionsPerMonth,
  };
}

export async function ensureUsageRow(env: Env, userId: string) {
  const period = currentPeriod();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO usage_counters (user_id, period, mentions_count) VALUES (?, ?, 0)`,
  )
    .bind(userId, period)
    .run();
}

async function getAccessToken(
  env: Env,
  xAccountId: string | null,
): Promise<string | null> {
  if (!xAccountId || isDemoMode(env)) return null;
  const row = await env.DB.prepare(
    `SELECT access_token_enc FROM x_accounts WHERE id = ?`,
  )
    .bind(xAccountId)
    .first<{ access_token_enc: string }>();
  if (!row) return null;
  return decryptSecret(row.access_token_enc, env.TOKEN_ENCRYPTION_KEY);
}

/** Poll all active keywords for all users; respect monthly caps. */
export async function pollAllKeywords(env: Env): Promise<{
  users: number;
  inserted: number;
  skippedCap: number;
}> {
  const keywords = await env.DB.prepare(
    `SELECT k.id, k.user_id, k.phrase,
            (SELECT id FROM x_accounts xa WHERE xa.user_id = k.user_id LIMIT 1) as x_account_id
     FROM keywords k WHERE k.active = 1`,
  ).all<{
    id: string;
    user_id: string;
    phrase: string;
    x_account_id: string | null;
  }>();

  let inserted = 0;
  let skippedCap = 0;
  const touchedUsers = new Set<string>();

  for (const kw of keywords.results ?? []) {
    touchedUsers.add(kw.user_id);
    const usage = await getUsage(env, kw.user_id);
    if (usage.capped) {
      skippedCap++;
      continue;
    }

    const remaining = usage.maxMentionsPerMonth - usage.mentionsUsed;
    const token = await getAccessToken(env, kw.x_account_id);
    const { posts } = await fetchTimelinePosts(env, token, "keyword", {
      keyword: kw.phrase,
    });

    // Only consider "recent" window for cron semantics
    const cutoff = Date.now() - CRON_KEYWORD_LOOKBACK_MINUTES * 60 * 1000;
    const fresh = posts.filter(
      (p) => new Date(p.postedAt).getTime() >= cutoff || p.source === "demo",
    );

    let added = 0;
    for (const p of fresh) {
      if (added >= remaining) {
        skippedCap++;
        break;
      }
      try {
        const res = await env.DB.prepare(
          `INSERT OR IGNORE INTO mentions
           (id, user_id, keyword_id, x_post_id, author_id, author_username, author_name, author_avatar, text, posted_at, raw_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
          .bind(
            randomId(),
            kw.user_id,
            kw.id,
            p.id,
            null,
            p.authorUsername,
            p.authorName,
            p.authorAvatar,
            p.text,
            p.postedAt.replace("T", " ").replace("Z", ""),
            JSON.stringify(p),
          )
          .run();
        if (res.meta.changes > 0) {
          added++;
          inserted++;
        }
      } catch {
        // ignore dupes / constraint races
      }
    }

    if (added > 0) {
      await ensureUsageRow(env, kw.user_id);
      await env.DB.prepare(
        `UPDATE usage_counters SET mentions_count = mentions_count + ?
         WHERE user_id = ? AND period = ?`,
      )
        .bind(added, kw.user_id, currentPeriod())
        .run();
    }
  }

  return { users: touchedUsers.size, inserted, skippedCap };
}
