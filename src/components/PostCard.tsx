import type { ReactNode } from "react";
import type { DeckPost } from "@shared/types";

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/** Compact counts like classic X/TweetDeck (603, 1.5K, 55K, 1.2M). */
function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) {
    const k = n / 1000;
    const rounded = Math.round(k * 10) / 10;
    return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}K`;
  }
  if (n < 1_000_000) return `${Math.round(n / 1000)}K`;
  const m = n / 1_000_000;
  const rounded = Math.round(m * 10) / 10;
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}M`;
}

function IconReply() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M14.046 2.242l-4.148-.01h-.002c-4.374 0-7.8 3.427-7.8 7.802 0 4.098 3.186 7.206 7.465 7.37v3.828c0 .108.044.286.12.403.142.225.384.347.632.347.138 0 .277-.038.402-.118.264-.168 6.473-4.14 8.088-5.506 1.902-1.61 3.04-3.93 3.04-6.312 0-4.697-3.788-8.312-8.243-8.312h.002z"
        fill="currentColor"
      />
    </svg>
  );
}

function IconRepost() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M23.77 15.67c-.292-.293-.767-.293-1.06 0l-2.22 2.22V7.65c0-2.068-1.683-3.75-3.75-3.75h-5.85c-.414 0-.75.336-.75.75s.336.75.75.75h5.85c1.24 0 2.25 1.01 2.25 2.25v10.24l-2.22-2.22c-.293-.293-.768-.293-1.06 0s-.294.768 0 1.06l3.5 3.5c.145.147.337.22.53.22s.383-.072.53-.22l3.5-3.5c.294-.292.294-.767 0-1.06zm-10.66 3.28H7.26c-1.24 0-2.25-1.01-2.25-2.25V6.46l2.22 2.22c.148.147.34.22.532.22s.384-.073.53-.22c.293-.293.293-.768 0-1.06l-3.5-3.5c-.293-.294-.768-.294-1.06 0l-3.5 3.5c-.294.292-.294.767 0 1.06s.767.293 1.06 0l2.22-2.22V16.7c0 2.068 1.683 3.75 3.75 3.75h5.85c.414 0 .75-.336.75-.75s-.336-.75-.75-.75z"
        fill="currentColor"
      />
    </svg>
  );
}

function IconLike() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M12 21.638h-.014C9.403 21.59 1.95 14.856 1.95 8.478c0-3.064 2.525-5.754 5.403-5.754 2.29 0 3.83 1.58 4.646 2.73.814-1.148 2.354-2.73 4.645-2.73 2.88 0 5.404 2.69 5.404 5.755 0 6.376-7.454 13.11-10.037 13.157H12zM7.354 4.225c-1.756 0-3.901 1.708-3.901 4.253 0 5.367 6.026 11.015 8.547 11.187 2.52-.172 8.544-5.821 8.544-11.187 0-2.545-2.145-4.253-3.9-4.253-2.439 0-3.89 2.932-3.905 2.967-.23.562-1.156.562-1.387 0-.015-.035-1.465-2.967-3.898-2.967z"
        fill="currentColor"
      />
    </svg>
  );
}

function IconViews() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M8.75 21V3h2v18h-2zM18 21V8.5h2V21h-2zM4 21l.004-10h2L6 21H4zm9.248 0v-7h2v7h-2z"
        fill="currentColor"
      />
    </svg>
  );
}

function Metric({
  label,
  count,
  icon,
}: {
  label: string;
  count: number;
  icon: ReactNode;
}) {
  return (
    <span className="post-metric" title={label} aria-label={`${formatCount(count)} ${label}`}>
      {icon}
      <span className="post-metric-count">{formatCount(count)}</span>
    </span>
  );
}

export function PostCard({ post }: { post: DeckPost }) {
  const initial = (post.authorName || post.authorUsername || "?").charAt(0);
  const showImpressions =
    typeof post.impressionCount === "number" && post.impressionCount >= 0;

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
          <div className="post-metrics" role="group" aria-label="Engagement">
            <Metric label="replies" count={post.replyCount ?? 0} icon={<IconReply />} />
            <Metric label="reposts" count={post.repostCount ?? 0} icon={<IconRepost />} />
            <Metric label="likes" count={post.likeCount ?? 0} icon={<IconLike />} />
            {showImpressions && (
              <Metric
                label="views"
                count={post.impressionCount!}
                icon={<IconViews />}
              />
            )}
          </div>
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
