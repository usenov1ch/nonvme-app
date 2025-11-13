// pages/chat.tsx — Общий чат (клиент-страница, обновлённый дизайн, с аватарками)
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
  users?: { nonvme?: string | null, avatar_url?: string | null } | null
}

const LEVEL_THRESHOLD = 50
const QUOTA_BASE = { none: 0, low: 5, mid: 10, high: 20, nft: 50 }

function calcQuota(points: number, hasNFT: boolean) {
  if (hasNFT) return QUOTA_BASE.nft
  if (points < LEVEL_THRESHOLD) return QUOTA_BASE.none
  if (points >= 300) return QUOTA_BASE.high
  if (points >= 150) return QUOTA_BASE.mid
  return QUOTA_BASE.low
}

function humanDate(d: Date) {
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const yest = new Date(now); yest.setDate(now.getDate() - 1)
  const isYest = d.toDateString() === yest.toDateString()
  if (sameDay) return 'Сегодня'
  if (isYest) return 'Вчера'
  return d.toLocaleDateString('ru-RU')
}

/**
 * Если avatar_url — уже публичный URL, возвращаем как есть.
 * Если avatar_url — путь в storage (например "avatars/USERID.png"), 
 * приводим к публичному URL через supabase.storage.getPublicUrl.
 *
 * Замечание: getPublicUrl на публичном bucket возвращает URL без подписей.
 * Если у вас приватный bucket — нужно генерировать signed url на сервере.
 */
async function resolveAvatarUrlIfNeeded(raw: string | null | undefined) {
  if (!raw) return null
  // простая эвристика: если строка уже содержит http/https — возвращаем
  if (/^https?:\/\//i.test(raw)) return raw
  try {
    // предположим bucket называется 'avatars' — поправь, если у тебя другое имя
    const { publicURL } = supabase.storage.from('avatars').getPublicUrl(raw)
    // getPublicUrl синхронный - возвращает { publicURL }
    return publicURL || null
  } catch (e) {
    // в случае ошибки — логируем и возвращаем null
    console.error('resolveAvatarUrlIfNeeded error', e)
    return null
  }
}

/** Новый внешний вид — чистые бэкграунды, без цветного свечения */
function MessageBubble({
  me,
  name,
  text,
  time,
  avatarUrl,
}: {
  me: boolean
  name: string
  text: string
  time: string
  avatarUrl?: string | null
}) {
  // общие стили для пузыря
  const bubbleCommon: React.CSSProperties = {
    padding: '10px 14px',
    borderRadius: 18,
    color: '#fff',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxWidth: '75%',
    boxShadow: '0 6px 18px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.03)',
    lineHeight: 1.35,
  }

  const meStyle: React.CSSProperties = {
    ...bubbleCommon,
    background: 'linear-gradient(180deg, #2a2a2a, #1e1e1e)', // холодный темный градиент
  }

  const otherStyle: React.CSSProperties = {
    ...bubbleCommon,
    background: 'linear-gradient(180deg, rgba(18,22,28,1), rgba(12,14,16,1))', // чуть контрастнее для чужих
  }

  const avatarStyle: React.CSSProperties = {
    width: 40,
    height: 40,
    borderRadius: 999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
    fontWeight: 700,
    color: '#fff',
    flexShrink: 0,
    border: '1px solid rgba(255,255,255,0.04)',
    background: me ? 'linear-gradient(180deg,#343434,#292929)' : 'linear-gradient(180deg,#1b2a37,#0d1519)',
    boxShadow: '0 4px 10px rgba(0,0,0,0.6)',
    overflow: 'hidden',
  }

  const imgStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  }

  const initial = (name?.[0] || '?').toUpperCase()

  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'flex-end',
        justifyContent: me ? 'flex-end' : 'flex-start',
      }}
    >
      {/* avatar left for others */}
      {!me && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            aria-hidden
            style={avatarStyle}
            title={name}
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt={name || 'avatar'} style={imgStyle} />
            ) : (
              initial
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: me ? 'flex-end' : 'flex-start' }}>
        {!me && <div style={{ fontSize: 12, color: '#bfbfbf', marginBottom: 6 }}>{name}</div>}

        <div style={me ? meStyle : otherStyle}>
          {text}
        </div>

        <div style={{ fontSize: 11, color: '#8f8f8f', marginTop: 6 }}>
          {time}
        </div>
      </div>

      {/* avatar right for me */}
      {me && (
        <div
          aria-hidden
          style={{
            ...avatarStyle,
            marginLeft: 6
          }}
          title="Вы"
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="Вы" style={imgStyle} />
          ) : (
            'Я'
          )}
        </div>
      )}
    </div>
  )
}

function ChatPage() {
  const router = useRouter()

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
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const u = window?.Telegram?.WebApp?.initDataUnsafe?.user
    if (u?.id) setTgId(String(u.id))
  }, [])

  const quota = useMemo(() => calcQuota(points, hasNFT), [points, hasNFT])
  const remaining = Math.max(quota - usedToday, 0)

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

  useEffect(() => {
    let cancel = false
    ;(async () => {
      setLoading(true)
      try {
        // 1) получаем последние сообщения
        const { data, error } = await supabase
          .from('chat_messages')
          .select('id,telegram_id,content,created_at')
          .order('created_at', { ascending: true })
          .limit(400)
        if (error) throw error
        const base = (data || []) as ChatRow[]

        // 2) собираем список telegram_id и запрашиваем для них имя + avatar_url
        const tgs = Array.from(new Set(base.map(m => String(m.telegram_id))))
        let nameMap: Record<string, string | null> = {}
        let avatarMap: Record<string, string | null> = {}

        if (tgs.length) {
          const { data: usersRows } = await supabase
            .from('users')
            .select('telegram_id, nonvme, avatar_url')
            .in('telegram_id', tgs as any)

          // Преобразуем в мапу; при необходимости можно преобразовать avatar_url через getPublicUrl
          for (const u of (usersRows ?? []) as any[]) {
            const key = String(u.telegram_id)
            nameMap[key] = u.nonvme || null
            avatarMap[key] = u.avatar_url || null
          }
        }

        // 3) Объединяем
        const withNames = base.map(m => {
          const key = String(m.telegram_id)
          return {
            ...m,
            users: {
              nonvme: nameMap[key] ?? null,
              avatar_url: avatarMap[key] ?? null,
            }
          }
        })

        // 4) resolve public urls if needed (опционально: можно оставить sync, но getPublicUrl sync)
        // Преобразуем все avatar_url, которые не содержат http
        await Promise.all(withNames.map(async (m) => {
          const raw = m.users?.avatar_url
          if (raw && !/^https?:\/\//i.test(raw)) {
            const resolved = await resolveAvatarUrlIfNeeded(raw)
            if (resolved) m.users = { ...m.users, avatar_url: resolved }
          }
        }))

        if (!cancel) setMessages(withNames)
      } catch (e) {
        if (!cancel) console.error(e)
      } finally {
        if (!cancel) setLoading(false)
      }
    })()

    // realtime subscription: при вставке новой строки добавляем также avatar (запрашивая)
        const ch = supabase
          .channel('chat_stream')
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'chat_messages' },
            async (payload: any) => {
              const row = payload.new as ChatRow
              try {
                // если этот id уже есть в локальном стэйте — пропускаем (чтобы не дублировать optimistic insert)
                setMessages(prev => {
                  if (prev.some(m => String(m.id) === String(row.id))) return prev
                  // иначе добавим, но при этом нужно подгрузить user (name+avatar)
                  return [...prev, { ...row, users: { nonvme: null, avatar_url: null } }]
                })

                // отдельно подгружаем данные пользователя и обновляем последовательно (не блокируем UI)
                const { data: u } = await supabase
                  .from('users')
                  .select('nonvme, avatar_url')
                  .eq('telegram_id', row.telegram_id)
                  .maybeSingle()
                let avatar_url = u?.avatar_url ?? null
                if (avatar_url && !/^https?:\/\//i.test(avatar_url)) {
                  avatar_url = await resolveAvatarUrlIfNeeded(avatar_url)
                }
                const nonvme = u?.nonvme ?? null

                // обновляем уже добавленное сообщение с корректными данными пользователя
                setMessages(prev => prev.map(m => {
                  if (String(m.id) !== String(row.id)) return m
                  return { ...m, users: { nonvme, avatar_url } }
                }))
              } catch (e) {
                console.error('Error fetching user for new message', e)
                // если упало при подгрузке пользователя — всё равно добавим сообщение без user (если его ещё нет)
                setMessages(prev => {
                  if (prev.some(m => String(m.id) === String(row.id))) return prev
                  return [...prev, { ...row, users: { nonvme: null, avatar_url: null } }]
                })
              }
            }
          )
          .subscribe()


    return () => { supabase.removeChannel(ch); cancel = true }
  }, [])

  useEffect(() => {
    // автоскролл к последнему сообщению
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

    const send = async () => {
      setError('')
      if (!tgId) { setError('Откройте мини-апп из Telegram'); return }
      if (!eligible) { setError('Недостаточно уровня для отправки'); return }
      if (remaining <= 0) { setError('Лимит сообщений на сегодня исчерпан'); return }
      const body = text.trim()
      if (!body) return
      setSending(true)
      try {
        // вставляем и просим вернуть вставленную строку
        const insertResp = await supabase
          .from('chat_messages')
          .insert([{ telegram_id: tgId, content: body }])
          .select() // вернёт все поля вставленной строки
          .single()

        if (insertResp.error) throw insertResp.error
        const insertedRow = insertResp.data as ChatRow

        // подгружаем имя и avatar для текущего пользователя (вдруг есть обновления)
        let nonvme: string | null = null
        let avatar_url: string | null = null
        try {
          const { data: u } = await supabase
            .from('users')
            .select('nonvme, avatar_url')
            .eq('telegram_id', tgId)
            .maybeSingle()
          nonvme = u?.nonvme ?? null
          avatar_url = u?.avatar_url ?? null
          if (avatar_url && !/^https?:\/\//i.test(avatar_url)) {
            const resolved = await resolveAvatarUrlIfNeeded(avatar_url)
            if (resolved) avatar_url = resolved
          }
        } catch (e) {
          console.error('Error loading user after insert', e)
        }

        // Собираем сообщение в том же формате, как остальные
        const msgWithUser: ChatRow = {
          ...insertedRow,
          users: {
            nonvme,
            avatar_url,
          }
        }

        // Добавляем в локальный state (если вдруг не присутствует)
        setMessages(prev => {
          if (prev.some(m => String(m.id) === String(msgWithUser.id))) return prev
          return [...prev, msgWithUser]
        })

        setText('')
        setUsedToday(v => v + 1)
        // прокрутка
        requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }))
      } catch (e: any) {
        setError(e?.message || 'Не удалось отправить')
      } finally {
        setSending(false)
      }
    }


  const groups = useMemo(() => {
    const map: Record<string, ChatRow[]> = {}
    messages.forEach(m => {
      const k = humanDate(new Date(m.created_at))
      ;(map[k] ||= []).push(m)
    })
    return map
  }, [messages])

  return (
    <div style={{ minHeight:'100vh', background:'#000', color:'#fff', padding:'16px 16px 84px', fontFamily:'sans-serif' }}>
      <h1 style={{ fontSize:22, fontWeight:800, marginBottom:10 }}>Общий чат</h1>

      <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:12 }}>
        <div
          style={{
            background:'#0f0f0f', border:'1px solid #2b2b2b', borderRadius:999,
            padding:4, display:'inline-flex', gap:4
          }}
        >
          <button
            onClick={() => router.push('/feed')}
            style={{
              padding:'8px 14px', borderRadius:999, border:'none', cursor:'pointer',
              background:'transparent', color:'#fff', fontWeight:700, opacity:.9
            }}
          >
            Лента
          </button>
          <button
            disabled
            style={{
              padding:'8px 14px', borderRadius:999, border:'none',
              background:'#fff', color:'#000', fontWeight:800, cursor:'default'
            }}
          >
            Чат
          </button>
        </div>
      </div>

      <div style={{ fontSize:12, opacity:.85, marginBottom:12 }}>
        Баллы: <b>{points}</b> · NFT: <b>{hasNFT ? 'да' : 'нет'}</b> · лимит/день: <b>{quota}</b> · осталось: <b>{remaining}</b>
      </div>

      <div
        ref={listRef}
        style={{
          background:'#080808', border:'1px solid #1f1f1f', borderRadius:18, padding:12,
          height: '54vh', overflowY:'auto', marginBottom:12,
          boxShadow: '0 10px 40px rgba(0,0,0,.35)'
        }}
      >
        {loading ? (
          <div style={{ opacity:.7 }}>Загрузка…</div>
        ) : messages.length === 0 ? (
          <div style={{ opacity:.7 }}>Пока пусто</div>
        ) : (
          Object.entries(groups).map(([day, rows]) => (
            <div key={day} style={{ marginBottom: 14 }}>
              <div
                style={{
                  textAlign:'center', fontSize:11, color:'#9a9a9a',
                  margin: '8px 0 12px',
                }}
              >
                {day}
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                {rows.map(m => {
                  const me = String(m.telegram_id) === String(tgId)
                  const name = m.users?.nonvme || String(m.telegram_id)
                  const tm = new Date(m.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute:'2-digit' })
                  const avatarUrl = m.users?.avatar_url ?? null
                  return (
                    <MessageBubble
                      key={m.id}
                      me={me}
                      name={name}
                      text={m.content}
                      time={tm}
                      avatarUrl={avatarUrl}
                    />
                  )
                })}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{
        background:'#0f0f0f', border:'1px solid #2a2a2a', borderRadius:18, padding:12,
        boxShadow:'0 10px 40px rgba(0,0,0,.35)'
      }}>
        {!eligible && (
          <div style={{ color:'#f5d36c', fontSize:12, marginBottom:8 }}>
            Наберите {LEVEL_THRESHOLD}+ баллов или получите NFT, чтобы писать в чат.
          </div>
        )}

        <div style={{ display:'flex', alignItems:'flex-end', gap:10 }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={eligible ? 'Напишите сообщение…' : 'Недоступно для отправки'}
            rows={3}
            disabled={!eligible}
            style={{
              flex:1, padding:12, background:'#101010', color:'#fff',
              border:'1px solid #2e2e2e', borderRadius:14, resize:'vertical',
              minHeight: 44, maxHeight: 140, lineHeight: 1.35,
              opacity: eligible ? 1 : .6
            }}
          />
          <button
            onClick={send}
            disabled={!eligible || sending || remaining <= 0 || !text.trim()}
            title={eligible ? 'Отправить' : 'Недоступно'}
            style={{
              width: 56, height: 56, borderRadius: 18,
              background: (!eligible || remaining<=0) ? '#4a3c8b' : '#6c56ff',
              border:'none', color:'#fff', fontWeight:800, cursor: (!eligible || remaining<=0) ? 'default' : 'pointer',
              boxShadow:'0 10px 30px rgba(108,86,255,.35)', transform: sending ? 'scale(.98)' : 'none',
              transition:'transform .08s ease'
            }}
          >
            ➤
          </button>
        </div>

        {error && <div style={{ color:'#f66', fontSize:12, marginTop:8 }}>{error}</div>}
      </div>

      <div style={{ marginTop:'auto' }}>
        <BottomNav />
      </div>
    </div>
  )
}

export default dynamic(() => Promise.resolve(ChatPage), { ssr: false })
