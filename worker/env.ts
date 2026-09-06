export interface Env {
  DB: D1Database;
  SESSIONS: KVNamespace;
  ASSETS: Fetcher;
  APP_NAME: string;
  APP_URL: string;
  PLAN_NAME: string;
  AUTH_SECRET: string;
  TOKEN_ENCRYPTION_KEY: string;
  X_CLIENT_ID?: string;
  X_CLIENT_SECRET?: string;
  RESEND_API_KEY?: string;
}

export function isDemoMode(env: Env): boolean {
  return !env.X_CLIENT_ID || !env.X_CLIENT_SECRET;
}
