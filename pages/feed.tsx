// pages/feed.tsx
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import BottomNav from '../components/BottomNav'
import Billboard from '../components/Billboard'
import CommentSection from '../components/CommentSection'
import PostCard, { PollOption } from '../components/PostCard';
import { logDebug } from '../lib/debug'

declare global { interface Window { Telegram?: any } }

type Poll = {
  id: string
  title?: string
  question: string
  media_url: string | null
  created_at: string
  topic_id?: string | null
}

type Option = {
  id: string
  text: string
  poll_id: string
  votes?: number
}

type Topic = { id: string; title: string; code: string }

export default function FeedPage() {
  const [polls, setPolls] = useState<Poll[]>([])
  const [optionsMap, setOptionsMap] = useState<Record<string, Option[]>>({})
  const [myVotes, setMyVotes] = useState<Record<string, string | null>>({})
  const [loading, setLoading] = useState(true)

  const [topics, setTopics] = useState<Topic[]>([])
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null)

  const [myFeed, setMyFeed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    const v = localStorage.getItem('myFeed')
    return v === '1'
  })

  // identity: prefer telegram id, fallback to anonymous id
  const [tgId, setTgId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem('tgId') ?? null
  })
  const [anonId, setAnonId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem('anonId') ?? null
  })

  const postRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // Pending flags per poll to prevent double-submit
  const pendingRef = useRef<Record<string, boolean>>({})
  const setPendingForPoll = (pollId: string, v: boolean) => { pendingRef.current = { ...pendingRef.current, [pollId]: v } }

  // lastLocalVoteRef used to ignore our own realtime events (simple dedupe)
  const lastLocalVoteRef = useRef<{ pollId: string; optionId: string | null; ts: number } | null>(null)

  // which polls have comment section open
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({})

  // recentVoted: visual confirmation per poll that vote was saved (prevents UX feeling "blink and disappear")
  const [recentVoted, setRecentVoted] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (typeof window === 'undefined') return

    // ensure anonId
    let storedAnon = localStorage.getItem('anonId')
    if (!storedAnon) {
      storedAnon = (typeof crypto !== 'undefined' && (crypto as any).randomUUID)
        ? (crypto as any).randomUUID()
        : 'anon-' + Math.random().toString(36).slice(2, 12)
      localStorage.setItem('anonId', storedAnon)
    }
    // keep state for other parts that might read it, but main loader won't depend on it now
    setAnonId(storedAnon)

    // Telegram WebApp: try to get user id and persist it (if present)
    try {
      const u = window.Telegram?.WebApp?.initDataUnsafe?.user ?? null
      if (u?.id) {
        const t = String(u.id)
        setTgId(t)
        localStorage.setItem('tgId', t)
      } else {
        const storedT = localStorage.getItem('tgId')
        if (storedT) setTgId(storedT)
      }
    } catch (e) {
      // ignore
    }
  }, [])

  // load topics
  useEffect(() => {
    let cancel = false
    ;(async () => {
      try {
        const { data } = await supabase
          .from('topics')
          .select('id,title,code')
          .order('position', { ascending: true })
        if (!cancel) {
          setTopics(data ?? [])
          if (!myFeed && !selectedTopicId && (data?.length ?? 0) > 0) {
            setSelectedTopicId(data![0].id)
          }
        }
      } catch (e) {
        console.error('[topics load] error', e)
      }
    })()
    return () => { cancel = true }
  }, [myFeed])

  // main load: polls + options + current user's votes (myVotes)
  // NOTE: intentionally NOT depending on anonId to avoid unwanted refetches when anonId is set/updated locally.
  useEffect(() => {
    let cancel = false
    ;(async () => {
      setLoading(true)
      try {
        let pollsData: Poll[] = []

        if (myFeed) {
          if (!tgId) { setLoading(false); return }
          const { data: myTopics } = await supabase
            .from('user_feed_topics')
            .select('topic_id')
            .eq('telegram_id', tgId)

          const ids = (myTopics ?? []).map(r => r.topic_id).filter(Boolean)
          if (ids.length === 0) {
            setPolls([])
            setOptionsMap({})
            setLoading(false)
            return
          }

          const { data, error } = await supabase
            .from('polls')
            .select('*')
            .in('topic_id', ids)
            .order('created_at', { ascending: false })

          if (error) throw error
          pollsData = data as any
        } else {
          let query = supabase.from('polls').select('*').order('created_at', { ascending: false })
          if (selectedTopicId) query = query.eq('topic_id', selectedTopicId)
          const { data, error } = await query
          if (error) throw error
          pollsData = data as any
        }

        if (cancel) return
        setPolls(pollsData || [])

        const ids = pollsData.map(p => p.id)
        if (ids.length) {
          const { data: optionsData } = await supabase
            .from('poll_options')
            .select('*')
            .in('poll_id', ids)

          const grouped: Record<string, Option[]> = {}
          optionsData?.forEach(opt => {
            if (!grouped[opt.poll_id]) grouped[opt.poll_id] = []
            // ensure votes field exists (avoid undefined overwriting optimistic counts)
            grouped[opt.poll_id].push({ ...opt, votes: (opt as any).votes ?? 0 })
          })
          if (!cancel) setOptionsMap(grouped)
        } else {
          if (!cancel) setOptionsMap({})
        }

        // --- load current user's votes for these polls and set myVotes ---
        if (ids.length) {
          try {
            const telegram_id = tgId || null
            // read anonId from localStorage here to avoid depending on state change
            const anonymous_id = (typeof window !== 'undefined') ? (localStorage.getItem('anonId') ?? null) : (anonId || null)

            let q = supabase.from('poll_votes').select('poll_id, option_id').in('poll_id', ids)
            // If we have both, use OR to be safe (fetch votes matching either identity)
            if (telegram_id && anonymous_id) {
              q = q.or(`telegram_id.eq.${telegram_id},anonymous_id.eq.${anonymous_id}`)
            } else if (telegram_id) {
              q = q.eq('telegram_id', telegram_id)
            } else if (anonymous_id) {
              q = q.eq('anonymous_id', anonymous_id)
            } else {
              q = null as any
            }

            if (q) {
              const { data: myVotesData, error: myVotesError } = await q
              if (myVotesError) {
                console.warn('Failed to load my votes', myVotesError)
              } else {
                const myMap: Record<string, string | null> = {}
                (myVotesData ?? []).forEach((r: any) => {
                  if (r.poll_id) myMap[r.poll_id] = r.option_id ?? null
                })
                if (!cancel) setMyVotes(prev => ({ ...prev, ...myMap }))
              }
            }
          } catch (err) {
            console.warn('Error fetching myVotes', err)
          }
        }

      } catch (e) {
        console.error('Ошибка загрузки ленты:', e)
      } finally {
        if (!cancel) setLoading(false)
      }
    })()
    return () => { cancel = true }
    // note: intentionally not including anonId here to avoid destructive refetches when anonId gets set locally
  }, [myFeed, selectedTopicId, tgId])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('myFeed', myFeed ? '1' : '0')
    }
  }, [myFeed])

  // Helper: fetch aggregated counts for a poll and update optionsMap
  const fetchAndSetCounts = async (postId: string) => {
    try {
      const { data: countsData, error: countsError } = await supabase
        .from('poll_votes')
        .select('option_id, count()', { count: 'exact' })
        .eq('poll_id', postId)
        .group('option_id')

      if (countsError) {
        console.warn('[fetchAndSetCounts] error', countsError)
        return
      }

      const countsMap: Record<string, number> = {}
      (countsData ?? []).forEach((r: any) => { countsMap[r.option_id] = Number(r.count) })

      setOptionsMap(prev => {
        const next = { ...prev }
        if (next[postId]) {
          next[postId] = next[postId].map(o => ({ ...o, votes: countsMap[o.id] ?? 0 }))
        }
        return next
      })
    } catch (e) {
      console.error('[fetchAndSetCounts] unexpected', e)
    }
  }

  /**
   * handleVote:
   * - optimistic UI update
   * - upsert/delete row into poll_votes (poll_id, option_id, telegram_id/anonymous_id)
   * - fetch canonical counts and update optionsMap & myVotes (but avoid stomping optimistic UI if it's our own recent action)
   */
  const handleVote = async (postId: string, optionId: string | null) => {
    try { await (async () => { try { await logDebug?.('handleVote.start', { postId, optionId, tgId, anonId }) } catch(_){} })() } catch(_) {}
    console.log('[handleVote] start', { postId, optionId, tgId, anonId });

    // Guard double submit
    if (pendingRef.current[postId]) {
      console.log('[handleVote] already pending', postId);
      return null;
    }
    setPendingForPoll(postId, true);

    // set visual confirmation flag right away
    setRecentVoted(prev => ({ ...prev, [postId]: true }))

    const prevMyVote = myVotes[postId] ?? null;

    // ensure anonId if needed
    let telegram_id = tgId || null;
    let anonymous_id = (typeof window !== 'undefined') ? (localStorage.getItem('anonId') ?? anonId ?? null) : anonId ?? null;
    if (!telegram_id && !anonymous_id && typeof window !== 'undefined') {
      const generated = (typeof crypto !== 'undefined' && (crypto as any).randomUUID)
        ? (crypto as any).randomUUID()
        : 'anon-' + Math.random().toString(36).slice(2, 12);
      localStorage.setItem('anonId', generated);
      // IMPORTANT: do NOT call setAnonId here to avoid triggering the main polls loader.
      anonymous_id = generated;
    }

    // Optimistic UI update
    setOptionsMap(prev => {
      const next = { ...prev };
      if (!next[postId]) return prev;
      const opts = next[postId].map(o => ({ ...o }));
      if (prevMyVote) {
        const idx = opts.findIndex(x => x.id === prevMyVote);
        if (idx !== -1) opts[idx].votes = Math.max(0, (opts[idx].votes ?? 0) - 1);
      }
      if (optionId) {
        const idx2 = opts.findIndex(x => x.id === optionId);
        if (idx2 !== -1) opts[idx2].votes = (opts[idx2].votes ?? 0) + 1;
      }
      next[postId] = opts;
      return next;
    });
    setMyVotes(prev => ({ ...prev, [postId]: optionId ?? null }));

    // mark local action to ignore realtime echo briefly
    lastLocalVoteRef.current = { pollId: postId, optionId, ts: Date.now() };

    try {
      // DB change: do upsert or delete, but use select() after to get canonical DB state
      if (optionId === null) {
        // delete vote
        const delQuery = telegram_id
          ? supabase.from('poll_votes').delete().match({ poll_id: postId, telegram_id })
          : supabase.from('poll_votes').delete().match({ poll_id: postId, anonymous_id });

        const { data: delData, error: delError } = await delQuery.select();
        if (delError) throw delError;
      } else {
        const payload: any = { poll_id: postId, option_id: optionId };
        if (telegram_id) payload.telegram_id = telegram_id;
        else payload.anonymous_id = anonymous_id;

        const onConflictCols = telegram_id ? ['poll_id','telegram_id'] : ['poll_id','anonymous_id'];

        const { data: upsertData, error: upsertError } = await supabase
          .from('poll_votes')
          .upsert([payload], { onConflict: onConflictCols })
          .select();

        if (upsertError) throw upsertError;
      }

      // --- IMMEDIATE authoritative fetches (important) ---
      // 1) canonical counts for this poll
      const { data: countsData, error: countsError } = await supabase
        .from('poll_votes')
        .select('option_id, count()', { count: 'exact' })
        .eq('poll_id', postId)
        .group('option_id');

      if (countsError) {
        console.warn('[handleVote] counts fetch error', countsError);
      }
      const countsMap: Record<string, number> = {};
      (countsData ?? []).forEach((r: any) => { countsMap[r.option_id] = Number(r.count); });

      // 2) canonical myVote for this identity
      let myVote: string | null = null;
      try {
        let q = supabase.from('poll_votes').select('option_id').eq('poll_id', postId);
        if (telegram_id) q = q.eq('telegram_id', telegram_id);
        else q = q.eq('anonymous_id', anonymous_id);
        const { data: myVoteData, error: myVoteErr } = await q.limit(1);
        if (!myVoteErr && myVoteData && myVoteData.length) {
          myVote = myVoteData[0].option_id ?? null;
        }
      } catch (err) {
        console.warn('[handleVote] myVote read failed', err);
      }

      // Apply authoritative counts + myVote into state (atomic-ish)
      setOptionsMap(prev => {
        const next = { ...prev };
        if (next[postId]) {
          next[postId] = next[postId].map(o => ({ ...o, votes: countsMap[o.id] ?? 0 }));
        }
        return next;
      });
      setMyVotes(prev => ({ ...prev, [postId]: myVote }));

      try { await (async () => { try { await logDebug?.('handleVote.done', { postId, countsMap, myVote }) } catch(_){} })() } catch(_) {}

      // return structured result (PostCard can use it)
      return { countsMap, myVote };
    } catch (err) {
      console.error('[handleVote] error', err);
      // rollback optimistic UI if something went wrong
      // fetch canonical counts to restore
      try { await fetchAndSetCounts(postId); } catch(_) {}
      setMyVotes(prev => ({ ...prev, [postId]: prevMyVote ?? null }));
      throw err;
    } finally {
      setPendingForPoll(postId, false);
      // keep visible confirmation for a short period so user sees clear feedback
      setTimeout(() => {
        setRecentVoted(prev => ({ ...prev, [postId]: false }))
      }, 4000)
    }
  }

  // Realtime: subscribe to changes in poll_votes and update counts (but do not overwrite myVotes)
  /* useEffect(() => {
    // subscribe only if there are polls loaded
    if (!polls.length) return;

    const channel = supabase
      .channel('realtime-poll-votes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'poll_votes' },
        payload => {
          try {
            // Supabase realtime payload may include `record` or `new` depending on adapter; handle both
            const record = (payload as any).record ?? (payload as any).new ?? null
            const pollId = record?.poll_id
            if (!pollId) return

            // ignore if event is our recent local action (within 3s)
            const last = lastLocalVoteRef.current
            if (last && last.pollId === pollId && (Date.now() - last.ts) < 3000) {
              // we assume our optimistic UI already reflects this change
              return
            }

            // If this poll is visible in the current feed, refresh counts for it
            if (polls.find(p => p.id === pollId)) {
              // fetch aggregated counts for the poll and update optionsMap
              void fetchAndSetCounts(pollId)
            }
          } catch (err) {
            console.error('[realtime-poll_votes] handler error', err)
          }
        }
      )
      .subscribe()

    return () => {
      try {
        supabase.removeChannel(channel)
      } catch (e) {
        // fallback: ignore
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polls]) */

  // Toggle comment section visibility for a post
  const toggleComments = (postId: string) => {
    setOpenComments(prev => {
      const next = { ...prev, [postId]: !prev[postId] }
      // if we're opening, scroll the post into view after a tiny delay
      if (!prev[postId]) {
        setTimeout(() => {
          const el = postRefs.current[postId]
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        }, 120)
      }
      return next
    })
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#000',
      color: '#fff',
      padding: '20px 20px 80px',
      fontFamily: 'sans-serif'
    }}>
      <div style={{ display:'flex', gap:8, marginBottom:16 }}>
        <button
          onClick={() => setMyFeed(false)}
          style={{
            padding:'8px 14px',
            borderRadius:999,
            border: myFeed ? '1px solid #444' : '1px solid #7c5cff',
            background: myFeed ? 'transparent' : 'rgba(124,92,255,.18)',
            color:'#fff',
            fontWeight:700,
            cursor:'pointer'
          }}
        >
          Лента
        </button>
        <button
          onClick={() => setMyFeed(true)}
          style={{
            padding:'8px 14px',
            borderRadius:999,
            border: myFeed ? '1px solid #7c5cff' : '1px solid #444',
            background: myFeed ? 'rgba(124,92,255,.18)' : 'transparent',
            color:'#fff',
            fontWeight:700,
            cursor:'pointer'
          }}
        >
          Моя лента
        </button>
      </div>

      {!myFeed && topics.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <Billboard
            items={topics.map(t => ({ id: t.id, title: t.title, question: t.code || t.title }))}
            onJumpToPost={(id) => {
              setSelectedTopicId(id)
            }}
          />
          {selectedTopicId && (
            <div style={{ fontSize:12, opacity:.8, marginTop:6 }}>
              Тема: {topics.find(t => t.id === selectedTopicId)?.title}
            </div>
          )}
        </div>
      )}

      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 20 }}>
        {myFeed ? 'Моя лента' : 'Лента'}
      </h1>

      {myFeed && !loading && polls.length === 0 && (
        <div style={{ background:'#111', border:'1px solid #333', borderRadius:12, padding:12, marginBottom:16 }}>
          <div style={{ opacity:.85, marginBottom:6 }}>
            Похоже, у вас ещё не выбраны темы.
          </div>
          <div style={{ fontSize:12, opacity:.7 }}>
            Зайдите в профиль и настройте «Моя лента: темы».
          </div>
        </div>
      )}

      {loading ? (
        <p>Загрузка...</p>
      ) : (
        polls.map(poll => {
          const opts: PollOption[] = (optionsMap[poll.id] ?? []).map(o => ({
            id: o.id,
            text: o.text,
            votes: (o as any).votes ?? 0
          }))

          const topicTitle = topics.find(t => t.id === poll.topic_id)?.title

          return (
            <div key={poll.id} style={{ position: 'relative' }} ref={(el) => { postRefs.current[poll.id] = el }}>
              <PostCard
                id={poll.id}
                topic={topicTitle}
                author={undefined}
                title={poll.title ?? ''}
                content={poll.question}
                imageUrl={poll.media_url ?? undefined}
                pollOptions={opts}
                onVote={handleVote}
                initialVote={Object.prototype.hasOwnProperty.call(myVotes, poll.id) ? myVotes[poll.id] : null}
                pending={!!pendingRef.current[poll.id]}
                onCommentClick={(id) => {
                  // toggle comment visibility for this post
                  toggleComments(id)
                }}
              />

              {/* Visual confirmation badge shown after user votes (reduces confusion) */}
              {recentVoted[poll.id] ? (
                <div style={{
                  position: 'absolute',
                  right: 12,
                  top: 8,
                  background: 'linear-gradient(90deg, #16a34a, #10b981)',
                  color: '#fff',
                  padding: '6px 10px',
                  borderRadius: 999,
                  fontSize: 12,
                  boxShadow: '0 6px 18px rgba(16,185,129,0.18)',
                  transform: 'translateY(0)',
                  opacity: 1,
                  transition: 'opacity .25s ease, transform .25s ease',
                  zIndex: 40
                }}>
                  ✓ Голос сохранён
                </div>
              ) : null}

              <div style={{ marginTop: 8 }}>
                {openComments[poll.id] ? (
                  <CommentSection pollId={poll.id} />
                ) : null}
              </div>
            </div>
          )
        })
      )}

      <div style={{ marginTop: 'auto' }}>
        <BottomNav />
      </div>
    </div>
  )
}
