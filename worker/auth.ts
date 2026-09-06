import type { Context, Next } from "hono";
import {
  MAGIC_LINK_TTL_MINUTES,
  SESSION_COOKIE,
  SESSION_TTL_DAYS,
} from "../shared/constants";
import type { SessionUser } from "../shared/types";
import {
  clearCookie,
  cookieHeader,
  randomId,
  randomToken,
  sha256Hex,
} from "./crypto";
import type { Env } from "./env";
import { isDemoMode } from "./env";

type AppVars = { user: SessionUser };

export type AppContext = Context<{ Bindings: Env; Variables: AppVars }>;

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header.split(";").map((p) => {
      const [k, ...rest] = p.trim().split("=");
      return [k, rest.join("=")];
    }),
  );
}

export async function getSessionUser(
  c: AppContext,
): Promise<SessionUser | null> {
  const cookies = parseCookies(c.req.header("Cookie"));
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;

  const hash = await sha256Hex(token);
  const row = await c.env.DB.prepare(
    `SELECT s.id as sid, s.expires_at, u.id, u.email, u.display_name
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?`,
  )
    .bind(hash)
    .first<{
      sid: string;
      expires_at: string;
      id: string;
      email: string;
      display_name: string | null;
    }>();

  if (!row) return null;
  if (new Date(row.expires_at + "Z").getTime() < Date.now()) {
    await c.env.DB.prepare(`DELETE FROM sessions WHERE id = ?`)
      .bind(row.sid)
      .run();
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    demoMode: isDemoMode(c.env),
  };
}

export async function requireAuth(c: AppContext, next: Next) {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  c.set("user", user);
  await next();
}

export async function createSession(
  env: Env,
  userId: string,
): Promise<{ token: string; setCookie: string }> {
  const token = randomToken(32);
  const hash = await sha256Hex(token);
  const id = randomId();
  const expires = new Date(
    Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  await env.DB.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`,
  )
    .bind(id, userId, hash, expires.replace("T", " ").replace("Z", ""))
    .run();

  return {
    token,
    setCookie: cookieHeader(SESSION_COOKIE, token, {
      maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
      secure: !env.APP_URL.startsWith("http://localhost"),
    }),
  };
}

export async function destroySession(c: AppContext) {
  const cookies = parseCookies(c.req.header("Cookie"));
  const token = cookies[SESSION_COOKIE];
  if (token) {
    const hash = await sha256Hex(token);
    await c.env.DB.prepare(`DELETE FROM sessions WHERE token_hash = ?`)
      .bind(hash)
      .run();
  }
  return clearCookie(SESSION_COOKIE);
}

export async function upsertUserByEmail(
  env: Env,
  email: string,
): Promise<{ id: string; email: string; isNew: boolean }> {
  const existing = await env.DB.prepare(
    `SELECT id, email FROM users WHERE email = ? COLLATE NOCASE`,
  )
    .bind(email)
    .first<{ id: string; email: string }>();

  if (existing) return { ...existing, isNew: false };

  const id = randomId();
  await env.DB.prepare(
    `INSERT INTO users (id, email, display_name) VALUES (?, ?, ?)`,
  )
    .bind(id, email.toLowerCase(), email.split("@")[0])
    .run();

  // Seed default columns for new users
  await seedDefaultColumns(env, id);
  return { id, email: email.toLowerCase(), isNew: true };
}

export async function seedDefaultColumns(env: Env, userId: string) {
  const defaults: Array<{ type: string; title: string; pos: number }> = [
    { type: "home", title: "Home", pos: 0 },
    { type: "mentions", title: "Mentions", pos: 1 },
    { type: "list", title: "Lists", pos: 2 },
    { type: "keyword", title: "Brand listen", pos: 3 },
  ];
  for (const d of defaults) {
    await env.DB.prepare(
      `INSERT INTO columns (id, user_id, type, title, position) VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(randomId(), userId, d.type, d.title, d.pos)
      .run();
  }
}

export async function createMagicLink(
  env: Env,
  email: string,
): Promise<{ token: string; url: string; demoInbox: boolean }> {
  const token = randomToken(24);
  const hash = await sha256Hex(token);
  const id = randomId();
  const expires = new Date(
    Date.now() + MAGIC_LINK_TTL_MINUTES * 60 * 1000,
  ).toISOString();

  await env.DB.prepare(
    `INSERT INTO magic_links (id, email, token_hash, expires_at) VALUES (?, ?, ?, ?)`,
  )
    .bind(id, email.toLowerCase(), hash, expires.replace("T", " ").replace("Z", ""))
    .run();

  const url = `${env.APP_URL}/api/auth/verify?token=${token}`;

  // Real email if Resend key present; otherwise stub (return link in API for demo)
  let demoInbox = true;
  if (env.RESEND_API_KEY) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "xdeck <onboarding@resend.dev>",
          to: [email],
          subject: "Your xdeck sign-in link",
          html: `<p>Sign in to xdeck:</p><p><a href="${url}">${url}</a></p><p>Expires in ${MAGIC_LINK_TTL_MINUTES} minutes.</p>`,
        }),
      });
      demoInbox = false;
    } catch {
      demoInbox = true;
    }
  }

  return { token, url, demoInbox };
}

export async function consumeMagicLink(
  env: Env,
  token: string,
): Promise<string | null> {
  const hash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT id, email, expires_at, consumed_at FROM magic_links WHERE token_hash = ?`,
  )
    .bind(hash)
    .first<{
      id: string;
      email: string;
      expires_at: string;
      consumed_at: string | null;
    }>();

  if (!row || row.consumed_at) return null;
  if (new Date(row.expires_at + "Z").getTime() < Date.now()) return null;

  await env.DB.prepare(
    `UPDATE magic_links SET consumed_at = datetime('now') WHERE id = ?`,
  )
    .bind(row.id)
    .run();

  const user = await upsertUserByEmail(env, row.email);
  return user.id;
}
