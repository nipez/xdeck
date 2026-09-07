import {
  DEMO_LISTS,
  DEMO_POSTS,
  X_API_BASE,
  X_OAUTH_AUTHORIZE,
  X_OAUTH_TOKEN,
  X_SCOPES,
} from "../shared/constants";
import type { DeckPost } from "../shared/types";
import { encryptSecret, pkcePair, randomId } from "./crypto";
import type { Env } from "./env";
import { isDemoMode } from "./env";

export async function startXOAuth(
  env: Env,
  userId: string,
): Promise<{ url: string } | { error: string }> {
  if (isDemoMode(env)) {
    return {
      error:
        "X API credentials not configured. Set X_CLIENT_ID and X_CLIENT_SECRET (demo mode is active).",
    };
  }

  const { verifier, challenge } = await pkcePair();
  const state = randomId(24);
  const expires = new Date(Date.now() + 10 * 60 * 1000)
    .toISOString()
    .replace("T", " ")
    .replace("Z", "");

  await env.DB.prepare(
    `INSERT INTO oauth_states (state, user_id, code_verifier, expires_at) VALUES (?, ?, ?, ?)`,
  )
    .bind(state, userId, verifier, expires)
    .run();

  // Also stash in KV for fast lookup
  await env.SESSIONS.put(
    `oauth:${state}`,
    JSON.stringify({ userId, verifier }),
    { expirationTtl: 600 },
  );

  const redirectUri = `${env.APP_URL}/api/x/callback`;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.X_CLIENT_ID!,
    redirect_uri: redirectUri,
    scope: X_SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  return { url: `${X_OAUTH_AUTHORIZE}?${params}` };
}

export async function finishXOAuth(
  env: Env,
  code: string,
  state: string,
): Promise<{ ok: true; username: string } | { ok: false; error: string }> {
  if (isDemoMode(env)) {
    return { ok: false, error: "Demo mode — X OAuth disabled" };
  }

  const row = await env.DB.prepare(
    `SELECT user_id, code_verifier, expires_at FROM oauth_states WHERE state = ?`,
  )
    .bind(state)
    .first<{ user_id: string; code_verifier: string; expires_at: string }>();

  if (!row) return { ok: false, error: "Invalid OAuth state" };
  await env.DB.prepare(`DELETE FROM oauth_states WHERE state = ?`)
    .bind(state)
    .run();

  const redirectUri = `${env.APP_URL}/api/x/callback`;
  const basic = btoa(`${env.X_CLIENT_ID}:${env.X_CLIENT_SECRET}`);
  const tokenRes = await fetch(X_OAUTH_TOKEN, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code_verifier: row.code_verifier,
    }),
  });

  if (!tokenRes.ok) {
    const t = await tokenRes.text();
    return { ok: false, error: `Token exchange failed: ${t}` };
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };

  const meRes = await fetch(`${X_API_BASE}/users/me?user.fields=profile_image_url,name,username`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!meRes.ok) {
    return { ok: false, error: "Failed to fetch X user profile" };
  }
  const meJson = (await meRes.json()) as {
    data: {
      id: string;
      username: string;
      name: string;
      profile_image_url?: string;
    };
  };

  const accessEnc = await encryptSecret(
    tokens.access_token,
    env.TOKEN_ENCRYPTION_KEY,
  );
  const refreshEnc = tokens.refresh_token
    ? await encryptSecret(tokens.refresh_token, env.TOKEN_ENCRYPTION_KEY)
    : null;
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000)
        .toISOString()
        .replace("T", " ")
        .replace("Z", "")
    : null;

  const existing = await env.DB.prepare(
    `SELECT id FROM x_accounts WHERE user_id = ? AND x_user_id = ?`,
  )
    .bind(row.user_id, meJson.data.id)
    .first<{ id: string }>();

  const accountId = existing?.id ?? randomId();

  if (existing) {
    await env.DB.prepare(
      `UPDATE x_accounts SET username = ?, display_name = ?, avatar_url = ?,
       access_token_enc = ?, refresh_token_enc = ?, token_expires_at = ?, scopes = ?,
       updated_at = datetime('now') WHERE id = ?`,
    )
      .bind(
        meJson.data.username,
        meJson.data.name,
        meJson.data.profile_image_url ?? null,
        accessEnc,
        refreshEnc,
        expiresAt,
        tokens.scope ?? null,
        accountId,
      )
      .run();
  } else {
    await env.DB.prepare(
      `INSERT INTO x_accounts
       (id, user_id, x_user_id, username, display_name, avatar_url, access_token_enc, refresh_token_enc, token_expires_at, scopes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        accountId,
        row.user_id,
        meJson.data.id,
        meJson.data.username,
        meJson.data.name,
        meJson.data.profile_image_url ?? null,
        accessEnc,
        refreshEnc,
        expiresAt,
        tokens.scope ?? null,
      )
      .run();
  }

  // Seeded columns start with x_account_id NULL — bind them so feeds use this token.
  await bindUnboundColumns(env, row.user_id, accountId);

  return { ok: true, username: meJson.data.username };
}

/** Attach an X account to any of the user's columns that still lack one. */
export async function bindUnboundColumns(
  env: Env,
  userId: string,
  xAccountId: string,
) {
  await env.DB.prepare(
    `UPDATE columns SET x_account_id = ?, updated_at = datetime('now')
     WHERE user_id = ? AND x_account_id IS NULL`,
  )
    .bind(xAccountId, userId)
    .run();
}

/** Connect a fake X account in demo mode for UI testing. */
export async function connectDemoAccount(
  env: Env,
  userId: string,
  username = "demo_user",
) {
  const existing = await env.DB.prepare(
    `SELECT id FROM x_accounts WHERE user_id = ? AND x_user_id = ?`,
  )
    .bind(userId, "demo-x-1")
    .first<{ id: string }>();

  if (existing) {
    await bindUnboundColumns(env, userId, existing.id);
    return;
  }

  const accountId = randomId();
  const enc = await encryptSecret("demo-token", env.TOKEN_ENCRYPTION_KEY);
  await env.DB.prepare(
    `INSERT INTO x_accounts
     (id, user_id, x_user_id, username, display_name, avatar_url, access_token_enc, refresh_token_enc, scopes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      accountId,
      userId,
      "demo-x-1",
      username,
      "Demo Account",
      null,
      enc,
      null,
      "tweet.read users.read offline.access list.read",
    )
    .run();

  await bindUnboundColumns(env, userId, accountId);
}

export type TimelineFetchResult = {
  posts: DeckPost[];
  error?: string;
};

export async function fetchTimelinePosts(
  env: Env,
  _accessToken: string | null,
  kind: "home" | "mentions" | "list" | "keyword",
  opts: { listId?: string | null; keyword?: string | null } = {},
): Promise<TimelineFetchResult> {
  // DEMO_POSTS only when app-level demo mode is on (no X_CLIENT_*).
  if (isDemoMode(env)) {
    return { posts: filterDemo(kind, opts) };
  }

  if (!_accessToken) {
    return { posts: [] };
  }

  // Live X API — never silently fall back to DEMO_POSTS on error.
  try {
    if (kind === "home") {
      // Reverse chrono home requires elevated access; v0 uses recent search as stand-in.
      return {
        posts: await recentSearch(env, _accessToken, "lang:en -is:retweet", 20),
      };
    }
    if (kind === "mentions") {
      return {
        posts: await recentSearch(env, _accessToken, "@me -is:retweet", 20),
      };
    }
    if (kind === "list" && opts.listId) {
      const url = `${X_API_BASE}/lists/${opts.listId}/tweets?max_results=20&tweet.fields=created_at,public_metrics&expansions=author_id&user.fields=profile_image_url,name,username`;
      return { posts: await mapTweetResponse(await xGet(url, _accessToken)) };
    }
    if (kind === "keyword" && opts.keyword) {
      return {
        posts: await recentSearch(
          env,
          _accessToken,
          `${opts.keyword} -is:retweet`,
          20,
        ),
      };
    }
  } catch (e) {
    return {
      posts: [],
      error: e instanceof Error ? e.message : "Failed to fetch from X",
    };
  }
  return { posts: [] };
}

async function xGet(url: string, token: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`X API ${res.status}`);
  return res.json();
}

async function recentSearch(
  _env: Env,
  token: string,
  query: string,
  max = 20,
): Promise<DeckPost[]> {
  const params = new URLSearchParams({
    query,
    max_results: String(Math.min(max, 100)),
    "tweet.fields": "created_at,public_metrics",
    expansions: "author_id",
    "user.fields": "profile_image_url,name,username",
  });
  const json = await xGet(
    `${X_API_BASE}/tweets/search/recent?${params}`,
    token,
  );
  return mapTweetResponse(json);
}

function mapTweetResponse(json: unknown): DeckPost[] {
  const body = json as {
    data?: Array<{
      id: string;
      text: string;
      created_at?: string;
      author_id?: string;
      public_metrics?: {
        like_count?: number;
        reply_count?: number;
        retweet_count?: number;
      };
    }>;
    includes?: {
      users?: Array<{
        id: string;
        username: string;
        name: string;
        profile_image_url?: string;
      }>;
    };
  };
  const users = new Map(
    (body.includes?.users ?? []).map((u) => [u.id, u] as const),
  );
  return (body.data ?? []).map((t) => {
    const u = t.author_id ? users.get(t.author_id) : undefined;
    return {
      id: t.id,
      authorUsername: u?.username ?? "unknown",
      authorName: u?.name ?? "Unknown",
      authorAvatar: u?.profile_image_url ?? null,
      text: t.text,
      postedAt: t.created_at ?? new Date().toISOString(),
      likeCount: t.public_metrics?.like_count,
      replyCount: t.public_metrics?.reply_count,
      repostCount: t.public_metrics?.retweet_count,
      url: `https://x.com/${u?.username ?? "i"}/status/${t.id}`,
      source: "live" as const,
    };
  });
}

function filterDemo(
  kind: string,
  opts: { listId?: string | null; keyword?: string | null },
): DeckPost[] {
  let posts = [...DEMO_POSTS];
  if (kind === "mentions") {
    posts = posts.filter((p) => /@|mention|feedback/i.test(p.text));
  }
  if (kind === "keyword" && opts.keyword) {
    const q = opts.keyword.toLowerCase();
    posts = posts.filter(
      (p) =>
        p.text.toLowerCase().includes(q) ||
        q.includes("xdeck") ||
        q.includes("brand"),
    );
    if (posts.length === 0) {
      posts = DEMO_POSTS.filter((p) => p.id === "demo-5" || p.id === "demo-3");
    }
  }
  if (kind === "list") {
    posts = posts.slice(0, 4);
  }
  return posts.map((p) => ({ ...p, source: "demo" as const }));
}

export function demoLists() {
  return DEMO_LISTS;
}

export type ListsFetchResult = {
  lists: Array<{ id: string; name: string }>;
  demo: boolean;
  error?: string;
};

/** Owned lists for the connected account. Demo lists only when isDemoMode. */
export async function fetchUserLists(
  env: Env,
  accessToken: string | null,
): Promise<ListsFetchResult> {
  if (isDemoMode(env)) {
    return { lists: DEMO_LISTS, demo: true };
  }
  if (!accessToken) {
    return { lists: [], demo: false };
  }
  try {
    const me = (await xGet(`${X_API_BASE}/users/me`, accessToken)) as {
      data: { id: string };
    };
    const json = (await xGet(
      `${X_API_BASE}/users/${me.data.id}/owned_lists?max_results=100&list.fields=name`,
      accessToken,
    )) as {
      data?: Array<{ id: string; name: string }>;
    };
    return {
      lists: (json.data ?? []).map((l) => ({ id: l.id, name: l.name })),
      demo: false,
    };
  } catch (e) {
    return {
      lists: [],
      demo: false,
      error: e instanceof Error ? e.message : "Failed to fetch lists from X",
    };
  }
}
