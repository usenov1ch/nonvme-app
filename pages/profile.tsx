// pages/profile.tsx
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import BottomNav from '../components/BottomNav'
import CreatePollForm from '../components/CreatePollForm'
import TopicSelector from '../components/TopicSelector'
import AdminNewsForm from '../components/AdminNewsForm'

declare global { interface Window { Telegram?: any } }

type UserRow = {
  id?: string
  nonvme?: string
  registered_at?: string
  avatar_url?: string | null
  telegram_id?: number | null
  telegram_id_text?: string | null
}

export default function ProfilePage() {
  const [user, setUser] = useState<UserRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // IMPORTANT: initialize from localStorage so page works outside Telegram WebApp
  const [tgIdStr, setTgIdStr] = useState<string>(() => {
    if (typeof window === 'undefined') return ''
    return localStorage.getItem('tgId') ?? ''
  })
  const [isAdmin, setIsAdmin] = useState(false)

  // upload state
  const [preview, setPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [actionMsg, setActionMsg] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const lastBlobRef = useRef<string | null>(null)

  // get tg id from Telegram WebApp if available — persist to localStorage too
  useEffect(() => {
    try {
      const u = (typeof window !== 'undefined') ? window.Telegram?.WebApp?.initDataUnsafe?.user : null
      if (u?.id) {
        const s = String(u.id)
        setTgIdStr(s)
        try { localStorage.setItem('tgId', s) } catch {}
      }
    } catch (e) {
      // ignore
    }
  }, [])

  // fetch profile
  const fetchProfile = async (idStr: string) => {
    setLoading(true)
    setError('')
    try {
      const maybeNum = Number(idStr)
      if (!Number.isNaN(maybeNum)) {
        const { data: byNum, error: errNum } = await supabase
          .from('users')
          .select('id, nonvme, registered_at, avatar_url, telegram_id, telegram_id_text')
          .eq('telegram_id', maybeNum)
          .limit(1)
          .maybeSingle()
        if (errNum) console.warn('[Profile] byNum error', errNum)
        if (byNum) { setUser(byNum as UserRow); setLoading(false); return }
      }

      const { data: byText, error: errText } = await supabase
        .from('users')
        .select('id, nonvme, registered_at, avatar_url, telegram_id, telegram_id_text')
        .eq('telegram_id_text', idStr)
        .limit(1)
        .maybeSingle()
      if (errText) console.warn('[Profile] byText error', errText)
      if (byText) { setUser(byText as UserRow); setLoading(false); return }

      setUser(null)
      setError('Профиль не найден.')
    } catch (e) {
      console.error('[Profile] fetchProfile failed', e)
      setError('Ошибка при загрузке профиля.')
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!tgIdStr) return
    fetchProfile(tgIdStr)
  }, [tgIdStr])

  // check admin — safe: check only numeric telegram_id (your table has telegram_id int8)
  useEffect(() => {
    if (!tgIdStr) {
      setIsAdmin(false)
      return
    }
    ;(async () => {
      try {
        const maybeNum = Number(tgIdStr)
        if (!Number.isNaN(maybeNum)) {
          const { data } = await supabase
            .from('admin_publishers')
            .select('telegram_id')
            .eq('telegram_id', maybeNum)
            .limit(1)
            .maybeSingle()
          setIsAdmin(!!data)
        } else {
          // no numeric id — table doesn't have text column, so default to false
          setIsAdmin(false)
        }
      } catch (e) {
        console.error('[Profile] admin check failed', e)
        setIsAdmin(false)
      }
    })()
  }, [tgIdStr])

  // helper: safe get public url (both publicURL/publicUrl)
  const getPublicUrl = (path?: string | null) => {
    if (!path) return null
    if (path.startsWith('http')) return path
    try {
      const res = supabase.storage.from('avatars').getPublicUrl(path) as any
      return res?.publicURL ?? res?.publicUrl ?? null
    } catch {
      return null
    }
  }

  // click file picker
  const onPickClick = () => inputRef.current?.click()

  // this function mirrors your CreatePollForm logic: upload to bucket, then getPublicUrl and save the public URL
  const uploadAvatarLikeFeed = async (file: File) => {
    setActionMsg('')
    if (!file) { setActionMsg('Файл не выбран'); return }
    if (!tgIdStr) { setActionMsg('Откройте мини-апп в Telegram'); return }

    setUploading(true)
    try {
      // size guard
      const MAX = 5 * 1024 * 1024
      if (file.size > MAX) {
        setActionMsg('Файл слишком большой (макс 5MB).')
        setUploading(false)
        return
      }

      // build path similar to feed (you used polls/<ts>.<ext>), here use avatars/<ts>.<ext>
      const ext = (file.name.split('.').pop() || 'png').replace(/[^a-z0-9]/gi, '').toLowerCase()
      const filePath = `avatars/${tgIdStr}/${Date.now()}.${ext}` // folder avatars/<tgid>/...
      // Use same style as feed: upload to storage then getPublicUrl
      const { error: uploadError } = await supabase.storage.from('media').upload(filePath, file)
      // NOTE: in feed you used bucket 'media' and getPublicUrl(filePath) -> data.publicUrl
      // Here we follow same approach but use bucket 'avatars' — but if you prefer using 'media' bucket for avatars too, change accordingly.
      // If you want to use bucket 'avatars', change above .from('media') -> .from('avatars')
      if (uploadError) {
        console.error('[Profile] storage.upload error', uploadError)
        setActionMsg('Ошибка загрузки: ' + (uploadError.message || uploadError.toString()))
        setUploading(false)
        return
      }

      // get public URL (like in feed)
      // if you uploaded to bucket 'media' use that; adjust to the chosen bucket
      const { data: publicData } = supabase.storage.from('media').getPublicUrl(filePath) as any
      const publicUrl = publicData?.publicUrl ?? publicData?.publicURL ?? null

      // Save publicUrl into users.avatar_url to simplify display (same pattern as feed saved media_url)
      if (publicUrl) {
        const maybeNum = Number(tgIdStr)
        let upd
        if (!Number.isNaN(maybeNum)) {
          upd = await supabase.from('users').update({ avatar_url: publicUrl }).eq('telegram_id', maybeNum)
        } else {
          upd = await supabase.from('users').update({ avatar_url: publicUrl }).eq('telegram_id_text', tgIdStr)
        }

        if ((upd as any).error) {
          console.error('[Profile] users update error', (upd as any).error)
          setActionMsg('Аватар загружен, но не удалось сохранить в профиле (проверьте права таблицы users).')
          // still set preview
          setPreview(publicUrl)
          setUser(prev => prev ? { ...prev, avatar_url: publicUrl } : prev)
        } else {
          setActionMsg('Аватар успешно обновлён.')
          setPreview(publicUrl)
          setUser(prev => prev ? { ...prev, avatar_url: publicUrl } : prev)
        }
      } else {
        // public url not available: fallback to blob preview and store path (or leave null)
        const blobUrl = URL.createObjectURL(file)
        if (lastBlobRef.current && lastBlobRef.current.startsWith('blob:')) {
          try { URL.revokeObjectURL(lastBlobRef.current) } catch {}
        }
        lastBlobRef.current = blobUrl
        setPreview(blobUrl)

        // optional: save filePath as avatar_url (path) if you prefer
        const maybeNum = Number(tgIdStr)
        let upd2
        if (!Number.isNaN(maybeNum)) {
          upd2 = await supabase.from('users').update({ avatar_url: filePath }).eq('telegram_id', maybeNum)
        } else {
          upd2 = await supabase.from('users').update({ avatar_url: filePath }).eq('telegram_id_text', tgIdStr)
        }
        if ((upd2 as any).error) {
          console.warn('[Profile] could not save avatar path to users', (upd2 as any).error)
          setActionMsg('Аватар загружен, но не удалось сохранить путь в профиле.')
        } else {
          setUser(prev => prev ? { ...prev, avatar_url: filePath } : prev)
          setActionMsg('Аватар загружен (превью локальное).')
        }
      }
    } catch (e: any) {
      console.error('[Profile] uploadAvatarLikeFeed error', e)
      setActionMsg(e?.message || 'Ошибка при загрузке.')
    } finally {
      setUploading(false)
    }
  }

  // file change handler uses same simple flow as CreatePollForm's file handling
  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setActionMsg('')
    const f = e.target.files?.[0] ?? null
    if (!f) return
    if (!f.type.startsWith('image/')) {
      setActionMsg('Выберите изображение.')
      return
    }
    if (!tgIdStr) {
      setActionMsg('Откройте мини-апп в Telegram.')
      return
    }

    // show immediate preview
    const blob = URL.createObjectURL(f)
    if (lastBlobRef.current && lastBlobRef.current.startsWith('blob:')) {
      try { URL.revokeObjectURL(lastBlobRef.current) } catch {}
    }
    lastBlobRef.current = blob
    setPreview(blob)

    // upload (uses same pattern as feed)
    await uploadAvatarLikeFeed(f)

    // clear input value so same file can be re-selected later
    if (inputRef.current) inputRef.current.value = ''
  }

  // delete avatar (tries storage remove + clears DB)
  const deleteAvatar = async () => {
    if (!user?.avatar_url) { setActionMsg('Аватар отсутствует.'); return }
    if (!tgIdStr) { setActionMsg('Нет Telegram ID.'); return }
    setUploading(true)
    setActionMsg('')
    try {
      // If avatar_url is a public URL (not a path), we may not be able to remove file client-side.
      // Attempt best-effort delete: if avatar_url is a path-like string, try remove; otherwise just clear DB.
      const isUrl = user.avatar_url.startsWith('http')
      if (!isUrl) {
        // treat as path and attempt to remove from 'media' bucket (since we uploaded there)
        try {
          await supabase.storage.from('media').remove([user.avatar_url])
        } catch (e) {
          console.warn('[Profile] storage.remove failed', e)
        }
      }

      const maybeNum = Number(tgIdStr)
      let upd
      if (!Number.isNaN(maybeNum)) {
        upd = await supabase.from('users').update({ avatar_url: null }).eq('telegram_id', maybeNum)
      } else {
        upd = await supabase.from('users').update({ avatar_url: null }).eq('telegram_id_text', tgIdStr)
      }

      if ((upd as any).error) {
        console.error('[Profile] users clear error', (upd as any).error)
        setActionMsg('Не удалось очистить avatar_url (проверьте права).')
      } else {
        setUser(prev => prev ? { ...prev, avatar_url: null } : prev)
        setPreview(null)
        setActionMsg('Аватар удалён.')
      }
    } catch (e: any) {
      console.error('[Profile] deleteAvatar error', e)
      setActionMsg(e?.message || 'Ошибка при удалении.')
    } finally {
      setUploading(false)
      if (tgIdStr) fetchProfile(tgIdStr)
    }
  }

  // cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      if (lastBlobRef.current && lastBlobRef.current.startsWith('blob:')) {
        try { URL.revokeObjectURL(lastBlobRef.current) } catch {}
      }
    }
  }, [])

  return (
    <div style={{ minHeight:'100vh', background:'#000', color:'#fff', fontFamily:'sans-serif', padding:'20px 16px 88px' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
        <h1 style={{ fontSize:22, fontWeight:800, margin:0 }}>Профиль</h1>
        {isAdmin && <span style={{ padding:'6px 10px', borderRadius:999, background:'linear-gradient(180deg,#6c56ff,#5846d8)', border:'1px solid #7d6cff', fontSize:12, fontWeight:800 }}>admin</span>}
      </div>

      <div style={{ background:'linear-gradient(180deg,#0d0d0d,#080808)', border:'1px solid #1f1f1f', borderRadius:18, padding:16, boxShadow:'0 10px 40px rgba(0,0,0,.35)', marginBottom:14 }}>
        {loading ? <div style={{ opacity:.7 }}>Загрузка профиля…</div> : error ? <div style={{ color:'#f66' }}>{error}</div> : user ? (
          <div style={{ display:'flex', gap:12, alignItems:'center' }}>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
              <div style={{ width:84, height:84, borderRadius:999, overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', background:'#121212', border:'1px solid rgba(255,255,255,0.03)', boxShadow:'0 6px 18px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.02)', flexShrink:0 }}>
                {(preview || user.avatar_url) ? (
                  <img src={ preview ?? getPublicUrl(user.avatar_url) ?? undefined } alt="avatar" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                ) : (
                  <div style={{ fontSize:34, fontWeight:800, color:'#e6e6e6' }}>{(user.nonvme?.[0] || 'U').toUpperCase()}</div>
                )}
              </div>

              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <button
                  onClick={onPickClick}
                  disabled={uploading}
                  style={{
                    padding:'8px 12px',
                    borderRadius:10,
                    border:'none',
                    background:'linear-gradient(180deg,#5f7bff,#4456d9)',
                    color:'#fff',
                    cursor: uploading ? 'default' : 'pointer',
                    fontWeight:700,
                    fontSize:13
                  }}
                >
                  {uploading ? 'Загрузить...' : 'Загрузить'}
                </button>

                {user.avatar_url && (
                  <button
                    onClick={deleteAvatar}
                    disabled={uploading}
                    style={{
                      padding:'8px 10px',
                      borderRadius:10,
                      border:'1px solid #2b2b2b',
                      background:'#111',
                      color:'#fff',
                      cursor: uploading ? 'default' : 'pointer',
                      fontSize:13
                    }}
                  >
                    Удалить
                  </button>
                )}

                <input ref={inputRef} type="file" accept="image/*" onChange={onFileChange} style={{ display:'none' }} />
              </div>

              {preview && <div style={{ marginTop:6, fontSize:12, color:'#bdbdbd' }}>Предпросмотр...</div>}
              {actionMsg && <div style={{ fontSize:12, color: actionMsg.toLowerCase().includes('ошибка') ? '#f66' : '#bdbdbd', marginTop:6 }}>{actionMsg}</div>}
            </div>

            <div style={{ flex:1 }}>
              <div style={{ fontSize:18, fontWeight:800, marginBottom:2 }}>{user.nonvme}</div>
              <div style={{ fontSize:12, color:'#a0a0a0', marginBottom:10 }}>@{(user.nonvme || '').toLowerCase().replace(/\s+/g,'')}</div>

              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                <div style={chipStyle}>Регистрация:&nbsp;<b>{user.registered_at ? new Date(user.registered_at).toLocaleDateString('ru-RU') : '-'}</b></div>
                <div style={chipStyle}>Голосов: <b>0</b></div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <SectionCard title="Моя лента: темы" description="Выберите интересующие темы — лента станет персональной.">
        <TopicSelector title="" />
      </SectionCard>

      <SectionCard title="" description="">
        <CreatePollForm />
      </SectionCard>

      {isAdmin && tgIdStr && (
        <SectionCard title="Новости проекта" description="Эти публикации видят все пользователи в разделе «Новости»." accent>
          <AdminNewsForm tgId={tgIdStr} />
        </SectionCard>
      )}

      <div style={{ marginTop:18 }}><BottomNav /></div>
    </div>
  )
}

/* — helpers — */

function SectionCard({ title, description, children, accent = false }: { title: string; description?: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <div style={{ background:'linear-gradient(180deg,#0d0d0d,#080808)', border:`1px solid ${accent ? '#2d2768' : '#1f1f1f'}`, borderRadius:18, padding:16, boxShadow: accent ? '0 10px 40px rgba(108,86,255,.18)' : '0 10px 40px rgba(0,0,0,.35)', marginBottom:14 }}>
      <div style={{ fontWeight:800, marginBottom:6, fontSize:16 }}>{title}</div>
      {description && <div style={{ fontSize:12, color:'#9a9a9a', marginBottom:10 }}>{description}</div>}
      {children}
    </div>
  )
}

const chipStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 999,
  background: '#121212',
  border: '1px solid #252525',
  fontSize: 12,
  color: '#d6d6d6',
}
