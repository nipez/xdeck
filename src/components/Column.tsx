import { useCallback, useEffect, useState } from "react";
import type { DeckColumn, DeckPost, Keyword } from "@shared/types";
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
}) {
  const [posts, setPosts] = useState<DeckPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [capped, setCapped] = useState(false);
  const [lists, setLists] = useState<Array<{ id: string; name: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  const loadFeed = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.feed(column.id);
      setPosts(data.posts);
      setCapped(!!data.capped);
      if (data.lists) setLists(data.lists);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [column.id]);

  useEffect(() => {
    loadFeed();
    // Timeline columns: light client poll; keyword relies more on cron/cache
    const ms = column.type === "keyword" ? 60_000 : 45_000;
    const t = setInterval(loadFeed, ms);
    return () => clearInterval(t);
  }, [loadFeed, column.type]);

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
          <button className="icon-btn" title="Refresh" onClick={loadFeed}>
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
            value={column.list_id ?? ""}
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
        {error && <p className="error-text pad">{error}</p>}
        {!loading && posts.length === 0 && !error && (
          <p className="muted pad">No posts yet.</p>
        )}
        {posts.map((p) => (
          <PostCard key={p.id} post={p} />
        ))}
      </div>
    </section>
  );
}
