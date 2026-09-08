import type { SessionUser, UsageStatus, XAccount } from "@shared/types";
import { Link } from "react-router-dom";
import { formatRailHandle } from "../activeAccount";

export function SideRail({
  user,
  usage,
  activeAccount,
  demoMode,
  onAdd,
  onKeywords,
  onAccounts,
  onLogout,
}: {
  user: SessionUser | null;
  usage: UsageStatus | null;
  activeAccount: XAccount | null;
  demoMode: boolean;
  onAdd: () => void;
  onKeywords: () => void;
  onAccounts: () => void;
  onLogout: () => void;
}) {
  const fullHandle = activeAccount ? `@${activeAccount.username}` : null;

  return (
    <aside className="side-rail">
      <Link to="/" className="rail-brand" title="xdeck home">
        xd
      </Link>
      <nav className="rail-nav">
        <button className="rail-btn" title="Add column" onClick={onAdd}>
          +
        </button>
        <button className="rail-btn" title="Keywords" onClick={onKeywords}>
          🔎
        </button>
        <button className="rail-btn" title="X accounts" onClick={onAccounts}>
          @
        </button>
      </nav>
      <div className="rail-foot">
        <div
          className="rail-avatar"
          title={user?.email || "user"}
          data-demo={demoMode ? "1" : "0"}
        >
          {(user?.displayName || user?.email || "?").charAt(0).toUpperCase()}
        </div>
        {activeAccount && fullHandle && (
          <button
            type="button"
            className="rail-acct muted"
            title={`${fullHandle} — switch account`}
            aria-label={`Active account ${fullHandle}. Open accounts panel.`}
            onClick={onAccounts}
          >
            <span className="rail-acct-text">
              {formatRailHandle(activeAccount.username)}
            </span>
          </button>
        )}
        {usage?.capped && <span className="rail-cap">CAP</span>}
        <button className="rail-btn rail-logout" title="Log out" onClick={onLogout}>
          ⎋
        </button>
      </div>
    </aside>
  );
}
