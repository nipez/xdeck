/** Plan limits — billing comes later; these are hard stubs for v0. */
export const PLAN_LIMITS = {
  starter: {
    name: "Starter",
    maxKeywords: 3,
    maxMentionsPerMonth: 1000,
    /** Soft personal-use read budget (X pay-per-use COGS). */
    maxReadsPerMonth: 500,
  },
  pro: {
    name: "Pro",
    maxKeywords: 10,
    maxMentionsPerMonth: 5000,
    maxReadsPerMonth: 5000,
  },
  scale: {
    name: "Scale",
    maxKeywords: 30,
    maxMentionsPerMonth: 25000,
    maxReadsPerMonth: 25000,
  },
} as const;

export type PlanId = keyof typeof PLAN_LIMITS;

export const DEFAULT_PLAN: PlanId = "starter";

export type ColumnType = "home" | "mentions" | "list" | "keyword";

export interface User {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
}

export interface XAccount {
  id: string;
  user_id: string;
  x_user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface DeckColumn {
  id: string;
  user_id: string;
  type: ColumnType;
  title: string;
  position: number;
  x_account_id: string | null;
  list_id: string | null;
  keyword_id: string | null;
  settings_json: string;
}

export interface Keyword {
  id: string;
  user_id: string;
  phrase: string;
  active: number;
  created_at: string;
}

export interface Mention {
  id: string;
  user_id: string;
  keyword_id: string;
  x_post_id: string;
  author_id: string | null;
  author_username: string | null;
  author_name: string | null;
  author_avatar: string | null;
  text: string;
  posted_at: string | null;
  created_at: string;
}

/** Normalized post shown in timeline / keyword columns */
export interface DeckPost {
  id: string;
  authorUsername: string;
  authorName: string;
  authorAvatar: string | null;
  text: string;
  postedAt: string;
  likeCount?: number;
  replyCount?: number;
  repostCount?: number;
  /** Views / impressions when X returns public_metrics.impression_count */
  impressionCount?: number;
  url: string;
  source?: "live" | "demo" | "cache";
}

export interface UsageStatus {
  plan: string;
  maxKeywords: number;
  maxMentionsPerMonth: number;
  maxReadsPerMonth: number;
  keywordsUsed: number;
  mentionsUsed: number;
  /** Approximate X post reads this period (incremented on live fetches). */
  readsUsed: number;
  period: string;
  capped: boolean;
  readsCapped: boolean;
}

export interface SessionUser {
  id: string;
  email: string;
  displayName: string | null;
  demoMode: boolean;
}
