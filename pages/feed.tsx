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
  const [myVotes, setMyVotes] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  const [topics, setTopics] = useState<Topic[]>([])
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null)

  const [myFeed, setMyFeed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    const v = localStorage.getItem('myFeed')
    return v === '1'
  })

  const [tgId, setTgId] = useState<string>('')

  const postRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    const u = (typeof window !== 'undefined')
      ? window.Telegram?.WebApp?.initDataUnsafe?.user
      : null
    if (u?.id) setTgId(String(u.id))
  }, [])

  // load topics
  useEffect(() => {
    let cancel = false
    ;(async () => {
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
    })()
    return () => { cancel = true }
  }, [myFeed])

  // main load: polls + options + current user's votes (myVotes)
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
            grouped[opt.poll_id].push(opt)
          })
          if (!cancel) setOptionsMap(grouped)
        } else {
          if (!cancel) setOptionsMap({})
        }

        // --- NEW: load current user's votes for these polls and set myVotes ---
        if (ids.length) {
          try {
            const telegram_id = tgId || null
            let anonymous_id: string | null = null
            if (!telegram_id && typeof window !== 'undefined') {
              anonymous_id = localStorage.getItem('anonId') ?? null
            }

            let q = supabase.from('poll_votes').select('poll_id, option_id').in('poll_id', ids)
            if (telegram_id) q = q.eq('telegram_id', telegram_id)
            else if (anonymous_id) q = q.eq('anonymous_id', anonymous_id)
            // else: no identifier -> won't fetch personal votes

            const { data: myVotesData, error: myVotesError } = await q
            if (myVotesError) {
              console.warn('Failed to load my votes', myVotesError)
            } else {
              const myMap: Record<string, string> = {}
              (myVotesData ?? []).forEach((r: any) => {
                if (r.poll_id && r.option_id) myMap[r.poll_id] = r.option_id
              })
              if (!cancel) setMyVotes(prev => ({ ...prev, ...myMap }))
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
  }, [myFeed, selectedTopicId, tgId])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('myFeed', myFeed ? '1' : '0')
    }
  }, [myFeed])

  /**
   * handleVote:
   * - insert (upsert) row into poll_votes (poll_id, option_id, telegram_id/anonymous_id)
   * - then compute counts per option and current user's vote and return { countsMap, myVote }
   */
  const handleVote = async (postId: string, optionId: string | null) => {
    
    console.log('[handleVote] start', { postId, optionId, tgId });
    await logDebug('handleVote.start', { postId, optionId, tgId })


    try {
      const telegram_id = tgId || null;
      let anonymous_id: string | null = null;
      if (!telegram_id && typeof window !== 'undefined') {
        anonymous_id = localStorage.getItem('anonId');
        if (!anonymous_id) {
          anonymous_id = (typeof crypto !== 'undefined' && (crypto as any).randomUUID)
            ? (crypto as any).randomUUID()
            : 'anon-' + Math.random().toString(36).slice(2, 12);
          localStorage.setItem('anonId', anonymous_id);
        }
      }
      await logDebug('handleVote.ids', { telegram_id, anonymous_id })

      if (optionId === null) {
        const { error: delError } = await supabase
          .from('poll_votes')
          .delete()
          .match(telegram_id ? { poll_id: postId, telegram_id } : { poll_id: postId, anonymous_id });

        if (delError) {
          console.error('[handleVote] delete error', delError);
          throw delError;
        }
      } else {
        const payload: any = { poll_id: postId, option_id: optionId };
        if (telegram_id) payload.telegram_id = telegram_id;
        else payload.anonymous_id = anonymous_id;

        const { error: upsertError } = await supabase
          .from('poll_votes')
          .upsert([payload], { onConflict: telegram_id ? ['poll_id','telegram_id'] : ['poll_id','anonymous_id'] });

        if (upsertError) {
          console.error('[handleVote] upsert error', upsertError);
          throw upsertError;
        }
      }
      await logDebug('handleVote.upsert_ok', { postId, optionId })
      // counts per option
      const { data: countsData, error: countsError } = await supabase
        .from('poll_votes')
        .select('option_id, count()', { count: 'exact' })
        .eq('poll_id', postId)
        .group('option_id');

      await logDebug('handleVote.counts', { postId, countsMap })

      if (countsError) {
        console.error('[handleVote] counts error', countsError);
        throw countsError;
      }

      const countsMap: Record<string, number> = {};
      (countsData ?? []).forEach((r: any) => { countsMap[r.option_id] = Number(r.count); });

      // determine myVote for this poll
      let myVote: string | null = null;
      const q = supabase.from('poll_votes').select('option_id').eq('poll_id', postId);
      if (telegram_id) q.eq('telegram_id', telegram_id);
      else q.eq('anonymous_id', anonymous_id);

      await logDebug('handleVote.myVote', { postId, myVote })

      const { data: myVoteData, error: myVoteError } = await q.limit(1);
      if (myVoteError) {
        console.warn('[handleVote] myVote query error', myVoteError);
      } else if (myVoteData && myVoteData.length) {
        myVote = myVoteData[0].option_id ?? null;
      }

      // update local optionsMap counts for UI
      setOptionsMap(prev => {
        const next = { ...prev };
        if (next[postId]) {
          next[postId] = next[postId].map(o => ({ ...o, votes: countsMap[o.id] ?? 0 }));
        }
        return next;
      });

      // also update myVotes map so that PostCard initialVote (on re-render) will be correct
      if (typeof myVote !== 'undefined') {
        setMyVotes(prev => ({ ...prev, [postId]: myVote ?? null }));
      }

      console.log('[handleVote] done', { countsMap, myVote });
      await logDebug('handleVote.done', { postId, countsMap, myVote })
      return { countsMap, myVote };
    } catch (e) {
      console.error('[handleVote] unexpected error', e);
      throw e;
      await logDebug('handleVote.error', { error: String(e), postId, optionId })
      throw e
    }
  }

  // Realtime: update counts only (do not overwrite myVotes)
  

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
            items={topics.map(t => ({ id: t.id, title: t.title, question: '' }))}
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
            <div key={poll.id} ref={(el) => { postRefs.current[poll.id] = el }}>
              <PostCard
                id={poll.id}
                topic={topicTitle}
                author={undefined}
                title={poll.title ?? ''}
                content={poll.question}
                imageUrl={poll.media_url ?? undefined}
                pollOptions={opts}
                onVote={handleVote}
                initialVote={typeof myVotes[poll.id] !== 'undefined' ? myVotes[poll.id] : undefined}
                onCommentClick={(id) => {
                  // scroll into view and open comment area (if needed)
                  const el = postRefs.current[id]
                  if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                  }
                }}
              />

              <div style={{ marginTop: 8 }}>
                <CommentSection pollId={poll.id} />
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
