import { Link } from "react-router-dom";
import { useAuth } from "../auth";

export function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="landing">
      <div className="landing-bg" aria-hidden />
      <header className="landing-nav">
        <span className="brand">xdeck</span>
        <nav>
          {user ? (
            <Link className="btn btn-primary" to="/app">
              Open deck
            </Link>
          ) : (
            <>
              <Link className="btn btn-ghost" to="/login">
                Sign in
              </Link>
              <Link className="btn btn-primary" to="/login">
                Try demo
              </Link>
            </>
          )}
        </nav>
      </header>

      <main className="landing-hero">
        <p className="brand-hero">xdeck</p>
        <h1>Multi-column X, without the chaos.</h1>
        <p className="lede">
          Classic TweetDeck energy for modern X — timelines, mentions, lists,
          and keyword brand listening in one dense, scrollable deck.
        </p>
        <div className="cta-row">
          <Link className="btn btn-primary btn-lg" to="/login">
            Enter the deck
          </Link>
          <a className="btn btn-ghost btn-lg" href="#features">
            What’s in v0
          </a>
        </div>
      </main>

      <section id="features" className="landing-features">
        <h2>Built for power users</h2>
        <p className="section-lede">
          X-only for v0. Brand listening across Reddit/LinkedIn comes later.
        </p>
        <ul className="feature-list">
          <li>
            <strong>Multi-account ready</strong>
            <span>Connect multiple X accounts; tokens stay encrypted server-side.</span>
          </li>
          <li>
            <strong>Keyword columns</strong>
            <span>Starter-plan caps: 3 keywords, 1,000 mentions/month — no surprise overages.</span>
          </li>
          <li>
            <strong>Cron polling</strong>
            <span>Keyword search on a slow cron; timelines are cache-first + manual refresh to keep X COGS low.</span>
          </li>
        </ul>
      </section>

      <footer className="landing-footer">
        <span>xdeck · codename · Cloudflare Workers + D1</span>
      </footer>
    </div>
  );
}
