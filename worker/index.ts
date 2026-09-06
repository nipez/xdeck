import { Hono } from "hono";
import { cors } from "hono/cors";
import { PLAN_LIMITS } from "../shared/constants";
import type { DeckColumn, DeckPost, Keyword, XAccount } from "../shared/types";
import {
  consumeMagicLink,
  createMagicLink,
  createSession,
  destroySession,
  getSessionUser,
  requireAuth,
  type AppContext,
} from "./auth";
import { decryptSecret, randomId } from "./crypto";
import type { Env } from "./env";
import { isDemoMode } from "./env";
import { getUsage, pollAllKeywords } from "./keywords";
import {
  connectDemoAccount,
  demoLists,
  fetchTimelinePosts,
  finishXOAuth,
  startXOAuth,
} from "./x";

type Vars = { user: Awaited<ReturnType<typeof getSessionUser>> & object };

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

app.use("/api/*", cors({ origin: (o) => o || "*", credentials: true }));

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    app: c.env.APP_NAME || "xdeck",
    demoMode: isDemoMode(c.env),
  }),
);

// ——— Auth ———

app.get("/api/auth/me", async (c) => {
  const user = await getSessionUser(c as unknown as AppContext);
  if (!user) return c.json({ user: null, demoMode: isDemoMode(c.env) });
  const usage = await getUsage(c.env, user.id);
  const accounts = await listAccounts(c.env, user.id);
  return c.json({ user, usage, accounts, demoMode: isDemoMode(c.env) });
});

app.post("/api/auth/magic-link", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { email?: string };
  const email = (body.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return c.json({ error: "Valid email required" }, 400);
  }
  const link = await createMagicLink(c.env, email);
  return c.json({
    ok: true,
    demoInbox: link.demoInbox,
    // Expose magic URL in demo/stub so local preview works without email
    ...(link.demoInbox ? { magicUrl: link.url } : {}),
  });
});

app.get("/api/auth/verify", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.redirect("/login?error=missing_token");
  const userId = await consumeMagicLink(c.env, token);
  if (!userId) return c.redirect("/login?error=invalid_token");

  const session = await createSession(c.env, userId);
  if (isDemoMode(c.env)) {
    await connectDemoAccount(c.env, userId);
  }
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/app",
      "Set-Cookie": session.setCookie,
    },
  });
});

/** Instant demo login — no email needed for local / investor demos. */
app.post("/api/auth/demo", async (c) => {
  const email = `demo-${Date.now().toString(36)}@xdeck.local`;
  const { upsertUserByEmail } = await import("./auth");
  const user = await upsertUserByEmail(c.env, email);
  await connectDemoAccount(c.env, user.id);
  const session = await createSession(c.env, user.id);
  c.header("Set-Cookie", session.setCookie);
  return c.json({ ok: true, email: user.email });
});

app.post("/api/auth/logout", async (c) => {
  const clear = await destroySession(c as unknown as AppContext);
  c.header("Set-Cookie", clear);
  return c.json({ ok: true });
});

// ——— X accounts ———

app.get("/api/x/accounts", requireAuth, async (c) => {
  const user = c.get("user")!;
  return c.json({ accounts: await listAccounts(c.env, user.id) });
});

app.post("/api/x/connect", requireAuth, async (c) => {
  const user = c.get("user")!;
  if (isDemoMode(c.env)) {
    await connectDemoAccount(c.env, user.id);
    return c.json({
      demo: true,
      message: "Demo account connected. Set X_CLIENT_ID / X_CLIENT_SECRET for real OAuth.",
    });
  }
  const result = await startXOAuth(c.env, user.id);
  if ("error" in result) return c.json(result, 400);
  return c.json(result);
});

app.get("/api/x/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const err = c.req.query("error");
  if (err) return c.redirect(`/app?x_error=${encodeURIComponent(err)}`);
  if (!code || !state) return c.redirect("/app?x_error=missing_code");
  const result = await finishXOAuth(c.env, code, state);
  if (!result.ok) {
    return c.redirect(`/app?x_error=${encodeURIComponent(result.error)}`);
  }
  return c.redirect(`/app?x_connected=${encodeURIComponent(result.username)}`);
});

app.delete("/api/x/accounts/:id", requireAuth, async (c) => {
  const user = c.get("user")!;
  await c.env.DB.prepare(`DELETE FROM x_accounts WHERE id = ? AND user_id = ?`)
    .bind(c.req.param("id"), user.id)
    .run();
  return c.json({ ok: true });
});

// ——— Columns ———

app.get("/api/columns", requireAuth, async (c) => {
  const user = c.get("user")!;
  const rows = await c.env.DB.prepare(
    `SELECT * FROM columns WHERE user_id = ? ORDER BY position ASC`,
  )
    .bind(user.id)
    .all<DeckColumn>();
  return c.json({ columns: rows.results ?? [] });
});

app.post("/api/columns", requireAuth, async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json<{
    type: string;
    title?: string;
    x_account_id?: string;
    list_id?: string;
    keyword_id?: string;
  }>();
  const allowed = ["home", "mentions", "list", "keyword"];
  if (!allowed.includes(body.type)) {
    return c.json({ error: "Invalid column type" }, 400);
  }
  const maxPos = await c.env.DB.prepare(
    `SELECT COALESCE(MAX(position), -1) as m FROM columns WHERE user_id = ?`,
  )
    .bind(user.id)
    .first<{ m: number }>();
  const id = randomId();
  const title =
    body.title ||
    ({ home: "Home", mentions: "Mentions", list: "List", keyword: "Keyword" }[
      body.type
    ] as string);
  await c.env.DB.prepare(
    `INSERT INTO columns (id, user_id, type, title, position, x_account_id, list_id, keyword_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      user.id,
      body.type,
      title,
      (maxPos?.m ?? -1) + 1,
      body.x_account_id ?? null,
      body.list_id ?? null,
      body.keyword_id ?? null,
    )
    .run();
  return c.json({ id });
});

app.patch("/api/columns/:id", requireAuth, async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json<{
    title?: string;
    list_id?: string;
    keyword_id?: string;
    x_account_id?: string;
    settings_json?: string;
  }>();
  const col = await c.env.DB.prepare(
    `SELECT id FROM columns WHERE id = ? AND user_id = ?`,
  )
    .bind(c.req.param("id"), user.id)
    .first();
  if (!col) return c.json({ error: "Not found" }, 404);

  await c.env.DB.prepare(
    `UPDATE columns SET
      title = COALESCE(?, title),
      list_id = COALESCE(?, list_id),
      keyword_id = COALESCE(?, keyword_id),
      x_account_id = COALESCE(?, x_account_id),
      settings_json = COALESCE(?, settings_json),
      updated_at = datetime('now')
     WHERE id = ?`,
  )
    .bind(
      body.title ?? null,
      body.list_id ?? null,
      body.keyword_id ?? null,
      body.x_account_id ?? null,
      body.settings_json ?? null,
      c.req.param("id"),
    )
    .run();
  return c.json({ ok: true });
});

app.post("/api/columns/reorder", requireAuth, async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json<{ orderedIds: string[] }>();
  const ids = body.orderedIds || [];
  for (let i = 0; i < ids.length; i++) {
    await c.env.DB.prepare(
      `UPDATE columns SET position = ?, updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`,
    )
      .bind(i, ids[i], user.id)
      .run();
  }
  return c.json({ ok: true });
});

app.delete("/api/columns/:id", requireAuth, async (c) => {
  const user = c.get("user")!;
  await c.env.DB.prepare(`DELETE FROM columns WHERE id = ? AND user_id = ?`)
    .bind(c.req.param("id"), user.id)
    .run();
  return c.json({ ok: true });
});

// ——— Column feed ———

app.get("/api/columns/:id/feed", requireAuth, async (c) => {
  const user = c.get("user")!;
  const col = await c.env.DB.prepare(
    `SELECT * FROM columns WHERE id = ? AND user_id = ?`,
  )
    .bind(c.req.param("id"), user.id)
    .first<DeckColumn>();
  if (!col) return c.json({ error: "Not found" }, 404);

  if (col.type === "keyword") {
    const usage = await getUsage(c.env, user.id);
    let keywordPhrase: string | null = null;
    if (col.keyword_id) {
      const kw = await c.env.DB.prepare(
        `SELECT phrase FROM keywords WHERE id = ? AND user_id = ?`,
      )
        .bind(col.keyword_id, user.id)
        .first<{ phrase: string }>();
      keywordPhrase = kw?.phrase ?? null;
    }

    const mentions = await c.env.DB.prepare(
      `SELECT * FROM mentions WHERE user_id = ? AND (? IS NULL OR keyword_id = ?)
       ORDER BY posted_at DESC LIMIT 50`,
    )
      .bind(user.id, col.keyword_id, col.keyword_id)
      .all<{
        x_post_id: string;
        author_username: string | null;
        author_name: string | null;
        author_avatar: string | null;
        text: string;
        posted_at: string | null;
      }>();

    let posts: DeckPost[] = (mentions.results ?? []).map((m) => ({
      id: m.x_post_id,
      authorUsername: m.author_username ?? "unknown",
      authorName: m.author_name ?? "Unknown",
      authorAvatar: m.author_avatar,
      text: m.text,
      postedAt: m.posted_at
        ? m.posted_at.includes("T")
          ? m.posted_at
          : m.posted_at.replace(" ", "T") + "Z"
        : new Date().toISOString(),
      url: `https://x.com/${m.author_username ?? "i"}/status/${m.x_post_id}`,
      source: "cache" as const,
    }));

    // If empty, live/demo fetch so the column isn't blank
    if (posts.length === 0) {
      const token = await accountToken(c.env, col.x_account_id);
      posts = await fetchTimelinePosts(c.env, token, "keyword", {
        keyword: keywordPhrase || "xdeck",
      });
    }

    return c.json({ posts, usage, keyword: keywordPhrase, capped: usage.capped });
  }

  const token = await accountToken(c.env, col.x_account_id);
  const posts = await fetchTimelinePosts(c.env, token, col.type, {
    listId: col.list_id,
  });
  return c.json({ posts, lists: col.type === "list" ? demoLists() : undefined });
});

// ——— Keywords ———

app.get("/api/keywords", requireAuth, async (c) => {
  const user = c.get("user")!;
  const rows = await c.env.DB.prepare(
    `SELECT * FROM keywords WHERE user_id = ? ORDER BY created_at ASC`,
  )
    .bind(user.id)
    .all<Keyword>();
  const usage = await getUsage(c.env, user.id);
  return c.json({ keywords: rows.results ?? [], usage });
});

app.post("/api/keywords", requireAuth, async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json<{ phrase?: string }>();
  const phrase = (body.phrase || "").trim();
  if (!phrase) return c.json({ error: "phrase required" }, 400);

  const usage = await getUsage(c.env, user.id);
  if (usage.keywordsUsed >= PLAN_LIMITS.starter.maxKeywords) {
    return c.json(
      {
        error: `Starter plan allows ${PLAN_LIMITS.starter.maxKeywords} keywords. Remove one to add another.`,
        usage,
      },
      402,
    );
  }

  const id = randomId();
  try {
    await c.env.DB.prepare(
      `INSERT INTO keywords (id, user_id, phrase, active) VALUES (?, ?, ?, 1)`,
    )
      .bind(id, user.id, phrase)
      .run();
  } catch {
    return c.json({ error: "Keyword already exists" }, 409);
  }

  // Auto-bind to first unbound keyword column if present
  const unbound = await c.env.DB.prepare(
    `SELECT id FROM columns WHERE user_id = ? AND type = 'keyword' AND keyword_id IS NULL LIMIT 1`,
  )
    .bind(user.id)
    .first<{ id: string }>();
  if (unbound) {
    await c.env.DB.prepare(
      `UPDATE columns SET keyword_id = ?, title = ?, updated_at = datetime('now') WHERE id = ?`,
    )
      .bind(id, `🔎 ${phrase}`, unbound.id)
      .run();
  }

  return c.json({ id, usage: await getUsage(c.env, user.id) });
});

app.delete("/api/keywords/:id", requireAuth, async (c) => {
  const user = c.get("user")!;
  await c.env.DB.prepare(`DELETE FROM keywords WHERE id = ? AND user_id = ?`)
    .bind(c.req.param("id"), user.id)
    .run();
  return c.json({ ok: true, usage: await getUsage(c.env, user.id) });
});

app.get("/api/usage", requireAuth, async (c) => {
  const user = c.get("user")!;
  return c.json({ usage: await getUsage(c.env, user.id) });
});

/** Manual keyword poll (also used in demo to seed mentions). */
app.post("/api/keywords/poll", requireAuth, async (c) => {
  const result = await pollAllKeywords(c.env);
  return c.json(result);
});

app.get("/api/lists", requireAuth, async (c) => {
  return c.json({ lists: demoLists() });
});

async function listAccounts(env: Env, userId: string): Promise<XAccount[]> {
  const rows = await env.DB.prepare(
    `SELECT id, user_id, x_user_id, username, display_name, avatar_url
     FROM x_accounts WHERE user_id = ? ORDER BY created_at ASC`,
  )
    .bind(userId)
    .all<XAccount>();
  return rows.results ?? [];
}

async function accountToken(
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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return app.fetch(request, env, ctx);
    }
    // SPA assets via Workers Assets binding
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response("Not found", { status: 404 });
  },

  async scheduled(
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(
      pollAllKeywords(env).then((r) =>
        console.log("[xdeck cron]", JSON.stringify(r)),
      ),
    );
  },
};
