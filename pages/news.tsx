// pages/news.tsx — использует PostCard (стили/поведение из components/PostCard.tsx)
// Поддержка: main_news, main_news_options, main_news_votes
import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import BottomNav from '../components/BottomNav'
import Billboard from '../components/Billboard'
import PostCard, { PollOption } from '../components/PostCard'
import NewsCommentSection from '../components/NewsCommentSection'


type NewsRow = {
  id: string
  author_tg_id: string | number
  title: string | null
  content: string | null
  media_url?: string | null
  created_at: string
  block_id?: string | null
  is_poll?: boolean | null
  users?: { nonvme?: string | null } | null
}

type Topic = { id: string; title: string; code?: string }

export default function NewsPage() {
  const [topics, setTopics] = useState<Topic[]>([])
  const [topicsLoading, setTopicsLoading] = useState(false)
  const [topicsError, setTopicsError] = useState<string | null>(null)

  const [items, setItems] = useState<NewsRow[]>([])
  const [optionsMap, setOptionsMap] = useState<Record<string, { id: string; text: string; position?: number; votes?: number }[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)

  // States for voting/comments like in feed
  const [tgId, setTgId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem('tgId') ?? null
  })
  const [anonId, setAnonId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem('anonId') ?? null
  })

  const pendingRef = useRef<Record<string, boolean>>({})
  const setPendingFor = (id: string, v: boolean) => { pendingRef.current = { ...pendingRef.current, [id]: v } }

  const lastLocalVoteRef = useRef<{ id: string; optionId: string | null; ts: number } | null>(null)
  const [myVotes, setMyVotes] = useState<Record<string, string | null>>({})
  const [recentVoted, setRecentVoted] = useState<Record<string, boolean>>({})
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({})

  const postRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // load topics (same as before)
  useEffect(() => {
    let canceled = false
    ;(async () => {
      setTopicsLoading(true)
      try {
        const { data, error } = await supabase
          .from('topics')
          .select('id,title,code,position')
          .order('position', { ascending: true })
        if (error) throw error
        if (!canceled) setTopics(data ?? [])
      } catch (e: any) {
        console.error('load topics error', e)
        if (!canceled) setTopicsError(String(e?.message ?? e))
      } finally {
        if (!canceled) setTopicsLoading(false)
      }
    })()
    return () => { canceled = true }
  }, [])

  // load main_news + options + counts (kept logic, with small adaptions)
  useEffect(() => {
    let canceled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      setOptionsMap({})
      try {
        const baseQuery = supabase
          .from('main_news')
          .select('id,author_tg_id,title,content,media_url,created_at,block_id,is_poll')
          .order('created_at', { ascending: false })
          .limit(400)

        const res = selectedBlockId ? await baseQuery.eq('block_id', selectedBlockId) : await baseQuery
        if (res.error) throw res.error

        const newsData: NewsRow[] = (res.data || []).map((r: any) => ({ ...r }))

        // load author display names (we keep internally but will not show on card)
        const tgIds = Array.from(new Set(newsData.map(n => String(n.author_tg_id))))
        let nameMap: Record<string, string | null> = {}
        if (tgIds.length) {
          const { data: usersRows, error: usersErr } = await supabase
            .from('users')
            .select('telegram_id, nonvme')
            .in('telegram_id', tgIds as any)
          if (usersErr) throw usersErr
          nameMap = Object.fromEntries((usersRows ?? []).map((u: any) => [String(u.telegram_id), u.nonvme ?? null]))
        }

        const withNames = newsData.map(n => ({ ...n, users: { nonvme: nameMap[String(n.author_tg_id)] ?? null } }))
        if (canceled) return
        setItems(withNames)

        const newsIds = withNames.map(n => String(n.id))
        if (newsIds.length === 0) {
          if (!canceled) setOptionsMap({})
          return
        }

        // load main_news_options
        const { data: optsData, error: optsErr } = await supabase
          .from('main_news_options')
          .select('id,text,main_news_id,position')
          .in('main_news_id', newsIds)

        if (optsErr) {
          console.warn('failed to load main_news_options', optsErr)
        } else {
          const grouped: Record<string, any[]> = {}
          ;(optsData ?? []).forEach((o: any) => {
            const k = String(o.main_news_id)
            if (!grouped[k]) grouped[k] = []
            grouped[k].push({ id: o.id, text: o.text, position: o.position ?? 0 })
          })
          Object.keys(grouped).forEach(k => grouped[k].sort((a,b)=> (a.position ?? 0) - (b.position ?? 0)))
          if (!canceled) setOptionsMap(grouped as any)
        }

        // counts: rpc -> fallback (keeps original approach)
        let countsMap: Record<string, number> = {}
        try {
          const hasRpc = typeof (supabase as any).rpc === 'function'
          if (hasRpc) {
            const { data: countsData, error: countsErr } = await supabase.rpc(
              'get_main_news_option_counts',
              { news_ids: newsIds }
            )
            if (countsErr) {
              console.warn('RPC get_main_news_option_counts error', countsErr)
              throw countsErr
            }

            if (Array.isArray(countsData)) {
              // явно типизируем ожидаемый формат результата
              type CountRow = { option_id?: number | string; votes?: number | string }
              ;(countsData as CountRow[]).forEach(row => {
                const optionId = row?.option_id
                if (optionId != null) {
                  // гарантируем число и строковый ключ
                  countsMap[String(optionId)] = Number(row.votes ?? 0)
                }
              })
            }
          } else {
            throw new Error('rpc not available')
          }
        } catch (rpcErr) {
          // fallback: fetch main_news_votes and count
          try {
            const { data: votesRows, error: votesErr } = await supabase
              .from('main_news_votes')
              .select('id,main_news_id,option_id,telegram_id,anonymous_id')
              .in('main_news_id', newsIds)

            if (votesErr) {
              console.warn('fallback votes fetch failed', votesErr)
            } else {
              ;(votesRows ?? []).forEach((v: any) => {
                const oid = String(v.option_id)
                countsMap[oid] = (countsMap[oid] ?? 0) + 1
              })
            }
          } catch (e) {
            console.warn('fallback counting failed', e)
          }
        }

        // merge counts into optionsMap shape
        setOptionsMap(prev => {
          const next = { ...prev }
          Object.keys(next).forEach(newsId => {
            const opts = next[newsId]
            if (!Array.isArray(opts)) {
              next[newsId] = []
              return
            }
            next[newsId] = opts.map(opt => ({ ...opt, votes: countsMap[opt.id] ?? 0 }))
          })
          return next
        })

        // also try to load current user's votes for main_news to set initial myVotes
        try {
          const telegram_id = localStorage.getItem('tgId') ?? null
          const anonymous_id = localStorage.getItem('anonId') ?? null
          let q: any = supabase.from('main_news_votes').select('main_news_id,option_id').in('main_news_id', newsIds)
          if (telegram_id && anonymous_id) {
            // fetch votes matching either identity
            q = supabase.from('main_news_votes').select('main_news_id,option_id').in('main_news_id', newsIds).or(`telegram_id.eq.${telegram_id},anonymous_id.eq.${anonymous_id}`)
          } else if (telegram_id) {
            q = supabase.from('main_news_votes').select('main_news_id,option_id').in('main_news_id', newsIds).eq('telegram_id', telegram_id)
          } else if (anonymous_id) {
            q = supabase.from('main_news_votes').select('main_news_id,option_id').in('main_news_id', newsIds).eq('anonymous_id', anonymous_id)
          } else {
            q = null
          }
          if (q) {
            const { data: myVotesData, error: myVotesErr } = await q
            if (!myVotesErr && myVotesData) {
              const map: Record<string,string|null> = {};
              const votesArray = myVotesData ?? [];
              votesArray.forEach((r: any) => {
                if (r.main_news_id) map[r.main_news_id] = r.option_id ?? null;
              });
              if (!canceled) setMyVotes(prev => ({ ...prev, ...map }))
            }
          }
        } catch (err) {
          console.warn('failed to load my votes for news', err)
        }

      } catch (e: any) {
        console.error('load main_news error', e)
        if (!canceled) setError(String(e?.message ?? e))
      } finally {
        if (!canceled) setLoading(false)
      }
    })()
    return () => { canceled = true }
  }, [selectedBlockId])


  // helper: fetch counts for a news post and update optionsMap
  const fetchAndSetCounts = async (newsId: string) => {
    try {
      const qCounts: any = supabase
        .from('main_news_votes')
        .select('option_id, count()', { count: 'exact' })
        .eq('main_news_id', newsId)

      const { data: countsData, error: countsErr } = await qCounts.group('option_id')

      if (countsErr) {
        console.warn('[fetchAndSetCounts] error', countsErr)
        return
      }
      const countsMap: Record<string, number> = {};
      const countsArray = countsData ?? [];
      countsArray.forEach((r: any) => { countsMap[r.option_id] = Number(r.count); });

      setOptionsMap(prev => {
        const next = { ...prev }
        if (next[newsId]) {
          next[newsId] = next[newsId].map(o => ({ ...o, votes: countsMap[o.id] ?? 0 }))
        }
        return next
      })
    } catch (e) {
      console.error('[fetchAndSetCounts] unexpected', e)
    }
  }

  // handleVote for main_news (similar to feed.handleVote)
  const handleVoteMainNews = async (newsId: string, optionId: string | null) => {
    if (pendingRef.current[newsId]) return null
    setPendingFor(newsId, true)
    setRecentVoted(prev => ({ ...prev, [newsId]: true }))

    const prevMyVote = myVotes[newsId] ?? null

    // ensure anonId if needed
    let telegram_id = localStorage.getItem('tgId') ?? tgId ?? null
    let anonymous_id = localStorage.getItem('anonId') ?? anonId ?? null
    if (!telegram_id && !anonymous_id && typeof window !== 'undefined') {
      const generated = (typeof crypto !== 'undefined' && (crypto as any).randomUUID)
        ? (crypto as any).randomUUID()
        : 'anon-' + Math.random().toString(36).slice(2, 12)
      localStorage.setItem('anonId', generated)
      anonymous_id = generated
    }

    // optimistic update
    setOptionsMap(prev => {
      const next = { ...prev }
      if (!next[newsId]) return prev
      const opts = next[newsId].map(o => ({ ...o }))
      if (prevMyVote) {
        const idx = opts.findIndex(x => x.id === prevMyVote)
        if (idx !== -1) opts[idx].votes = Math.max(0, (opts[idx].votes ?? 0) - 1)
      }
      if (optionId) {
        const idx2 = opts.findIndex(x => x.id === optionId)
        if (idx2 !== -1) opts[idx2].votes = (opts[idx2].votes ?? 0) + 1
      }
      next[newsId] = opts
      return next
    })
    setMyVotes(prev => ({ ...prev, [newsId]: optionId ?? null }))

    // mark last local to ignore realtime echo briefly
    lastLocalVoteRef.current = { id: newsId, optionId, ts: Date.now() }

    try {
      // DB change: upsert or delete into main_news_votes
      if (optionId === null) {
        const delQuery = telegram_id
          ? supabase.from('main_news_votes').delete().match({ main_news_id: newsId, telegram_id })
          : supabase.from('main_news_votes').delete().match({ main_news_id: newsId, anonymous_id })
        const { error: delErr } = await delQuery.select()
        if (delErr) throw delErr
      } else {
        const payload: any = { main_news_id: newsId, option_id: optionId }
        if (telegram_id) payload.telegram_id = telegram_id
        else payload.anonymous_id = anonymous_id

        const onConflictCols = telegram_id ? ['main_news_id','telegram_id'] : ['main_news_id','anonymous_id']
        const onConflictParam = Array.isArray(onConflictCols) ? onConflictCols.join(',') : (onConflictCols as string | undefined)

        const { error: upsertErr } = await supabase
          .from('main_news_votes')
          .upsert([payload], onConflictParam ? { onConflict: onConflictParam } : undefined)
          .select()

        if (upsertErr) throw upsertErr
      }

      // fetch canonical counts
      const qCounts: any = supabase
        .from('main_news_votes')
        .select('option_id, count()', { count: 'exact' })
        .eq('main_news_id', newsId)

      const { data: countsData, error: countsErr } = await qCounts.group('option_id')

      const countsMap: Record<string, number> = {};
      const countsArray = countsData ?? [];
      countsArray.forEach((r: any) => { countsMap[r.option_id] = Number(r.count); });


      // fetch canonical myVote for this identity
      let myVote: string | null = null
      try {
        let q = supabase.from('main_news_votes').select('option_id').eq('main_news_id', newsId)
        if (telegram_id) q = q.eq('telegram_id', telegram_id)
        else q = q.eq('anonymous_id', anonymous_id)
        const { data: myVoteData } = await q.limit(1)
        if (myVoteData && myVoteData.length) myVote = myVoteData[0].option_id ?? null
      } catch (err) {
        console.warn('[handleVoteMainNews] myVote read failed', err)
      }

      // apply authoritative counts + myVote
      setOptionsMap(prev => {
        const next = { ...prev }
        if (next[newsId]) next[newsId] = next[newsId].map(o => ({ ...o, votes: countsMap[o.id] ?? 0 }))
        return next
      })
      setMyVotes(prev => ({ ...prev, [newsId]: myVote }))

      return { countsMap, myVote }
    } catch (err) {
      console.error('[handleVoteMainNews] error', err)
      try { await fetchAndSetCounts(newsId) } catch(_) {}
      setMyVotes(prev => ({ ...prev, [newsId]: prevMyVote ?? null }))
      throw err
    } finally {
      setPendingFor(newsId, false)
      setTimeout(() => setRecentVoted(prev => ({ ...prev, [newsId]: false })), 3500)
    }
  }

  const toggleComments = (id: string) => {
    setOpenComments(prev => {
      const next = { ...prev, [id]: !prev[id] }
      if (!prev[id]) {
        setTimeout(() => {
          const el = postRefs.current[id]
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 120)
      }
      return next
    })
  }

  // convert optionsMap entry to PollOption[] for PostCard
  const mapToPollOptions = (newsId: string): PollOption[] => {
    const arr = optionsMap[newsId] ?? []
    return arr.map(o => ({ id: o.id, text: o.text, votes: o.votes ?? 0 }))
  }

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(180deg,#070707,#050505)', color:'#fff', padding:'20px 16px 94px', fontFamily:'Inter, system-ui, sans-serif', display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
      <div style={{ width:'100%', maxWidth:900 }}>

        <div style={{ height:12 }} />

        {topics.length > 0 && (
          <div style={{ marginBottom:12 }}>
            <Billboard
              items={topics.map(t => ({ id: t.id, title: t.title, question: t.code || t.title }))}
              onJumpToPost={(id) => setSelectedBlockId(id)}
              onSelectTopic={(id) => setSelectedBlockId(id)}
              selectedId={selectedBlockId}
            />
          </div>
        )}

        <div style={{ fontSize:13, color:'#d0d0d0', marginTop:8 }}>
          Тема: <span style={{ fontWeight:700, color:'#fff' }}>
            {selectedBlockId ? (topics.find(t => t.id === selectedBlockId)?.title ?? '—') : 'Общее'}
          </span>
        </div>

        {loading ? (
          <div style={{ color:'#bdbdbd', padding:20 }}>Загрузка…</div>
        ) : error ? (
          <div style={{ color:'#ff6b6b', padding:20 }}>Ошибка: {error}</div>
        ) : items.length === 0 ? (
          <div style={{ color:'#bdbdbd', padding:20 }}>Пока новостей нет</div>
        ) : (
          items.map(n => (
            <div key={n.id} style={{ position:'relative' }} ref={(el)=>{ postRefs.current[n.id] = el }}>
              <PostCard
                id={n.id}
                topic={n.block_id ? (topics.find(t => t.id === n.block_id)?.title ?? '') : undefined}
                author={undefined} // intentionally undefined — не показываем автора/дату
                title={n.title ?? ''}
                content={n.content ?? ''}
                imageUrl={n.media_url ?? undefined}
                pollOptions={mapToPollOptions(n.id)}
                onVote={handleVoteMainNews}
                initialVote={Object.prototype.hasOwnProperty.call(myVotes, n.id) ? myVotes[n.id] : null}
                pending={!!pendingRef.current[n.id]}
                onCommentClick={(id) => toggleComments(id)}
              />

              {recentVoted[n.id] ? (
                <div style={{
                  position:'absolute', right:12, top:8,
                  background:'linear-gradient(90deg,#16a34a,#10b981)', color:'#fff', padding:'6px 10px',
                  borderRadius:999, fontSize:12, boxShadow:'0 6px 18px rgba(16,185,129,0.18)', zIndex:40
                }}>
                  ✓ Голос сохранён
                </div>
              ) : null}

              <div style={{ marginTop:8 }}>
                {openComments[n.id] ? <NewsCommentSection newsId={n.id} /> : null}
              </div>
            </div>
          ))
        )}
      </div>

      <div style={{ width:'100%', maxWidth:900, position:'fixed', left:0, right:0, bottom:0, margin:'0 auto', padding:'10px 16px', boxSizing:'border-box', pointerEvents:'none' }}>
        <div style={{ pointerEvents:'auto' }}>
          <BottomNav />
        </div>
      </div>

      {/* ======= FIX: глобальные стили, чтобы карточки news корректно сохраняли отступы/переносы и скроллились внутри ======= */}
      <style jsx global>{`
        /* Preserve user line breaks and wrapping in PostCard content */
        .postcard .content {
          white-space: pre-wrap !important;      /* keep user's newlines and spacing */
          overflow-wrap: anywhere !important;    /* break long tokens */
          word-break: break-word !important;
          hyphens: auto !important;
          max-width: 100% !important;
          box-sizing: border-box !important;
        }

        /* Ensure preview/clamp still works for collapsed state */
        .postcard.collapsed .content {
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 3;
          overflow: hidden;
          max-height: 4.6em;
        }
        .postcard.expanded .content {
          display: block;
          max-height: none;
        }

        /* Make overlay inner area scrollable so long content doesn't flow under media */
        .postcard .text-inner {
          /* limit height and allow internal scroll */
          max-height: calc(100vh - 120px);
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
        }
        .postcard.expanded .text-inner {
          max-height: calc(100vh - 40px);
        }

        /* Poll options scrolling when many items */
        .postcard .poll-panel-inner {
          max-height: 240px;
          overflow-y: auto;
        }
        .postcard.expanded .poll-panel-inner {
          max-height: 380px;
        }

        /* Small padding to prevent content touching the right edge / scrollbar */
        .postcard .text-inner, .postcard .content, .postcard .poll-panel-inner {
          padding-right: 8px;
        }
      `}</style>
    </div>
  )
}
