import { useCallback, useEffect, useRef, useState } from "react";
import type { DeckColumn, DeckPost, Keyword } from "@shared/types";
import { PERSONAL_MODE } from "@shared/constants";
import { api } from "../api";
import { PostCard } from "./PostCard";

export function Column({
  column,
  keywords,
  onRemove,
  onMoveLeft,
  onMoveRight,
  canMoveLeft,
  canMoveRight,
  onBindKeyword,
  onBindList,
  onColumnMetaChange,
  onUsageMaybeChanged,
}: {
  column: DeckColumn;
  keywords: Keyword[];
  onRemove: () => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onBindKeyword: (keywordId: string, title: string) => Promise<void>;
  onBindList: (listId: string, title: string) => Promise<void>;
  /** Called when the server clears stale column metadata (e.g. demo list_id). */
  onColumnMetaChange?: () => void;
  /** Called after a live feed fetch so the header can refresh read usage. */
  onUsageMaybeChanged?: () => void;
}) {
  const [posts, setPosts] = useState<DeckPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [capped, setCapped] = useState(false);
  const [lists, setLists] = useState<Array<{ id: string; name: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [needsXAccount, setNeedsXAccount] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const metaChangeRef = useRef(onColumnMetaChange);
  metaChangeRef.current = onColumnMetaChange;
  const usageChangeRef = useRef(onUsageMaybeChanged);
  usageChangeRef.current = onUsageMaybeChanged;

  const selectedListId =
    column.list_id && lists.some((l) => l.id === column.list_id)
      ? column.list_id
      : "";

  const loadFeed = useCallback(
    async (opts?: { force?: boolean }) => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.feed(column.id, { refresh: !!opts?.force });
        setPosts(data.posts);
        setCapped(!!data.capped);
        setNeedsXAccount(!!data.needsXAccount);
        setFromCache(!!data.cached || data.source === "cache");
        if (data.lists) setLists(data.lists);
        if (data.error && data.posts.length === 0) {
          setError(data.error);
        }
        // Server may clear invalid/demo list_id — refresh column row so title/dropdown match.
        if (
          column.type === "list" &&
          "listId" in data &&
          data.listId !== column.list_id
        ) {
          metaChangeRef.current?.();
        }
        if (data.source === "live" || opts?.force) {
          usageChangeRef.current?.();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    },
    [column.id, column.type, column.list_id],
  );

  useEffect(() => {
    // Cheap personal default: load once on open. No sub-minute auto-poll.
    loadFeed();
    const ms = PERSONAL_MODE.autoRefreshMs;
    if (ms <= 0) return;
    const t = setInterval(() => loadFeed(), ms);
    return () => clearInterval(t);
  }, [loadFeed]);

  useEffect(() => {
    if (column.type === "list" && lists.length === 0) {
      api.lists().then((r) => setLists(r.lists)).catch(() => {});
    }
  }, [column.type, lists.length]);

  return (
    <section className="deck-column">
      <header className="col-header">
        <div className="col-title-row">
          <h2 title={column.title}>{column.title}</h2>
          <span className="col-type">{column.type}</span>
          {fromCache && posts.length > 0 && (
            <span className="col-cache" title="Served from D1 cache">
              cached
            </span>
          )}
        </div>
        <div className="col-actions">
          <button
            className="icon-btn"
            title="Move left"
            disabled={!canMoveLeft}
            onClick={onMoveLeft}
          >
            ←
          </button>
          <button
            className="icon-btn"
            title="Move right"
            disabled={!canMoveRight}
            onClick={onMoveRight}
          >
            →
          </button>
          <button
            className="icon-btn"
            title="Refresh from X"
            onClick={() => loadFeed({ force: true })}
          >
            ↻
          </button>
          <button className="icon-btn" title="Remove column" onClick={onRemove}>
            ✕
          </button>
        </div>
      </header>

      {column.type === "keyword" && (
        <div className="col-toolbar">
          <select
            value={column.keyword_id ?? ""}
            onChange={(e) => {
              const kw = keywords.find((k) => k.id === e.target.value);
              if (kw) onBindKeyword(kw.id, `🔎 ${kw.phrase}`);
            }}
          >
            <option value="">Select keyword…</option>
            {keywords.map((k) => (
              <option key={k.id} value={k.id}>
                {k.phrase}
              </option>
            ))}
          </select>
        </div>
      )}

      {column.type === "list" && (
        <div className="col-toolbar">
          <select
            value={selectedListId}
            onChange={(e) => {
              const list = lists.find((l) => l.id === e.target.value);
              if (list) onBindList(list.id, `☰ ${list.name}`);
            }}
          >
            <option value="">Select list…</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {capped && (
        <div className="cap-banner">
          Monthly mention cap reached. Keyword polling paused until next period.
        </div>
      )}

      <div className="col-body">
        {loading && posts.length === 0 && (
          <p className="muted pad">Loading…</p>
        )}
        {needsXAccount && !loading && (
          <div className="col-empty pad">
            <p className="col-empty-title">Connect an X account</p>
            <p className="muted">
              This column has no connected account yet. Use Accounts in the side
              rail to connect X, then refresh.
            </p>
          </div>
        )}
        {!needsXAccount && error && posts.length === 0 && (
          <div className="col-empty pad">
            <p className="col-empty-title">Couldn’t load posts</p>
            <p className="error-text">{error}</p>
          </div>
        )}
        {!needsXAccount && !loading && posts.length === 0 && !error && (
          <div className="col-empty pad">
            <p className="col-empty-title">No posts</p>
            <p className="muted">
              {column.type === "list" && !selectedListId
                ? "Select a list above to load posts."
                : "Nothing to show right now."}
            </p>
          </div>
        )}
        {posts.map((p) => (
          <PostCard key={p.id} post={p} />
        ))}
      </div>
    </section>
  );
}
