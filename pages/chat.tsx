// pages/chat.tsx — Общий чат (клиент-страница)
import dynamic from 'next/dynamic'
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import BottomNav from '../components/BottomNav'
import { useRouter } from 'next/router'

declare global { interface Window { Telegram?: any } }

type ChatRow = {
  id: string
  telegram_id: string
  content: string
  created_at: string
  users?: { nonvme?: string | null } | null
}

const LEVEL_THRESHOLD = 50
const QUOTA_BASE = {
  none: 0,
  low: 5,
  mid: 10,
  high: 20,
  nft: 50,
}

function calcQuota(points: number, hasNFT: boolean) {
  if (hasNFT) return QUOTA_BASE.nft
  if (points < LEVEL_THRESHOLD) return QUOTA_BASE.none
  if (points >= 300) return QUOTA_BASE.high
  if (points >= 150) return QUOTA_BASE.mid
  return QUOTA_BASE.low
}

function ChatPage() {
  const router = useRouter() // ← для переключателя

  const [tgId, setTgId] = useState<string>('')
  const [points, setPoints] = useState<number>(0)
  const [hasNFT, setHasNFT] = useState<boolean>(false)
  const [eligible, setEligible] = useState<boolean>(false)

  const [messages, setMessages] = useState<ChatRow[]>([])
  const [loading, setLoading] = useState(true)

  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const [usedToday, setUsedToday] = useState(0)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  // Telegram id
  useEffect(() => {
    const u = window?.Telegram?.WebApp?.initDataUnsafe?.user
    if (u?.id) setTgId(String(u.id))
  }, [])

  // квота
  const quota = useMemo(() => calcQuota(points, hasNFT), [points, hasNFT])

  useEffect(() => {
    if (!tgId) return
    let cancel = false
    ;(async () => {
      try {
        const { data: up } = await supabase
          .from('user_points')
          .select('points')
          .eq('telegram_id', tgId)
          .maybeSingle()
        const pts = up?.points ?? 0

        const { data: nh } = await supabase
          .from('nft_holders')
          .select('telegram_id')
          .eq('telegram_id', tgId)
          .maybeSingle()

        if (!cancel) {
          setPoints(pts)
          setHasNFT(!!nh)
          setEligible(pts >= LEVEL_THRESHOLD || !!nh)
        }

        const startOfDay = new Date()
        startOfDay.setHours(0, 0, 0, 0)
        const { data: today } = await supabase
          .from('chat_messages')
          .select('id,created_at')
          .eq('telegram_id', tgId)
          .gte('created_at', startOfDay.toISOString())
        if (!cancel) setUsedToday(today?.length || 0)
      } catch (e) {
        if (!cancel) console.error(e)
      }
    })()
    return () => { cancel = true }
  }, [tgId])

  // история + realtime
  useEffect(() => {
    let cancel = false
    ;(async () => {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('chat_messages')
          .select('id,telegram_id,content,created_at')
          .order('created_at', { ascending: true })
          .limit(200)
        if (error) throw error
        const base = (data || []) as ChatRow[]

        const tgs = Array.from(new Set(base.map(m => String(m.telegram_id))))
        let nameMap: Record<string, string | null> = {}
        if (tgs.length) {
          const { data: usersRows } = await supabase
            .from('users')
            .select('telegram_id, nonvme')
            .in('telegram_id', tgs as any)
          nameMap = Object.fromEntries((usersRows ?? []).map((u: any) => [String(u.telegram_id), u.nonvme || null]))
        }
        const withNames = base.map(m => ({ ...m, users: { nonvme: nameMap[String(m.telegram_id)] ?? null } }))
        if (!cancel) setMessages(withNames)
      } catch (e) {
        if (!cancel) console.error(e)
      } finally {
        if (!cancel) setLoading(false)
      }
    })()

    const ch = supabase
      .channel('chat_stream')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, async (payload: any) => {
        const row = payload.new as ChatRow
        const { data: u } = await supabase
          .from('users')
          .select('nonvme')
          .eq('telegram_id', row.telegram_id)
          .maybeSingle()
        const nonvme = u?.nonvme ?? null
        setMessages(prev => [...prev, { ...row, users: { nonvme } }])
      })
      .subscribe()

    return () => { supabase.removeChannel(ch); cancel = true }
  }, [])

  // автоскролл
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const remaining = Math.max(quota - usedToday, 0)

  const send = async () => {
    setError('')
    if (!tgId) { setError('Откройте мини-апп из Telegram'); return }
    if (!eligible) { setError('Недостаточно уровня для отправки'); return }
    if (remaining <= 0) { setError('Лимит сообщений на сегодня исчерпан'); return }
    const body = text.trim()
    if (!body) return

    setSending(true)
    try {
      const { error } = await supabase
        .from('chat_messages')
        .insert([{ telegram_id: tgId, content: body }])
      if (error) throw error

      setText('')
      setUsedToday(v => v + 1)
    } catch (e: any) {
      setError(e?.message || 'Не удалось отправить')
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ minHeight:'100vh', background:'#000', color:'#fff', padding:'16px 16px 84px', fontFamily:'sans-serif' }}>
      <h1 style={{ fontSize:22, fontWeight:800, marginBottom:8 }}>Общий чат</h1>

      {/* Переключатель: Лента / Чат */}
      <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:12 }}>
        <div
          style={{
            background:'#111', border:'1px solid #333', borderRadius:999,
            padding:4, display:'inline-flex', gap:4
          }}
        >
          <button
            onClick={() => router.push('/feed')}
            style={{
              padding:'8px 14px',
              borderRadius:999,
              border:'none',
              cursor:'pointer',
              background:'transparent',
              color:'#fff',
              fontWeight:700,
              opacity:.9
            }}
          >
            Лента
          </button>
          <button
            disabled
            style={{
              padding:'8px 14px',
              borderRadius:999,
              border:'none',
              background:'#fff',
              color:'#000',
              fontWeight:800,
              cursor:'default'
            }}
          >
            Чат
          </button>
        </div>
      </div>

      {/* статус прав и лимитов */}
      <div style={{ fontSize:12, opacity:.85, marginBottom:12 }}>
        Ваши баллы: <b>{points}</b> · NFT: <b>{hasNFT ? 'да' : 'нет'}</b> ·
        дневной лимит: <b>{quota}</b> · осталось сегодня: <b>{remaining}</b>
      </div>

      {/* список сообщений */}
      <div style={{
        background:'#0f0f0f', border:'1px solid #333', borderRadius:16, padding:12,
        height: '50vh', overflowY:'auto', marginBottom:12
      }}>
        {loading ? (
          <div style={{ opacity:.7 }}>Загрузка…</div>
        ) : messages.length === 0 ? (
          <div style={{ opacity:.7 }}>Пока пусто</div>
        ) : (
          messages.map(m => (
            <div key={m.id} style={{ marginBottom:10 }}>
              <div style={{ fontSize:12, opacity:.7, marginBottom:2 }}>
                {m.users?.nonvme || m.telegram_id} · {new Date(m.created_at).toLocaleString()}
              </div>
              <div style={{
                background:'#111', border:'1px solid #333', borderRadius:10, padding:'8px 10px',
                whiteSpace:'pre-wrap'
              }}>
                {m.content}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* форма отправки */}
      <div style={{ background:'#111', border:'1px solid #333', borderRadius:16, padding:12 }}>
        {!eligible && (
          <div style={{ color:'#f5d36c', fontSize:12, marginBottom:8 }}>
            У вас пока нет права на отправку сообщений. Наберите {LEVEL_THRESHOLD}+ баллов или получите NFT.
          </div>
        )}

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={eligible ? 'Напишите сообщение…' : 'Недоступно для отправки'}
          rows={3}
          disabled={!eligible}
          style={{
            width:'100%', padding:10, background:'#0f0f0f', color:'#fff',
            border:'1px solid #333', borderRadius:10, resize:'vertical', marginBottom:8,
            opacity: eligible ? 1 : .6
          }}
        />
        <button
          onClick={send}
          disabled={!eligible || sending || remaining <= 0 || !text.trim()}
          style={{
            width:'100%', padding:'10px 12px', borderRadius:10,
            background: (!eligible || remaining<=0) ? '#473a7d' : '#2e2159',
            color:'#fff', border:'none', fontWeight:700, cursor: (!eligible || remaining<=0) ? 'default' : 'pointer',
            opacity: sending ? .8 : 1
          }}
        >
          {sending ? 'Отправка…' : `Отправить (${remaining} осталось)`}
        </button>

        {error && <div style={{ color:'#f66', fontSize:12, marginTop:8 }}>{error}</div>}
      </div>

      <div style={{ marginTop:'auto' }}>
        <BottomNav />
      </div>
    </div>
  )
}

// отключаем SSR (чтобы не было hydration-ошибок)
export default dynamic(() => Promise.resolve(ChatPage), { ssr: false })
