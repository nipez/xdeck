import type { SessionUser, UsageStatus, XAccount } from "@shared/types";
import { Link } from "react-router-dom";

export function SideRail({
  user,
  usage,
  accounts,
  demoMode,
  onAdd,
  onKeywords,
  onAccounts,
  onLogout,
}: {
  user: SessionUser | null;
  usage: UsageStatus | null;
  accounts: XAccount[];
  demoMode: boolean;
  onAdd: () => void;
  onKeywords: () => void;
  onAccounts: () => void;
  onLogout: () => void;
}) {
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
        {accounts[0] && (
          <span className="rail-acct muted" title={`@${accounts[0].username}`}>
            @{accounts[0].username.slice(0, 4)}
          </span>
        )}
        {usage?.capped && <span className="rail-cap">CAP</span>}
        <button className="rail-btn rail-logout" title="Log out" onClick={onLogout}>
          ⎋
        </button>
      </div>
    </aside>
  );
}
