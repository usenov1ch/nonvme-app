// components/NewsCommentSection.tsx
import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

type RawRow = Record<string, any>

type Comment = {
  id: string
  main_news_id: string
  parent_id: string | null
  content: string
  created_at: string
  is_deleted?: boolean
  telegram_id?: string | null
  anonymous_id?: string | null
  author_name?: string | null
  likes?: number
  children?: Comment[]
}

const COMMENTS_TABLE = 'main_news_comments'
const LIKES_TABLE = 'main_news_comment_likes'
const USERS_TABLE = 'users'

function timeAgo(iso?: string) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d`
  return new Date(iso).toLocaleDateString()
}

export default function NewsCommentSection({ newsId }: { newsId: string }) {
  const [flat, setFlat] = useState<Comment[]>([])
  const [tree, setTree] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const parentFieldRef = useRef<'parent_id' | 'parent_comment_id'>('parent_id')
  const chanRef = useRef<any>(null)

  // anon id - only on client
  const getAnonId = () => {
    if (typeof window === 'undefined') return null
    let anon = localStorage.getItem('anonId')
    if (!anon) {
      anon = (typeof crypto !== 'undefined' && (crypto as any).randomUUID)
        ? (crypto as any).randomUUID()
        : 'anon-' + Math.random().toString(36).slice(2, 12)
      localStorage.setItem('anonId', anon)
    }
    return anon
  }

  // normalize DB rows -> Comment[]
  const normalize = async (rows: RawRow[]): Promise<Comment[]> => {
    if (rows.length > 0) {
      const sample = rows[0]
      if (sample.hasOwnProperty('parent_id')) parentFieldRef.current = 'parent_id'
      else if (sample.hasOwnProperty('parent_comment_id')) parentFieldRef.current = 'parent_comment_id'
    }
    const mapped: Comment[] = rows.map(r => ({
      id: String(r.id),
      main_news_id: String(r.main_news_id ?? newsId),
      parent_id: r[parentFieldRef.current] ? String(r[parentFieldRef.current]) : null,
      content: r.content ?? r.text ?? '',
      created_at: r.created_at ?? new Date().toISOString(),
      telegram_id: r.telegram_id != null ? String(r.telegram_id) : null,
      anonymous_id: r.anonymous_id ?? null,
      is_deleted: !!r.is_deleted,
      likes: Number(r.likes ?? 0),
      author_name: null,
      children: []
    }))

    // fetch names for telegram ids
    const tgIds = Array.from(new Set(mapped.filter(m => m.telegram_id).map(m => m.telegram_id))) as string[]
    if (tgIds.length) {
      const { data: usersRows } = await supabase
        .from(USERS_TABLE)
        .select('telegram_id, nonvme')
        .in('telegram_id', tgIds as any)
      const nameMap: Record<string, string> = {}
      ;(usersRows ?? []).forEach((u: any) => {
        nameMap[String(u.telegram_id)] = u.nonvme ?? ''
      })
      mapped.forEach(m => {
        if (m.telegram_id && nameMap[m.telegram_id]) m.author_name = nameMap[m.telegram_id]
      })
    }
    mapped.forEach(m => {
      if (!m.author_name) {
        if (m.anonymous_id && String(m.anonymous_id).startsWith('anon-')) m.author_name = 'Аноним'
        else if (m.telegram_id) m.author_name = `User ${m.telegram_id}`
        else m.author_name = 'Аноним'
      }
    })
    return mapped
  }

  const buildTree = (items: Comment[]) => {
    const byId: Record<string, Comment> = {}
    items.forEach(i => { byId[i.id] = { ...i, children: [] } })
    const roots: Comment[] = []
    items.forEach(i => {
      if (i.parent_id && byId[i.parent_id]) byId[i.parent_id].children!.push(byId[i.id])
      else roots.push(byId[i.id])
    })
    const sortRec = (arr: Comment[]) => {
      arr.sort((a,b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      arr.forEach(x => x.children && sortRec(x.children))
    }
    sortRec(roots)
    return roots
  }

  const fetchComments = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from(COMMENTS_TABLE)
        .select('*')
        .eq('main_news_id', newsId)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('fetch comments err', error)
        setFlat([])
        setTree([])
        return
      }
      const rows = (data ?? []) as RawRow[]
      const normalized = await normalize(rows)
      setFlat(normalized)
      setTree(buildTree(normalized))
    } catch (e) {
      console.error('fetchComments fatal', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!newsId) return
    fetchComments()

    try {
      const ch = supabase
        .channel(`news-comments-${newsId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: COMMENTS_TABLE, filter: `main_news_id=eq.${newsId}` }, () => fetchComments())
        .on('postgres_changes', { event: '*', schema: 'public', table: LIKES_TABLE }, () => fetchComments())
        .subscribe()
      chanRef.current = ch
    } catch (e) {
      console.warn('subscribe failed', e)
    }

    return () => {
      try { if (chanRef.current) supabase.removeChannel(chanRef.current) } catch (e) {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newsId])

  // insert with fallback for parent field name
  const insertComment = async (payload: Record<string, any>) => {
    try {
      const { data, error } = await supabase.from(COMMENTS_TABLE).insert([payload]).select()
      if (error) {
        const msg = String(error.message || '')
        if (msg.includes('column') && (msg.includes('does not exist') || msg.includes('not found'))) {
          const alt = parentFieldRef.current === 'parent_id' ? 'parent_comment_id' : 'parent_id'
          const newPayload = { ...payload }
          if (payload[parentFieldRef.current]) {
            newPayload[alt] = payload[parentFieldRef.current]
            delete newPayload[parentFieldRef.current]
          }
          parentFieldRef.current = alt
          const retry = await supabase.from(COMMENTS_TABLE).insert([newPayload]).select()
          if (retry.error) throw retry.error
          return retry.data
        }
        // log full error for easier debugging
        console.error('insertComment error:', error, 'payload:', payload)
        throw error
      }
      return data
    } catch (e) {
      console.error('insertComment fatal', e)
      throw e
    }
  }

  const handleSend = async () => {
    if (!text.trim()) return
    setSubmitting(true)
    try {
      // get telegram user (if any)
      const tgUser = (typeof window !== 'undefined') ? (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user : null
      const telegram_id = tgUser?.id ? String(tgUser.id) : null

      // ensure anonymous id exists on client if no telegram
      let anonymous_id: string | null = null
      if (!telegram_id && typeof window !== 'undefined') {
        anonymous_id = localStorage.getItem('anonId')
        if (!anonymous_id) {
          anonymous_id = (typeof crypto !== 'undefined' && (crypto as any).randomUUID)
            ? (crypto as any).randomUUID()
            : 'anon-' + Math.random().toString(36).slice(2, 12)
          localStorage.setItem('anonId', anonymous_id)
        }
      }

      const parentKey = parentFieldRef.current || 'parent_id'
      const payload: Record<string, any> = {
        main_news_id: newsId,
        content: text.trim(),
      }

      if (telegram_id) payload.telegram_id = telegram_id
      else if (anonymous_id) payload.anonymous_id = anonymous_id

      payload[parentKey] = replyTo ?? null

      // DEBUG LOG: покажем, что реально уходит на сервер
      // -> открой DevTools Console и посмотри этот лог при отправке
      console.log('DEBUG -> inserting main_news_comments payload:', payload, { telegram_id, anonymous_id })

      await insertComment(payload)
      setText('')
      setReplyTo(null)
      // небольшая задержка, чтобы realtime успел отработать; всё равно подгружаем свежие комменты
      setTimeout(fetchComments, 200)
    } catch (err: any) {
      console.error('send comment failed', err)
      // показываем пользователю короткое сообщение с причиной (если есть)
      const message = err?.message ?? String(err)
      alert('Не удалось отправить комментарий: ' + message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleLike = async (commentId: string) => {
    try {
      const tgUser = (typeof window !== 'undefined') ? (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user : null
      let telegram_id = tgUser?.id ? String(tgUser.id) : null
      let author_id = telegram_id ?? getAnonId()
      if (!author_id) return

      const { data: existing } = await supabase
        .from(LIKES_TABLE)
        .select('id')
        .eq('comment_id', commentId)
        .eq('author_id', author_id)
        .limit(1)

      if (existing && existing.length) return

      const { error: insertErr } = await supabase.from(LIKES_TABLE).insert([{ comment_id: commentId, author_id }])
      if (insertErr) {
        console.error('like insert err', insertErr)
      } else {
        // rely on realtime updates for counts
        fetchComments()
      }
    } catch (e) {
      console.error('handleLike fatal', e)
    }
  }

  // UI helpers
  const ReplyLine: React.FC<{ onCancel: () => void, name?: string }> = ({ onCancel, name }) => (
    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
      <div style={{ fontSize:13, color:'#dcdcdc' }}>{name ? `Ответ: ${name}` : 'Ответ'}</div>
      <button onClick={onCancel} style={{ marginLeft:'auto', background:'transparent', border:'none', color:'#aaa', cursor:'pointer' }}>Отменить</button>
    </div>
  )

  const CommentNode: React.FC<{ c: Comment, depth?: number }> = ({ c, depth=0 }) => (
    <div style={{ marginLeft: depth * 12, marginTop: 8 }}>
      <div style={{ padding: 12, background:'rgba(255,255,255,0.02)', borderRadius:10 }}>
        <div style={{ display:'flex', justifyContent:'space-between', gap:8 }}>
          <div style={{ fontWeight:700, color:'#fff' }}>{c.author_name}</div>
          <div style={{ color:'#9a9a9a', fontSize:12 }}>{timeAgo(c.created_at)}</div>
        </div>
        <div style={{ marginTop:8, color:'#eaeaea', whiteSpace:'pre-wrap' }}>{c.content}</div>
        <div style={{ display:'flex', gap:10, marginTop:10, alignItems:'center' }}>
          <button onClick={() => { setReplyTo(c.id); (document.getElementById('news-comment-input') as HTMLInputElement | null)?.focus() }} style={{ background:'transparent', border:'none', color:'#bdbdbd', cursor:'pointer' }}>Ответить</button>
          <button onClick={() => handleLike(c.id)} style={{ background:'transparent', border:'none', color:'#bdbdbd', cursor:'pointer' }}>
            
          </button>
        </div>
      </div>

      {c.children && c.children.length > 0 && (
        <div>
          {c.children.map(child => <CommentNode key={child.id} c={child} depth={depth+1} />)}
        </div>
      )}
    </div>
  )

  return (
    <div style={{ marginTop:12 }}>
      <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:8 }}>
        <input
          id="news-comment-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={replyTo ? 'Напишите ответ...' : 'Напишите комментарий...'}
          style={{
            flex: 1,
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.06)',
            background: 'rgba(0,0,0,0.45)',
            color: '#fff',
            outline: 'none',
            fontSize: 14
          }}
        />
        <button
          onClick={handleSend}
          disabled={submitting || !text.trim()}
          style={{
            padding: '10px 14px',
            borderRadius: 10,
            border: 'none',
            background: submitting ? '#555' : 'linear-gradient(90deg,#7c5cff,#a975ff)',
            color: '#fff',
            fontWeight: 700,
            cursor: submitting ? 'default' : 'pointer'
          } as any}
        >
          {submitting ? 'Отправка...' : (replyTo ? 'Ответить' : 'Отправить')}
        </button>
      </div>

      {replyTo && <ReplyLine onCancel={() => setReplyTo(null)} name={flat.find(x => x.id === replyTo)?.author_name} />}

      <div>
        {loading ? (
          <div style={{ color:'#aaa' }}>Загрузка комментариев...</div>
        ) : tree.length === 0 ? (
          <div style={{ color:'#888' }}>Пока нет комментариев — будь первым!</div>
        ) : (
          tree.map(c => <CommentNode key={c.id} c={c} />)
        )}
      </div>
    </div>
  )
}
