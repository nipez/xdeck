import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

export function LoginPage() {
  const { refresh, user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [magicUrl, setMagicUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    params.get("error") ? `Sign-in error: ${params.get("error")}` : null,
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) navigate("/app", { replace: true });
  }, [user, navigate]);

  async function onMagic(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.magicLink(email);
      if (res.magicUrl) setMagicUrl(res.magicUrl);
      else setMagicUrl(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDemo() {
    setBusy(true);
    setError(null);
    try {
      await api.demoLogin();
      await refresh();
      navigate("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <Link to="/" className="brand">
          xdeck
        </Link>
        <h1>Sign in</h1>
        <p className="muted">
          Magic-link auth for Workers. Without an email provider, the link is
          shown here so local demos work.
        </p>

        <form onSubmit={onMagic} className="stack">
          <label>
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
            />
          </label>
          <button className="btn btn-primary" disabled={busy} type="submit">
            {busy ? "Sending…" : "Send magic link"}
          </button>
        </form>

        {magicUrl && (
          <div className="magic-inbox">
            <p>
              <strong>Demo inbox</strong> — click to verify:
            </p>
            <a href={magicUrl}>{magicUrl}</a>
          </div>
        )}

        <div className="or-rule">or</div>

        <button
          className="btn btn-secondary"
          type="button"
          disabled={busy}
          onClick={onDemo}
        >
          Continue with demo account
        </button>

        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  );
}
