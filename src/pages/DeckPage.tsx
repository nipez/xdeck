import { useCallback, useEffect, useState } from "react";
import type { DeckColumn, Keyword } from "@shared/types";
import { api } from "../api";
import { useAuth } from "../auth";
import { Column } from "../components/Column";
import { SideRail } from "../components/SideRail";

export function DeckPage() {
  const { user, usage, accounts, demoMode, refresh, logout } = useAuth();
  const [columns, setColumns] = useState<DeckColumn[]>([]);
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [panel, setPanel] = useState<"none" | "add" | "keywords" | "accounts">(
    "none",
  );

  const load = useCallback(async () => {
    const [cols, kws] = await Promise.all([api.columns(), api.keywords()]);
    setColumns(cols.columns);
    setKeywords(kws.keywords);
  }, []);

  useEffect(() => {
    load().catch((e) => setToast(String(e)));
  }, [load]);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("x_connected")) {
      setToast(`Connected @${q.get("x_connected")}`);
      window.history.replaceState({}, "", "/app");
      refresh();
      load().catch(() => {});
    }
    if (q.get("x_error")) {
      setToast(`X connect error: ${q.get("x_error")}`);
      window.history.replaceState({}, "", "/app");
    }
  }, [refresh, load]);

  async function addColumn(type: string) {
    setBusy(true);
    try {
      await api.addColumn({ type });
      await load();
      setPanel("none");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeColumn(id: string) {
    await api.deleteColumn(id);
    setColumns((c) => c.filter((x) => x.id !== id));
  }

  async function moveColumn(id: string, dir: -1 | 1) {
    const idx = columns.findIndex((c) => c.id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= columns.length) return;
    const next = [...columns];
    const [item] = next.splice(idx, 1);
    next.splice(j, 0, item);
    setColumns(next);
    await api.reorderColumns(next.map((c) => c.id));
  }

  async function addKeyword(phrase: string) {
    setBusy(true);
    try {
      await api.addKeyword(phrase);
      await api.pollKeywords();
      await load();
      await refresh();
      setToast(`Listening for “${phrase}”`);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function connectX() {
    setBusy(true);
    try {
      const res = await api.connectX();
      if (res.url) {
        window.location.href = res.url;
        return;
      }
      setToast(res.message || "Demo account connected");
      await refresh();
      setPanel("none");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="deck-shell">
      <SideRail
        user={user}
        usage={usage}
        accounts={accounts}
        demoMode={demoMode}
        onAdd={() => setPanel(panel === "add" ? "none" : "add")}
        onKeywords={() => setPanel(panel === "keywords" ? "none" : "keywords")}
        onAccounts={() => setPanel(panel === "accounts" ? "none" : "accounts")}
        onLogout={logout}
      />

      <div className="deck-main">
        <header className="deck-topbar">
          <div className="topbar-left">
            <span className="brand-inline">xdeck</span>
            {demoMode && <span className="badge badge-demo">Demo mode</span>}
            {usage?.capped && (
              <span className="badge badge-cap">Mentions capped</span>
            )}
            {usage?.readsCapped && (
              <span className="badge badge-cap">Reads capped</span>
            )}
          </div>
          <div className="topbar-right muted">
            {usage && (
              <span>
                {usage.readsUsed}/{usage.maxReadsPerMonth} reads ·{" "}
                {usage.mentionsUsed}/{usage.maxMentionsPerMonth} mentions ·{" "}
                {usage.keywordsUsed}/{usage.maxKeywords} keywords ·{" "}
                {usage.plan}
              </span>
            )}
          </div>
        </header>

        <div className="columns-scroller">
          {columns.map((col, i) => (
            <Column
              key={`${col.id}-${col.x_account_id ?? "none"}`}
              column={col}
              keywords={keywords}
              onRemove={() => removeColumn(col.id)}
              onMoveLeft={() => moveColumn(col.id, -1)}
              onMoveRight={() => moveColumn(col.id, 1)}
              canMoveLeft={i > 0}
              canMoveRight={i < columns.length - 1}
              onBindKeyword={async (keywordId, title) => {
                await api.patchColumn(col.id, {
                  keyword_id: keywordId,
                  title,
                });
                await load();
              }}
              onBindList={async (listId, title) => {
                await api.patchColumn(col.id, { list_id: listId, title });
                await load();
              }}
              onColumnMetaChange={load}
              onUsageMaybeChanged={() => {
                refresh().catch(() => {});
              }}
            />
          ))}
          {columns.length === 0 && (
            <div className="empty-deck">
              <p>No columns yet.</p>
              <button className="btn btn-primary" onClick={() => setPanel("add")}>
                Add a column
              </button>
            </div>
          )}
        </div>
      </div>

      {panel !== "none" && (
        <div className="drawer" role="dialog">
          <div className="drawer-head">
            <h2>
              {panel === "add" && "Add column"}
              {panel === "keywords" && "Keywords"}
              {panel === "accounts" && "X accounts"}
            </h2>
            <button className="icon-btn" onClick={() => setPanel("none")}>
              ✕
            </button>
          </div>

          {panel === "add" && (
            <div className="drawer-body stack">
              {(
                [
                  ["home", "Home timeline"],
                  ["mentions", "Mentions"],
                  ["list", "List"],
                  ["keyword", "Keyword / brand listen"],
                ] as const
              ).map(([type, label]) => (
                <button
                  key={type}
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() => addColumn(type)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {panel === "keywords" && (
            <KeywordsPanel
              keywords={keywords}
              busy={busy}
              onAdd={addKeyword}
              onDelete={async (id) => {
                await api.deleteKeyword(id);
                await load();
                await refresh();
              }}
              onPoll={async () => {
                const r = await api.pollKeywords();
                setToast(`Polled — ${r.inserted} new mentions`);
                await load();
                await refresh();
              }}
            />
          )}

          {panel === "accounts" && (
            <div className="drawer-body stack">
              {accounts.length === 0 && (
                <p className="muted">No X accounts connected.</p>
              )}
              {accounts.map((a) => (
                <div key={a.id} className="account-row">
                  <strong>@{a.username}</strong>
                  <span className="muted">{a.display_name}</span>
                </div>
              ))}
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={connectX}
              >
                {demoMode ? "Connect demo X account" : "Connect X account"}
              </button>
              {demoMode && (
                <p className="muted small">
                  Set <code>X_CLIENT_ID</code> / <code>X_CLIENT_SECRET</code> to
                  enable real OAuth 2.0 + PKCE.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {toast && (
        <div className="toast" onClick={() => setToast(null)}>
          {toast}
        </div>
      )}
    </div>
  );
}

function KeywordsPanel({
  keywords,
  busy,
  onAdd,
  onDelete,
  onPoll,
}: {
  keywords: Keyword[];
  busy: boolean;
  onAdd: (phrase: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onPoll: () => Promise<void>;
}) {
  const [phrase, setPhrase] = useState("");
  return (
    <div className="drawer-body stack">
      <form
        className="row-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!phrase.trim()) return;
          onAdd(phrase.trim()).then(() => setPhrase(""));
        }}
      >
        <input
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          placeholder='e.g. "xdeck" or brand name'
        />
        <button className="btn btn-primary" disabled={busy} type="submit">
          Add
        </button>
      </form>
      <ul className="kw-list">
        {keywords.map((k) => (
          <li key={k.id}>
            <span>{k.phrase}</span>
            <button className="icon-btn" onClick={() => onDelete(k.id)}>
              ✕
            </button>
          </li>
        ))}
        {keywords.length === 0 && (
          <li className="muted">No keywords yet — add up to 3 on Starter.</li>
        )}
      </ul>
      <button className="btn btn-secondary" onClick={onPoll} disabled={busy}>
        Poll now
      </button>
    </div>
  );
}
