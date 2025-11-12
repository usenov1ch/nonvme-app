// components/PostCard.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Heart, MessageCircle } from "lucide-react";
import { logDebug } from '../lib/debug'

export type PollOption = { id: string; text: string; votes?: number };

export type PostCardProps = {
  id: string;
  topic?: string;
  author?: string;
  title?: string;
  content?: string;
  imageUrl?: string | null;
  pollOptions?: PollOption[];
  className?: string;
  collapsedOverlayRatio?: number;
  /**
   * onVote(postId, optionId) -> optional:
   * - can return void
   * - or return countsMap (Record<optionId, count>)
   * - or return { countsMap?, myVote? } where myVote is optionId or null
   */
  onVote?: (
    postId: string,
    optionId: string
  ) => Promise<
    | { countsMap?: Record<string, number>; myVote?: string | null }
    | Record<string, number>
    | void
  >
  | void;
  initialVote?: string | null; // if feed passes initial user's vote
  onCommentClick?: (postId: string) => void;
};

export default function PostCard({
  id,
  topic,
  author,
  title = "",
  content = "",
  imageUrl,
  pollOptions = [],
  className = "",
  collapsedOverlayRatio = 0.45,
  onVote,
  onCommentClick,
  initialVote = null,
}: PostCardProps) {
  // UI states
  const [expanded, setExpanded] = useState(false);
  const [votedOption, setVotedOption] = useState<string | null>(initialVote ?? null);
  const [pending, setPending] = useState(false);

  // compute counts map from props
  const computeInitialCounts = (opts: PollOption[]) => {
    const acc: Record<string, number> = {};
    opts.forEach((o) => (acc[o.id] = Number(o.votes ?? 0)));
    return acc;
  };

  const initialCounts = useMemo(() => computeInitialCounts(pollOptions), [JSON.stringify(pollOptions)]);
  const [localCounts, setLocalCounts] = useState<Record<string, number>>(initialCounts);

  // sync localCounts if pollOptions change (server refresh)
  useEffect(() => {
    setLocalCounts(computeInitialCounts(pollOptions));
  }, [JSON.stringify(pollOptions)]);

  useEffect(() => {
    if (typeof initialVote !== 'undefined') {
      setVotedOption(initialVote ?? null)
    }
  }, [initialVote])


  const totalVotes = useMemo(() => Object.values(localCounts).reduce((s, v) => s + (v || 0), 0), [localCounts]);

  const hasLongText = (content ?? "").length > 120;
  const shouldShowToggle = hasLongText || pollOptions.length > 0;

  const handleToggle = () => setExpanded((s) => !s);

  /**
   * Core vote handler:
   * - single vote behavior: if already voted, block further clicks
   * - optimistic increment locally and set votedOption
   * - call onVote; if onVote returns authoritative countsMap, apply it
   * - do NOT clear votedOption unless server explicitly returns myVote === null
   */
  const handleVoteClick = async (optionId: string) => {
    await logDebug('PostCard.voteClick', { postId: id, optionId })
    if (!onVote) {
      // no backend hook - still perform local optimistic update so UX works
      if (!votedOption) {
        setLocalCounts((prev) => ({ ...prev, [optionId]: (prev[optionId] || 0) + 1 }));
        setVotedOption(optionId);
      }
      return;
    }

    if (pending) return;
    if (votedOption) {
      // already voted; single-vote mode for now
      console.debug("[PostCard] vote ignored — already voted", votedOption);
      return;
    }

    setPending(true);
    console.log("[PostCard] vote click", { postId: id, optionId });

    // optimistic update
    setLocalCounts((prev) => ({ ...prev, [optionId]: (prev[optionId] || 0) + 1 }));
    setVotedOption(optionId);

    try {
      const res = await onVote(id, optionId);

      // normalize response
      let countsMap: Record<string, number> | undefined = undefined;
      let myVote: string | null | undefined = undefined;

      if (res && typeof res === "object") {
        if ((res as any).countsMap !== undefined) {
          countsMap = (res as any).countsMap;
          myVote = (res as any).myVote;
        } else {
          // feed might return countsMap directly
          countsMap = res as Record<string, number>;
        }
      }

      // apply server counts if present (authoritative)
      if (countsMap && typeof countsMap === "object") {
        setLocalCounts((prev) => {
          const next = { ...prev };
          Object.keys(countsMap!).forEach((k) => (next[k] = Number(countsMap![k] ?? 0)));
          return next;
        });
      }

      // only override votedOption if server explicitly returns myVote (including null)
      if (typeof myVote !== "undefined") {
        setVotedOption(myVote ?? null);
      } else {
        // keep optimistic votedOption (do nothing)
      }

      console.log("[PostCard] vote success", { countsMap, myVote });
    } catch (err) {
      console.error("[PostCard] vote failed, rolling back optimistic update", err);
      // rollback optimistic
      setLocalCounts((prev) => {
        const next = { ...prev };
        next[optionId] = Math.max((next[optionId] || 1) - 1, 0);
        return next;
      });
      setVotedOption(null);
    } finally {
      setPending(false);
    }
  };

  const getPercent = (optId: string) => {
    const v = localCounts[optId] ?? 0;
    if (totalVotes === 0) return 0;
    return Math.round((v / totalVotes) * 100);
  };

  const overlayStart = String(Math.max(0, Math.min(1, collapsedOverlayRatio)));

  return (
    <article
      className={`postcard ${expanded ? "expanded" : "collapsed"} ${className}`}
      aria-labelledby={`post-${id}-title`}
      role="article"
    >
      <div className="media" aria-hidden={!!imageUrl ? false : true}>
        {imageUrl ? (
          <img src={imageUrl} alt={title || "post image"} className="post-img" loading="lazy" />
        ) : (
          <div className="image-fallback" />
        )}
      </div>

      <div className="overlay" style={{ ["--overlay-start" as any]: overlayStart }}>
        <div className="text-bg">
          <div className="text-inner">
            <header className="meta" aria-hidden={false}>
              {topic && <span className="topic">{topic}</span>}
              {author && <span className="author">• {author}</span>}
            </header>

            <h3 id={`post-${id}-title`} className="title">{title}</h3>

            <div className="body">
              <p className="content" id={`post-${id}-content`} aria-expanded={expanded}>{content}</p>

              <div className={`poll-panel ${expanded ? "open" : "closed"}`} aria-hidden={!expanded && !shouldShowToggle}>
                <div className="poll-panel-inner">
                  <div className={`poll ${expanded ? "visible" : "hidden"}`} role="group" aria-label="Варианты опроса">
                    {pollOptions.map((opt) => {
                      const votes = localCounts[opt.id] ?? 0;
                      const percent = getPercent(opt.id);
                      const voted = votedOption === opt.id;
                      return (
                        <div key={opt.id} className="poll-row">
                          <button
                            className={`poll-btn ${voted ? "voted" : ""}`}
                            onClick={() => handleVoteClick(opt.id)}
                            disabled={pending || !!votedOption}
                            aria-pressed={voted}
                            title={voted ? "Вы проголосовали" : "Проголосовать"}
                          >
                            <span className="btn-text">{opt.text}</span>
                            <span className="btn-count">{votes > 0 ? votes : ""}</span>
                          </button>

                          <div className="progress" aria-hidden>
                            <div className="progress-inner" style={{ width: `${percent}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              {/* end poll-panel */}
            </div>
          </div>

          <footer className="actions" aria-hidden={false}>
            <div className="actions-left">
              <button className="action-btn like-btn" title="Лайк" aria-label="Лайк">
                <Heart size={20} />
              </button>

              <button
                className="action-btn comment-btn"
                title="Комментарии"
                aria-label="Комментарии"
                onClick={() => onCommentClick?.(id)}
              >
                <MessageCircle size={20} />
              </button>
            </div>
          </footer>

          {shouldShowToggle && (
            <button className="toggle" onClick={handleToggle} aria-expanded={expanded} aria-controls={`post-${id}-content`} disabled={pending}>
              <svg className="chev" width="14" height="8" viewBox="0 0 14 8" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                <path d="M1 1L7 7L13 1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}

        </div>
      </div>

      <style jsx>{`
        .postcard {
          position: relative;
          width: 100%;
          max-width: 720px;
          margin: 14px auto;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 14px 34px rgba(2,6,12,0.65);
          background: #0f0f10;
          color: #fff;
        }

        .media { position: relative; height: 360px; background: #111; }
        .post-img { width: 100%; height: 100%; display: block; object-fit: cover; }
        .image-fallback { width: 100%; height: 100%; background: linear-gradient(135deg,#2b2b2b 0%,#131313 100%); }

        .overlay { position: absolute; inset: 0; pointer-events: none; }
        .text-bg {
          --s: calc(var(--overlay-start,0.45) * 100%);
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          top: var(--s);
          background: rgba(0,0,0,0.56);
          backdrop-filter: blur(2px);
          border-top-left-radius: 16px;
          border-top-right-radius: 16px;
          transition: top 420ms cubic-bezier(0.22,1,0.36,1), background 220ms;
          pointer-events: auto;
        }
        .expanded .text-bg { top: 12px; background: rgba(0,0,0,0.78); }

        .text-inner { padding: 18px 18px 76px 18px; color: #fff; text-shadow: 0 3px 10px rgba(0,0,0,0.6); position: relative; }

        .meta { display: flex; gap: 8px; align-items: center; font-size: 13px; color: rgba(255,255,255,0.95); }
        .topic { background: rgba(255,255,255,0.06); padding: 4px 8px; border-radius: 999px; font-weight: 700; font-size: 13px; }
        .title { margin: 6px 0 0 0; font-size: 20px; font-weight: 800; }
        .body { margin-top: 8px; }
        .content { margin: 6px 0 0 0; color: rgba(255,255,255,0.96); font-size: 15px; line-height: 1.45; overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; }
        .collapsed .content { -webkit-line-clamp: 3; max-height: 4.6em; }
        .expanded .content { -webkit-line-clamp: unset; max-height: none; }

        .poll-panel { margin-top: 12px; width: 100%; display: block; }
        .poll-panel-inner {
          background: rgba(8,8,10,0.62);
          border-radius: 14px;
          padding: 14px;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.02);
        }
        .expanded .poll-panel-inner { background: rgba(8,8,10,0.72); }

        .poll { display: flex; flex-direction: column; gap: 10px; transition: all .26s ease; }
        .poll.hidden { opacity:0; height:0; overflow:hidden; pointer-events:none; transform:translateY(6px); }
        .poll.visible { opacity:1; height:auto; pointer-events:auto; transform:translateY(0); }

        .poll-row { display: flex; flex-direction: column; gap: 8px; }

        .poll-btn {
          width: 100%;
          text-align: left;
          padding: 12px 14px;
          border-radius: 10px;
          background: #f5f5f5;
          color: #121212;
          font-weight: 700;
          border: none;
          box-shadow: 0 2px 6px rgba(0,0,0,0.08);
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .poll-btn:disabled { opacity: 0.8; cursor: default; }
        .poll-btn.voted { outline: 2px solid rgba(124,92,255,0.95); }

        .btn-text { flex: 1; }
        .btn-count { min-width: 36px; text-align: right; font-weight: 700; color: #111; }

        .progress { height: 8px; background: rgba(255,255,255,0.06); border-radius: 8px; overflow: hidden; margin-top: 4px; }
        .progress-inner { height: 100%; background: linear-gradient(90deg, rgba(124,92,255,0.95), rgba(124,92,255,0.6)); width: 0%; transition: width 420ms ease; border-radius: 8px; }

        .actions { position: absolute; left: 16px; bottom: 14px; display: flex; justify-content: flex-start; gap: 14px; pointer-events: auto; }
        .actions-left { display: flex; gap: 12px; }

        .action-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 38px;
          height: 38px;
          background: rgba(255,255,255,0.08);
          border: none;
          border-radius: 50%;
          cursor: pointer;
          color: rgba(255,255,255,0.9);
          transition: all 0.25s ease;
          backdrop-filter: blur(6px);
          box-shadow: 0 2px 8px rgba(0,0,0,0.25);
        }
        .action-btn:hover { background: rgba(255,255,255,0.15); transform: scale(1.08); }
        .like-btn svg { color: #ff4d6d; }
        .comment-btn svg { color: #7c5cff; }

        .toggle { position: absolute; right: 18px; bottom: 12px; z-index: 6; display: inline-flex; gap: 8px; align-items: center; padding: 8px 12px; background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02)); border-radius: 999px; color: #fff; border: 0; box-shadow: 0 8px 22px rgba(0,0,0,0.45); cursor: pointer; font-weight: 700; }
        .chev { transition: transform .22s ease; } .expanded .chev { transform: rotate(180deg); }

        @media (max-width: 768px) {
          .media { height: 420px; }
          .text-inner { padding-bottom: 88px; }
          .title { font-size: 18px; }
        }
      `}</style>
    </article>
  );
}
