import type { DeckPost } from "@shared/types";

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function PostCard({ post }: { post: DeckPost }) {
  const initial = (post.authorName || post.authorUsername || "?").charAt(0);

  return (
    <article className="post">
      <div className="post-avatar" aria-hidden>
        {post.authorAvatar ? (
          <img src={post.authorAvatar} alt="" />
        ) : (
          <span>{initial.toUpperCase()}</span>
        )}
      </div>
      <div className="post-main">
        <header className="post-meta">
          <strong>{post.authorName}</strong>
          <span className="muted">@{post.authorUsername}</span>
          <span className="muted">· {timeAgo(post.postedAt)}</span>
          {post.source === "demo" && <span className="src-tag">demo</span>}
          {post.source === "cache" && <span className="src-tag">cached</span>}
        </header>
        <p className="post-text">{post.text}</p>
        <footer className="post-footer">
          <span className="muted">
            {post.replyCount ?? 0} · {post.repostCount ?? 0} ·{" "}
            {post.likeCount ?? 0}
          </span>
          <a
            className="reply-link"
            href={`https://x.com/intent/tweet?in_reply_to=${post.id}`}
            target="_blank"
            rel="noreferrer"
            title="Reply on X"
          >
            Reply on X ↗
          </a>
        </footer>
      </div>
    </article>
  );
}
