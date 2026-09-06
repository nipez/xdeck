import { PLAN_LIMITS, type DeckPost } from "./types";

export { PLAN_LIMITS };

export const X_OAUTH_AUTHORIZE = "https://twitter.com/i/oauth2/authorize";
export const X_OAUTH_TOKEN = "https://api.x.com/2/oauth2/token";
export const X_API_BASE = "https://api.x.com/2";

export const X_SCOPES = [
  "tweet.read",
  "users.read",
  "offline.access",
  "list.read",
].join(" ");

export const SESSION_COOKIE = "xdeck_session";
export const SESSION_TTL_DAYS = 30;
export const MAGIC_LINK_TTL_MINUTES = 15;

export const CRON_KEYWORD_LOOKBACK_MINUTES = 15;

/** Sample posts for demo mode when X API credentials are missing. */
export const DEMO_POSTS: DeckPost[] = [
  {
    id: "demo-1",
    authorUsername: "xeng",
    authorName: "X Engineering",
    authorAvatar: null,
    text: "Shipping incremental improvements to the timeline APIs this week. Feedback welcome from client builders.",
    postedAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    likeCount: 842,
    replyCount: 61,
    repostCount: 120,
    url: "https://x.com/xeng/status/demo-1",
    source: "demo",
  },
  {
    id: "demo-2",
    authorUsername: "producthunt",
    authorName: "Product Hunt",
    authorAvatar: null,
    text: "Builders: what’s your go-to stack for multi-column social dashboards in 2026?",
    postedAt: new Date(Date.now() - 1000 * 60 * 34).toISOString(),
    likeCount: 210,
    replyCount: 88,
    repostCount: 41,
    url: "https://x.com/producthunt/status/demo-2",
    source: "demo",
  },
  {
    id: "demo-3",
    authorUsername: "cloudflare",
    authorName: "Cloudflare",
    authorAvatar: null,
    text: "Workers + D1 + Cron Triggers: a clean pattern for polling-based brand listening without a long-running Node process.",
    postedAt: new Date(Date.now() - 1000 * 60 * 55).toISOString(),
    likeCount: 1502,
    replyCount: 94,
    repostCount: 310,
    url: "https://x.com/cloudflare/status/demo-3",
    source: "demo",
  },
  {
    id: "demo-4",
    authorUsername: "nickbuilds",
    authorName: "Nick",
    authorAvatar: null,
    text: "Prototype tip: demo mode with sample posts beats a blank deck every time. Ship the shell first.",
    postedAt: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    likeCount: 67,
    replyCount: 12,
    repostCount: 8,
    url: "https://x.com/nickbuilds/status/demo-4",
    source: "demo",
  },
  {
    id: "demo-5",
    authorUsername: "brandwatch",
    authorName: "Brand Listener",
    authorAvatar: null,
    text: "Keyword hit: “xdeck” just showed up in a thread about TweetDeck alternatives. Cap-aware polling keeps COGS sane.",
    postedAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    likeCount: 33,
    replyCount: 4,
    repostCount: 2,
    url: "https://x.com/brandwatch/status/demo-5",
    source: "demo",
  },
  {
    id: "demo-6",
    authorUsername: "devrel",
    authorName: "DevRel Notes",
    authorAvatar: null,
    text: "OAuth 2.0 + PKCE for X: store tokens encrypted server-side, never in localStorage. Multiple accounts per user is the default.",
    postedAt: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    likeCount: 198,
    replyCount: 22,
    repostCount: 45,
    url: "https://x.com/devrel/status/demo-6",
    source: "demo",
  },
];

export const DEMO_LISTS = [
  { id: "demo-list-1", name: "Founders" },
  { id: "demo-list-2", name: "AI / Infra" },
  { id: "demo-list-3", name: "Design" },
];

export function currentPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
