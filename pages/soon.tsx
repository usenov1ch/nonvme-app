// pages/soon.tsx — Активные блоки (аккордеон)
import { useEffect, useState, useRef } from 'react'   // <-- добавили useRef
import { supabase } from '../lib/supabase'
import ActivityBlockCard from '../components/ActivityBlockCard'
import BottomNav from '../components/BottomNav'

/* declare global { interface Window { Telegram?: any } } */

type Block = {
  id: string
  title: string
  description?: string | null
  cover_url?: string | null
  partner?: string | null
}

type Mission = { id: string; title: string; description?: string | null; points: number }
type Post = { id: string; telegram_id: string; content: string; created_at: string }

// ============== Детали одного блока (раскрывается под карточкой) ==============
function BlockDetails({ blockId, tgId }: { blockId: string; tgId: string }) {
  const [isJoined, setIsJoined] = useState(false)
  const [points, setPoints] = useState(0)

  const [missions, setMissions] = useState<Mission[]>([])
  const [progress, setProgress] = useState<Record<string, boolean>>({})

  // тип поста с приклеенным users.nonvme
  type PostRow = {
    id: string
    telegram_id: string
    content: string
    created_at: string
    users?: { nonvme?: string | null } | null
  }

  const [posts, setPosts] = useState<PostRow[]>([])
  const [newPost, setNewPost] = useState('')
  const [pubLoading, setPubLoading] = useState(false)
  const [pubError, setPubError] = useState<string>('')

  // кешируем nonvme по telegram_id (для realtime)
  const nameCache = useRef<Record<string, string>>({})

  // начальная загрузка миссий и постов (с join к users через FK fk_posts_users_text)
  useEffect(() => {
    let cancel = false
    ;(async () => {
      const [{ data: miss }, { data: pst, error: pstErr }] = await Promise.all([
        supabase
          .from('activity_missions')
          .select('id,title,description,points')
          .eq('block_id', blockId),
        supabase
          .from('activity_posts')
          .select(`
            id,
            telegram_id,
            content,
            created_at,
            users!fk_posts_users_text ( nonvme )
          `)
          .eq('block_id', blockId)
          .order('created_at', { ascending: false })
      ])

      if (cancel) return
      setMissions(miss ?? [])
      if (!pstErr) {
        ;(pst ?? []).forEach((p: any) => {
          const uname = p?.users?.nonvme
          if (uname) nameCache.current[p.telegram_id] = uname
        })
        setPosts((pst as PostRow[]) ?? [])
      }
    })()
    return () => { cancel = true }
  }, [blockId])

  // realtime: при INSERT тянем имя из кеша/БД и добавляем в список
  useEffect(() => {
    const channel = supabase
      .channel(`posts_${blockId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'activity_posts', filter: `block_id=eq.${blockId}` },
        async (payload: any) => {
          const row = payload.new as Post
          let nonvme = nameCache.current[row.telegram_id]
          if (!nonvme) {
            const { data } = await supabase
              .from('users')
              .select('nonvme')
              .eq('telegram_id', row.telegram_id)
              .maybeSingle()
            nonvme = data?.nonvme || ''
            if (nonvme) nameCache.current[row.telegram_id] = nonvme
          }
          setPosts(prev => [{ ...row, users: { nonvme } } as PostRow, ...prev])
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [blockId])

  // участие + прогресс
  useEffect(() => {
    if (!tgId) return
    let cancel = false
    ;(async () => {
      const [{ data: mem }, { data: prg }] = await Promise.all([
        supabase
          .from('activity_members')
          .select('points')
          .eq('block_id', blockId)
          .eq('telegram_id', tgId)
          .maybeSingle(),
        supabase
          .from('activity_mission_progress')
          .select('mission_id,is_done')
          .eq('telegram_id', tgId)
      ])
      if (cancel) return
      setIsJoined(!!mem)
      setPoints(mem?.points ?? 0)
      const map: Record<string, boolean> = {}
      prg?.forEach((r: any) => (map[r.mission_id] = !!r.is_done))
      setProgress(map)
    })()
    return () => { cancel = true }
  }, [blockId, tgId])

  const join = async () => {
    if (!tgId) return alert('Откройте мини-апп из Telegram')
    const { error } = await supabase
      .from('activity_members')
      .upsert({ block_id: blockId, telegram_id: tgId }, { onConflict: 'block_id,telegram_id' })
    if (error) { alert('Не удалось подключиться: ' + (error.message || '')); return }
    setIsJoined(true)
  }

  const toggleMission = async (missionId: string, done: boolean) => {
    if (!tgId) return alert('Откройте мини-апп из Telegram')
    await supabase
      .from('activity_mission_progress')
      .upsert(
        { mission_id: missionId, telegram_id: tgId, is_done: done, done_at: done ? new Date().toISOString() : null },
        { onConflict: 'mission_id,telegram_id' }
      )
    setProgress(p => ({ ...p, [missionId]: done }))
    if (done) {
      const pts = missions.find(m => m.id === missionId)?.points ?? 0
      try { await supabase.rpc('increment_member_points', { p_block: blockId, p_tg: tgId, p_pts: pts }) } catch {}
      setPoints(v => v + pts)
    }
  }

  const publish = async () => {
    setPubError('')
    if (!tgId) { setPubError('Откройте мини-апп из Telegram'); return }
    if (!isJoined) { setPubError('Сначала подключитесь к блоку'); return }
    const text = newPost.trim()
    if (!text) return

    setPubLoading(true)
    const { data, error } = await supabase
      .from('activity_posts')
      .insert([{ block_id: blockId, telegram_id: tgId, content: text }])
      .select(`
        id,
        telegram_id,
        content,
        created_at,
        users!fk_posts_users_text ( nonvme )
      `)
      .single()

    setPubLoading(false)
    if (error) {
      console.error('publish error:', error)
      setPubError(error.message || 'Не удалось отправить')
      return
    }

    const uname = (data as any)?.users?.nonvme
    if (uname) nameCache.current[tgId] = uname

    setPosts(prev => [data as PostRow, ...prev])
    setNewPost('')
  }

  return (
    <div
      style={{
        background:'#0f0f0f',
        border:'1px solid #333',
        borderRadius:12,
        padding:12,
        marginTop:10
      }}
    >
      {!isJoined ? (
        <button
          onClick={join}
          style={{ padding:'10px 12px', borderRadius:10, background:'#2e2159', color:'#fff', border:'none', fontWeight:700, marginBottom:12 }}
        >
          подключиться
        </button>
      ) : (
        <div style={{ marginBottom:12, fontSize:13, opacity:.85 }}>
          Вы участвуете · Баллы: <b>{points}</b>
        </div>
      )}

      {/* Миссии */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Миссии</div>
        {missions.length === 0 ? (
          <div style={{ opacity:.7 }}>Нет миссий</div>
        ) : missions.map(m => (
          <label key={m.id} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
            <input
              type="checkbox"
              checked={!!progress[m.id]}
              onChange={(e)=>toggleMission(m.id, e.target.checked)}
            />
            <div>
              <div style={{ fontWeight:600 }}>
                {m.title} <span style={{ opacity:.7, fontWeight:400 }}>+{m.points} баллов</span>
              </div>
              {m.description && <div style={{ fontSize:12, opacity:.8 }}>{m.description}</div>}
            </div>
          </label>
        ))}
      </div>

      {/* Посты */}
      <div>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Посты</div>

        {isJoined && (
          <div style={{ display:'flex', gap:8, marginBottom:12 }}>
            <input
              value={newPost}
              onChange={(e)=>setNewPost(e.target.value)}
              placeholder="Напишите анонс…"
              style={{ flex:1, padding:10, background:'#111', color:'#fff', border:'1px solid #333', borderRadius:10 }}
            />
            <button
              onClick={publish}
              disabled={pubLoading || !newPost.trim()}
              style={{
                padding:'10px 12px',
                borderRadius:10,
                background: pubLoading ? '#473a7d' : '#2e2159',
                color:'#fff',
                border:'none',
                fontWeight:700,
                opacity: pubLoading ? .8 : 1,
                cursor: pubLoading ? 'default' : 'pointer'
              }}
            >
              {pubLoading ? 'Отправка…' : 'Отправить'}
            </button>
          </div>
        )}

        {pubError && <div style={{ color:'#f66', fontSize:12, marginBottom:8 }}>{pubError}</div>}

        {posts.length === 0 ? (
          <div style={{ opacity:.7 }}>Пока пусто</div>
        ) : posts.map(p => (
          <div key={p.id} style={{ background:'#111', border:'1px solid #333', borderRadius:10, padding:10, marginBottom:8 }}>
            <div style={{ fontSize:12, opacity:.7, marginBottom:4 }}>
              {(p.users?.nonvme || p.telegram_id)} · {new Date(p.created_at).toLocaleString()}
            </div>
            <div>{p.content}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================ Список блоков (аккордеон) ============================
export default function ActivitiesPage() {
  const [blocks, setBlocks] = useState<Block[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [tgId, setTgId] = useState<string>('')

  useEffect(() => {
    const u = window?.Telegram?.WebApp?.initDataUnsafe?.user
    if (u?.id) setTgId(String(u.id))
  }, [])

  useEffect(() => {
    let cancel = false
    ;(async () => {
      const { data } = await supabase
        .from('activity_blocks')
        .select('id,title,description,cover_url,partner')
        .order('created_at', { ascending: false })
      if (!cancel) setBlocks(data ?? [])
    })()
    return () => { cancel = true }
  }, [])

  const toggle = (id: string) => {
    setExpandedId(curr => (curr === id ? null : id))
  }

  return (
    <div style={{ minHeight:'100vh', background:'#000', color:'#fff', padding:'16px 16px 84px', fontFamily:'sans-serif' }}>
      <h1 style={{ fontSize:22, fontWeight:800, marginBottom:12 }}>Активные блоки</h1>

      <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:12 }}>
        {blocks.map(b => (
          <div key={b.id}>
            <ActivityBlockCard
              block={b}
              isOpen={expandedId === b.id}
              onToggle={toggle}
            />
            {expandedId === b.id && (
              <BlockDetails blockId={b.id} tgId={tgId} />
            )}
          </div>
        ))}
        {blocks.length === 0 && <div style={{ opacity:.7 }}>Пока нет активных блоков</div>}
      </div>

      <div style={{ marginTop:'auto' }}>
        <BottomNav />
      </div>
    </div>
  )
}
