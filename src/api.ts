import type {
  DeckColumn,
  DeckPost,
  Keyword,
  SessionUser,
  UsageStatus,
  XAccount,
} from "@shared/types";

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || res.statusText);
  }
  return data as T;
}

export const api = {
  me: () =>
    request<{
      user: SessionUser | null;
      usage?: UsageStatus;
      accounts?: XAccount[];
      demoMode: boolean;
    }>("/api/auth/me"),

  magicLink: (email: string) =>
    request<{ ok: boolean; demoInbox: boolean; magicUrl?: string }>(
      "/api/auth/magic-link",
      { method: "POST", body: JSON.stringify({ email }) },
    ),

  demoLogin: () =>
    request<{ ok: boolean; email: string }>("/api/auth/demo", {
      method: "POST",
    }),

  logout: () =>
    request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),

  columns: () => request<{ columns: DeckColumn[] }>("/api/columns"),

  addColumn: (body: {
    type: string;
    title?: string;
    keyword_id?: string;
    list_id?: string;
  }) =>
    request<{ id: string }>("/api/columns", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  patchColumn: (
    id: string,
    body: Partial<{
      title: string;
      list_id: string;
      keyword_id: string;
      x_account_id: string;
    }>,
  ) =>
    request<{ ok: boolean }>(`/api/columns/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  reorderColumns: (orderedIds: string[]) =>
    request<{ ok: boolean }>("/api/columns/reorder", {
      method: "POST",
      body: JSON.stringify({ orderedIds }),
    }),

  deleteColumn: (id: string) =>
    request<{ ok: boolean }>(`/api/columns/${id}`, { method: "DELETE" }),

  feed: (id: string) =>
    request<{
      posts: DeckPost[];
      usage?: UsageStatus;
      keyword?: string | null;
      capped?: boolean;
      lists?: Array<{ id: string; name: string }>;
    }>(`/api/columns/${id}/feed`),

  keywords: () =>
    request<{ keywords: Keyword[]; usage: UsageStatus }>("/api/keywords"),

  addKeyword: (phrase: string) =>
    request<{ id: string; usage: UsageStatus }>("/api/keywords", {
      method: "POST",
      body: JSON.stringify({ phrase }),
    }),

  deleteKeyword: (id: string) =>
    request<{ ok: boolean; usage: UsageStatus }>(`/api/keywords/${id}`, {
      method: "DELETE",
    }),

  pollKeywords: () =>
    request<{ inserted: number }>("/api/keywords/poll", { method: "POST" }),

  connectX: () =>
    request<{ url?: string; demo?: boolean; message?: string; error?: string }>(
      "/api/x/connect",
      { method: "POST" },
    ),

  lists: () =>
    request<{ lists: Array<{ id: string; name: string }> }>("/api/lists"),
};
