// pages/creators.tsx — Лента для публичных лиц (клиент-только)
import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import BottomNav from '../components/BottomNav'

/* declare global { interface Window { Telegram?: any } } */

type Channel = {
  id: string
  owner_tg_id: string
  title: string
  description?: string | null
  cover_url?: string | null
  created_at: string
}

type CPost = {
  id: string
  channel_id: string
  telegram_id: string
  content: string
  media_url?: string | null
  created_at: string
  channel?: { title: string } | null
  users?: { nonvme?: string | null } | null
}

const LEVEL_THRESHOLD = 100

function CreatorHubPage() {
  const [tgId, setTgId] = useState<string>('')

  const [eligible, setEligible] = useState<boolean | null>(null)
  const [myPoints, setMyPoints] = useState<number>(0)
  const [checking, setChecking] = useState(true)

  const [myChannel, setMyChannel] = useState<Channel | null>(null)
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [cover, setCover] = useState<File | null>(null)
  const [err, setErr] = useState('')

  const [posts, setPosts] = useState<CPost[]>([])
  const [loadingPosts, setLoadingPosts] = useState(true)
  const [newPost, setNewPost] = useState('')
  const [newFile, setNewFile] = useState<File | null>(null)
  const [publishing, setPublishing] = useState(false)

  // client-only: читаем Telegram ID
  useEffect(() => {
    const u = window?.Telegram?.WebApp?.initDataUnsafe?.user
    if (u?.id) setTgId(String(u.id))
  }, [])

  // проверка допуска
  useEffect(() => {
    if (!tgId) return
    let cancel = false
    ;(async () => {
      setChecking(true)
      try {
        const { data: up } = await supabase
          .from('user_points')
          .select('points')
          .eq('telegram_id', tgId)
          .maybeSingle()
        const pts = up?.points ?? 0

        const { data: ap } = await supabase
          .from('public_approvals')
          .select('telegram_id')
          .eq('telegram_id', tgId)
          .maybeSingle()

        const ok = (pts >= LEVEL_THRESHOLD) || !!ap
        if (!cancel) {
          setMyPoints(pts)
          setEligible(ok)
        }
      } finally {
        if (!cancel) setChecking(false)
      }
    })()
    return () => { cancel = true }
  }, [tgId])

  // мой канал
  useEffect(() => {
    if (!tgId || !eligible) return
    let cancel = false
    ;(async () => {
      const { data } = await supabase
        .from('creator_channels')
        .select('*')
        .eq('owner_tg_id', tgId)
        .maybeSingle()
      if (!cancel) setMyChannel(data ?? null)
    })()
    return () => { cancel = true }
  }, [tgId, eligible])

  // посты публичных каналов + имена авторов (вторым запросом)
  useEffect(() => {
    if (!eligible) return
    let cancel = false
    ;(async () => {
      setLoadingPosts(true)
      try {
        const { data, error } = await supabase
          .from('creator_posts')
          .select(`
            id,
            channel_id,
            telegram_id,
            content,
            media_url,
            created_at,
            channel:channel_id ( title )
          `)
          .order('created_at', { ascending: false })
          .limit(200)
        if (error) throw error

        // ---------- НОРМАЛИЗАЦИЯ DATA в CPost[] ----------
        const raw = (data ?? []) as any[]

        const base: CPost[] = raw.map((item: any) => {
          const chRaw = item.channel
          const ch = Array.isArray(chRaw) ? chRaw[0] : chRaw

          return {
            id: String(item.id ?? ''),
            channel_id: String(item.channel_id ?? ''),
            telegram_id: String(item.telegram_id ?? ''),
            content: item.content ?? '',
            media_url: item.media_url ?? null,
            created_at: item.created_at ?? null,
            channel: {
              title: String(ch?.title ?? '')
            }
          } as CPost
        })
        // -------------------------------------------------

        const tgs = Array.from(new Set(base.map(p => String(p.telegram_id)))).filter(Boolean)

        let nameMap: Record<string, string | null> = {}
        if (tgs.length) {
          const { data: usersRows } = await supabase
            .from('users')
            .select('telegram_id, nonvme')
            .in('telegram_id', tgs as any)
          nameMap = Object.fromEntries((usersRows ?? []).map((u: any) => [String(u.telegram_id), u.nonvme || null]))
        }

        const enriched = base.map(p => ({
          ...p,
          users: { nonvme: nameMap[String(p.telegram_id)] ?? null }
        }))

        if (!cancel) setPosts(enriched)
      } catch (e) {
        if (!cancel) setPosts([])
        console.error('creator posts load error:', e)
      } finally {
        if (!cancel) setLoadingPosts(false)
      }
    })()
    return () => { cancel = true }
  }, [eligible])


  const createChannel = async () => {
    if (!tgId || !eligible) return
    if (!title.trim()) { setErr('Введите название канала'); return }
    setErr(''); setCreating(true)
    try {
      let cover_url: string | null = null
      if (cover) {
        const ext = cover.name.split('.').pop()
        const filePath = `creator_covers/${tgId}_${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage.from('media').upload(filePath, cover)
        if (upErr) throw upErr
        const { data } = supabase.storage.from('media').getPublicUrl(filePath)
        cover_url = data.publicUrl
      }
      const { data, error } = await supabase
        .from('creator_channels')
        .insert([{ owner_tg_id: tgId, title: title.trim(), description: desc.trim() || null, cover_url }])
        .select('*')
        .single()
      if (error) throw error
      setMyChannel(data as Channel)
      setTitle(''); setDesc(''); setCover(null)
    } catch (e: any) {
      setErr(e?.message || 'Ошибка создания канала')
    } finally {
      setCreating(false)
    }
  }

  const publish = async () => {
    if (!tgId || !eligible || !myChannel) return
    const text = newPost.trim()
    if (!text && !newFile) return
    setPublishing(true); setErr('')
    try {
      let media_url: string | null = null
      if (newFile) {
        const ext = newFile.name.split('.').pop()
        const filePath = `creator_posts/${myChannel.id}_${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage.from('media').upload(filePath, newFile)
        if (upErr) throw upErr
        const { data } = supabase.storage.from('media').getPublicUrl(filePath)
        media_url = data.publicUrl
      }
      const { data, error } = await supabase
        .from('creator_posts')
        .insert([{ channel_id: myChannel.id, telegram_id: tgId, content: text, media_url }])
        .select(`
          id,
          channel_id,
          telegram_id,
          content,
          media_url,
          created_at,
          channel:channel_id ( title )
        `)
        .single()
      if (error) throw error

      let nonvme: string | null = null
      const { data: uRow } = await supabase
        .from('users')
        .select('nonvme')
        .eq('telegram_id', tgId)
        .maybeSingle()
      nonvme = uRow?.nonvme ?? null

      // Нормализуем ответ (data) в форму CPost
      const rawObj = Array.isArray(data) ? data[0] : data // если вдруг data приходит массивом
      const rp: any = rawObj ?? {}

      const chRaw = rp.channel
      const ch = Array.isArray(chRaw) ? chRaw[0] : chRaw

      const normalizedPost: CPost = {
        id: String(rp.id ?? ''),
        channel_id: String(rp.channel_id ?? ''),
        telegram_id: String(rp.telegram_id ?? ''),
        content: rp.content ?? '',
        media_url: rp.media_url ?? null,
        created_at: rp.created_at ?? null,
        channel: { title: String(ch?.title ?? '') }
      }

      // Добавляем пользователя и пушим в стейт
      setPosts(prev => [{ ...normalizedPost, users: { nonvme } }, ...prev])

      setNewPost(''); setNewFile(null)
    } catch (e: any) {
      setErr(e?.message || 'Ошибка публикации')
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div style={{ minHeight:'100vh', background:'#000', color:'#fff', padding:'20px 20px 88px', fontFamily:'sans-serif' }}>
      <h1 style={{ fontSize:22, fontWeight:800, marginBottom:12 }}>Публичные каналы</h1>

      {checking ? (
        <div style={{ opacity:.7 }}>Проверка доступа…</div>
      ) : eligible ? (
        <>
          {!myChannel ? (
            <div style={{ background:'#111', border:'1px solid #333', borderRadius:16, padding:14, marginBottom:16 }}>
              <div style={{ fontWeight:700, marginBottom:8 }}>Создать канал</div>
              <input
                value={title}
                onChange={(e)=>setTitle(e.target.value)}
                placeholder="Название канала"
                style={{ width:'100%', padding:10, background:'#0f0f0f', color:'#fff', border:'1px solid #333', borderRadius:10, marginBottom:8 }}
              />
              <textarea
                value={desc}
                onChange={(e)=>setDesc(e.target.value)}
                placeholder="Описание (необязательно)"
                rows={3}
                style={{ width:'100%', padding:10, background:'#0f0f0f', color:'#fff', border:'1px solid #333', borderRadius:10, marginBottom:8, resize:'vertical' }}
              />
              <input type="file" accept="image/*" onChange={(e)=>setCover(e.target.files?.[0] || null)} style={{ marginBottom:8 }} />
              {err && <div style={{ color:'#f66', fontSize:12, marginBottom:8 }}>{err}</div>}
              <button
                onClick={createChannel}
                disabled={creating || !title.trim()}
                style={{ padding:'10px 12px', borderRadius:10, background: creating?'#473a7d':'#2e2159', color:'#fff', border:'none', fontWeight:700 }}
              >
                {creating ? 'Создание…' : 'Создать канал'}
              </button>
            </div>
          ) : (
            <div style={{ background:'#111', border:'1px solid #333', borderRadius:16, padding:14, marginBottom:16 }}>
              <div style={{ display:'flex', gap:12 }}>
                {myChannel.cover_url && (
                  <img src={myChannel.cover_url} style={{ width:72, height:72, objectFit:'cover', borderRadius:12 }} />
                )}
                <div>
                  <div style={{ fontWeight:800 }}>{myChannel.title}</div>
                  {myChannel.description && <div style={{ opacity:.8, fontSize:13 }}>{myChannel.description}</div>}
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Новый пост</div>

                <textarea
                    value={newPost}
                    onChange={(e) => setNewPost(e.target.value)}
                    placeholder="Введите текст поста..."
                    rows={3}
                    style={{
                    width: '95%',
                    padding: 10,
                    background: '#0f0f0f',
                    color: '#fff',
                    border: '1px solid #333',
                    borderRadius: 10,
                    resize: 'vertical', // ✅ можно растягивать
                    marginBottom: 8,
                    fontFamily: 'inherit',
                    }}
                />

                <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setNewFile(e.target.files?.[0] || null)}
                    style={{ marginBottom: 8 }}
                />

                <button
                    onClick={publish}
                    disabled={publishing || (!newPost.trim() && !newFile)}
                    style={{
                    width: '100%',
                    padding: '10px 0',
                    borderRadius: 10,
                    background: publishing ? '#473a7d' : '#2e2159',
                    color: '#fff',
                    border: 'none',
                    fontWeight: 700,
                    cursor: publishing ? 'default' : 'pointer',
                    opacity: publishing ? 0.8 : 1,
                    }}
                >
                    {publishing ? 'Публикация…' : 'Опубликовать'}
                </button>

                {err && (
                    <div style={{ color: '#f66', fontSize: 12, marginTop: 8 }}>{err}</div>
                )}
                </div>
            </div>
          )}

          <h2 style={{ fontSize:18, fontWeight:800, marginBottom:10 }}>Посты публичных каналов</h2>
          {loadingPosts ? (
            <div>Загрузка…</div>
          ) : posts.length === 0 ? (
            <div style={{ opacity:.7 }}>Пока нет публикаций</div>
          ) : posts.map(p => (
            <div key={p.id} style={{ background:'#111', border:'1px solid #333', borderRadius:16, padding:14, marginBottom:12 }}>
              <div style={{ fontSize:12, opacity:.7, marginBottom:6 }}>
                {p.channel?.title || 'Канал'} · {p.users?.nonvme || p.telegram_id} · {new Date(p.created_at).toLocaleString()}
              </div>
              <div style={{ whiteSpace:'pre-wrap' }}>{p.content}</div>
              {p.media_url && (
                <img src={p.media_url} alt="" style={{ width:'100%', borderRadius:10, marginTop:8 }} />
              )}
            </div>
          ))}
        </>
      ) : (
        <div style={{ background:'#111', border:'1px solid #333', borderRadius:16, padding:14 }}>
          <div style={{ fontWeight:800, marginBottom:8 }}>Доступ ограничен</div>
          <div style={{ opacity:.85, marginBottom:6 }}>
            Чтобы публиковать как публичное лицо, нужно пройти отбор или набрать {LEVEL_THRESHOLD} баллов активности.
          </div>
          <div style={{ opacity:.8, fontSize:13 }}>
            Ваши баллы: <b>{myPoints}</b>. Продолжайте выполнять миссии на вкладке «active blocks».
          </div>
        </div>
      )}

      <div style={{ marginTop:'auto' }}>
        <BottomNav />
      </div>
    </div>
  )
}

// отключаем SSR для страницы целиком (исключает любые hydration-конфликты)
export default dynamic(() => Promise.resolve(CreatorHubPage), { ssr: false })
