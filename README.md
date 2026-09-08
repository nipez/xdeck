# xdeck

TweetDeck-style multi-column dashboard for **X** (Twitter), with keyword brand-listening columns. Codename **xdeck** — v0 is **X-only**.

## Architecture

| Layer | Choice |
| --- | --- |
| Frontend | Vite + React 19 + TypeScript (SPA) |
| API / edge | Cloudflare Worker ([Hono](https://hono.dev)) |
| Static hosting | Workers Assets (`[assets]` in `wrangler.toml`) — Pages-compatible deploy |
| Database | Cloudflare **D1** (SQLite) |
| Short-lived state | KV (`SESSIONS`) for OAuth state (also mirrored in D1) |
| Scheduling | Worker **Cron Trigger** every 5 minutes → keyword recent-search poll |

```
Browser ──► Worker (Hono /api/* + SPA assets)
                │
                ├── D1  (users, sessions, x_accounts, columns, keywords, mentions, usage)
                ├── KV  (oauth state)
                └── X API (OAuth 2.0 + PKCE, recent search) when credentials are set
```

**Demo mode:** if `X_CLIENT_ID` / `X_CLIENT_SECRET` are unset, the API serves sample posts, a demo X account, and stub magic-link URLs so the deck is fully demoable locally. When credentials **are** set, `DEMO_POSTS` are never served — missing tokens or X API errors return an empty feed (with `needsXAccount` / `error` when applicable).

On Connect X (OAuth callback), any columns with `x_account_id IS NULL` are bound to the newly connected account so Home/Mentions/etc. use that token.

## Quick start (local)

```bash
npm install

# Apply D1 migrations to local DB
npm run db:migrate:local

# Copy secrets (already present as .dev.vars.example pattern)
cp .dev.vars .dev.vars   # edit if needed — see Env vars below

# Terminal A — Vite UI (proxies /api → Worker)
npm run dev

# Terminal B — Worker + D1 + cron locally
npm run dev:worker
```

- UI: http://localhost:5173  
- Worker (API + built assets after `npm run build`): http://localhost:8787  

For a single-process preview of the production shape:

```bash
npm run build
npm run db:migrate:local
npm run dev:worker
# open http://localhost:8787
```

### Package scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite frontend (port 5173, proxies `/api`) |
| `npm run dev:worker` | `wrangler dev` — Worker + D1 + cron |
| `npm run build` | Build SPA into `dist/` |
| `npm run deploy` | Build + `wrangler deploy` |
| `npm run db:migrate:local` | Apply D1 migrations locally |
| `npm run db:migrate:remote` | Apply D1 migrations to remote |
| `npm run typecheck` | `tsc --noEmit` |

## Environment variables

Set locally in `.dev.vars` (gitignored). In production use `wrangler secret put` / dashboard.

| Name | Required | Notes |
| --- | --- | --- |
| `AUTH_SECRET` | Yes | Session / app secret material |
| `TOKEN_ENCRYPTION_KEY` | Yes | AES key material for encrypting X tokens at rest |
| `APP_URL` | Yes | Public origin, e.g. `http://localhost:8787` or `https://xdeck.example.workers.dev` |
| `X_CLIENT_ID` | For live X | X Developer Portal OAuth 2.0 client id |
| `X_CLIENT_SECRET` | For live X | Client secret |
| `RESEND_API_KEY` | Optional | If set, magic links are emailed; otherwise the link is returned in the API for demo |

Also in `wrangler.toml` `[vars]`: `APP_NAME`, `PLAN_NAME`.

### Adding X API keys

1. Create an app in the [X Developer Portal](https://developer.x.com/) with **OAuth 2.0**.
2. Callback URL: `{APP_URL}/api/x/callback`
3. Scopes used: `tweet.read users.read offline.access list.read`
4. Locally: put `X_CLIENT_ID` and `X_CLIENT_SECRET` in `.dev.vars`
5. Production:
   ```bash
   wrangler secret put X_CLIENT_ID
   wrangler secret put X_CLIENT_SECRET
   wrangler secret put AUTH_SECRET
   wrangler secret put TOKEN_ENCRYPTION_KEY
   ```
6. Create a real D1 database and KV namespace, paste IDs into `wrangler.toml`, then:
   ```bash
   npm run db:migrate:remote
   npm run deploy
   ```

## Auth

- **Magic link** via `/api/auth/magic-link` → `/api/auth/verify?token=…`
- Without `RESEND_API_KEY`, the verify URL is returned in JSON (`magicUrl`) for local/demo use
- **Demo login** (`Continue with demo account`) creates a throwaway user + demo X account instantly

## v0 features

1. Email magic-link / demo auth (Workers-friendly; secrets via env)
2. X OAuth 2.0 + PKCE; tokens encrypted in D1; multiple accounts per user
3. Horizontal multi-column deck: Home, Mentions, Lists, Keyword
   - Home: `GET /2/users/:id/timelines/reverse_chronological`
   - Mentions: `GET /2/users/:id/mentions`
   - Lists: owned lists only; missing/invalid `list_id` skips the X tweets call
4. Add / remove / reorder columns; layout persisted in D1
5. Keyword brand-listen with Starter caps (3 keywords, 1,000 mentions/month); pause UI when capped
6. Cron every 5 minutes for keywords; timeline columns are **manual refresh** + D1 cache-first (cheap personal default)
7. Landing at `/`, deck at `/app`
8. Lists column loads **owned lists** from the connected X account when live (`list.read`); demo mode still uses sample list names
9. Approximate X **read usage** in the deck header vs personal/Starter soft cap (~500 reads/month)

## Out of scope (v0)

- Reddit / YouTube / LinkedIn listening  
- Posting or replying inside the app (reply deep-links to x.com)  
- Stripe / billing (limits are code constants)  
- Native mobile apps  
- Enterprise firehose / filtered stream (keywords use recent search + polling)
- Following/subscribed lists beyond owned lists (owned lists only for v0)

## D1 migrations

Migrations live in `migrations/`. `0001_init.sql` creates users, sessions, magic_links, x_accounts, columns, keywords, mentions, usage_counters, oauth_states. `0002_cheap_personal.sql` adds `feed_cache` and `usage_counters.reads_count`.

## Plan limits (stub)

```ts
// shared/types.ts — PLAN_LIMITS
Starter: maxKeywords = 3, maxMentionsPerMonth = 1000, maxReadsPerMonth = 500
Pro / Scale: higher keyword, mention, and read caps (stubs for SaaS tiers)
```

**Cheap personal mode** (default): columns load once on open and use a **manual refresh** button — no TweetDeck-style sub-minute auto-poll. Timeline feeds are **cache-first** (D1, ~5 min TTL); live X calls use `since_id` when possible and increment a monthly **reads** counter (~500 soft cap for personal). Keyword columns still use cron + mentions cache; Starter caps (3 keywords / 1,000 mentions) stay hard-enforced.

No overages — when the monthly mention counter hits the cap, keyword polling skips that user and the UI shows a clear capped state.
