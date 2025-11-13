// components/CommentSection.tsx
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

type CommentRaw = Record<string, any>

type Comment = {
  id: string
  text: string
  created_at: string
  parent_comment_id: string | null
  likes: number
  author_id: string | null
  poll_id: string
  author_name?: string | null
}

const USERS_TABLE = 'users' // expects columns: telegram_id, nonvme (registration username)

export default function CommentSection({ pollId }: { pollId: string }) {
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [parentField, setParentField] = useState<'parent_comment_id' | 'parent_id'>('parent_comment_id')
  const parentFieldRef = useRef<'parent_comment_id' | 'parent_id'>('parent_comment_id')

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

  const shortId = (id: string) => {
    if (!id) return ''
    if (String(id).startsWith('anon-')) return 'Аноним'
    const s = String(id)
    if (s.length <= 8) return s
    return `${s.slice(0,3)}…${s.slice(-3)}`
  }

  const fetchComments = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('comments')
        .select('*')
        .eq('poll_id', pollId)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('Ошибка при загрузке комментариев:', error)
        return
      }

      const rows: CommentRaw[] = (data || []) as CommentRaw[]

      if (rows.length > 0) {
        const sample = rows[0]
        if (sample.hasOwnProperty('parent_comment_id')) {
          parentFieldRef.current = 'parent_comment_id'
          setParentField('parent_comment_id')
        } else if (sample.hasOwnProperty('parent_id')) {
          parentFieldRef.current = 'parent_id'
          setParentField('parent_id')
        } else {
          parentFieldRef.current = 'parent_comment_id'
          setParentField('parent_comment_id')
        }
      }

      const normalized = rows.map(r => {
        const parentVal = r.parent_comment_id ?? r.parent_id ?? null
        return {
          id: String(r.id),
          text: r.text ?? '',
          created_at: r.created_at ?? new Date().toISOString(),
          parent_comment_id: parentVal ?? null,
          likes: Number(r.likes ?? 0),
          author_id: r.author_id != null ? String(r.author_id) : null,
          poll_id: String(r.poll_id ?? pollId),
          author_name: null
        } as Comment
      })

      // Resolve registration usernames from users.nonvme
      const tgIds = Array.from(new Set(
        normalized
          .map(c => c.author_id)
          .filter(id => id && !String(id).startsWith('anon-'))
      )) as string[]

      let nameMap: Record<string, string> = {}
      if (tgIds.length > 0) {
        try {
          const { data: usersRows, error: usersErr } = await supabase
            .from(USERS_TABLE)
            .select('telegram_id, nonvme')
            .in('telegram_id', tgIds as any)

          if (usersErr) {
            console.warn('Ошибка при загрузке пользователей:', usersErr)
          } else {
            (usersRows ?? []).forEach((u: any) => {
              if (u?.telegram_id != null) nameMap[String(u.telegram_id)] = u.nonvme ?? ''
            })
          }
        } catch (e) {
          console.warn('fetch users fatal', e)
        }
      }

      const withNames = normalized.map(c => {
        const id = c.author_id
        if (!id) {
          c.author_name = 'Аноним'
        } else if (String(id).startsWith('anon-')) {
          c.author_name = 'Аноним'
        } else if (nameMap[String(id)]) {
          // show registration username (nonvme)
          c.author_name = nameMap[String(id)]
        } else {
          // fallback: pretty short id
          c.author_name = `User ${shortId(String(id))}`
        }
        return c
      })

      setComments(withNames)
    } catch (e) {
      console.error('fetchComments fatal', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!pollId) return
    fetchComments()

    const channel = supabase
      .channel(`comments-poll-${pollId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'comments', filter: `poll_id=eq.${pollId}` },
        () => { fetchComments() }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'comment_likes' },
        () => fetchComments()
      )
      .subscribe()

    return () => {
      try { supabase.removeChannel(channel) } catch (e) { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollId])

  const insertComment = async (payload: Record<string, any>) => {
    try {
      const { data, error } = await supabase.from('comments').insert([payload]).select()
      if (error) {
        const msg = String(error.message || '')
        if (msg.includes('Could not find the') || (msg.includes('column') && msg.includes('does not exist'))) {
          const alt = parentFieldRef.current === 'parent_comment_id' ? 'parent_id' : 'parent_comment_id'
          parentFieldRef.current = alt
          setParentField(alt)
          const newPayload = { ...payload }
          if (payload.hasOwnProperty('parent_comment_id')) {
            delete newPayload['parent_comment_id']
            newPayload['parent_id'] = payload['parent_comment_id']
          } else if (payload.hasOwnProperty('parent_id')) {
            delete newPayload['parent_id']
            newPayload['parent_comment_id'] = payload['parent_id']
          }
          const retry = await supabase.from('comments').insert([newPayload]).select()
          if (retry.error) throw retry.error
          return retry.data
        }
        throw error
      }
      return data
    } catch (e) {
      throw e
    }
  }

  // Upsert only if user row missing or nonvme is empty — do NOT overwrite registration username
  const ensureUserRecordNotOverwriting = async (telegramId: string, displayName: string | null) => {
    if (!telegramId) return
    try {
      // check existing user
      const { data: existing, error: selErr } = await supabase
        .from(USERS_TABLE)
        .select('id, telegram_id, nonvme')
        .eq('telegram_id', telegramId)
        .limit(1)
        .single()

      if (selErr && selErr.code !== 'PGRST116') {
        // PGRST116 is "Result contains no rows" in some clients; just continue
        // If other error — log and continue
        console.warn('users select err', selErr)
      }

      if (existing) {
        // if nonvme exists — do not overwrite
        if (existing.nonvme && String(existing.nonvme).trim() !== '') {
          return
        }
        // else update nonvme only (don't change other fields)
        if (displayName) {
          const { error: updErr } = await supabase
            .from(USERS_TABLE)
            .update({ nonvme: displayName })
            .eq('telegram_id', telegramId)
          if (updErr) console.warn('users update err', updErr)
        }
        return
      }

      // no existing user — insert new row (nonvme if provided)
      const payload: any = { telegram_id: telegramId }
      if (displayName) payload.nonvme = displayName
      const { error: insErr } = await supabase.from(USERS_TABLE).insert([payload])
      if (insErr) console.warn('users insert err', insErr)
    } catch (e) {
      console.warn('ensureUserRecordNotOverwriting fatal', e)
    }
  }

  const handleAddComment = async () => {
    if (!newComment.trim()) return
    setSubmitting(true)
    try {
      const tgUser = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user
      let author_id = tgUser?.id ? String(tgUser.id) : null

      // displayName from WebApp (but we'll not overwrite nonvme if exists)
      let displayName: string | null = null
      if (tgUser) {
        displayName = tgUser.username ? `@${tgUser.username}` : ((tgUser.first_name || '') + (tgUser.last_name ? ' ' + tgUser.last_name : '')).trim() || null
      }

      if (!author_id) {
        author_id = getAnonId()
      } else {
        // ensure user row exists but DO NOT overwrite registration username (nonvme)
        await ensureUserRecordNotOverwriting(author_id, displayName)
      }

      const parentKey = parentFieldRef.current ?? 'parent_comment_id'
      const payload: Record<string, any> = {
        poll_id: pollId,
        author_id,
        text: newComment.trim(),
        likes: 0
      }
      payload[parentKey] = null

      console.log('DEBUG -> inserting comment payload', payload)

      await insertComment(payload)
      setNewComment('')
      await fetchComments()
    } catch (err: any) {
      console.error('Ошибка при добавлении комментария:', err)
      const message = err?.message ?? String(err)
      alert(`Не удалось отправить комментарий: ${message}`)
    } finally {
      setSubmitting(false)
    }
  }

  const handleLike = async (commentId: string) => {
    try {
      const tgUser = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user
      let author_id = tgUser?.id ? String(tgUser.id) : null
      if (!author_id) author_id = getAnonId()
      if (!author_id) return

      const { data: existing, error: existErr } = await supabase
        .from('comment_likes')
        .select('id')
        .eq('comment_id', commentId)
        .eq('author_id', author_id)
        .limit(1)

      if (existErr) {
        console.error('Ошибка проверки лайка:', existErr)
        return
      }

      if (existing && existing.length > 0) return

      const { error: insertError } = await supabase
        .from('comment_likes')
        .insert([{ comment_id: commentId, author_id }])

      if (insertError) {
        console.error('Ошибка при лайке:', insertError)
        return
      }

      const comment = comments.find(c => c.id === commentId)
      const updatedLikes = (comment?.likes || 0) + 1

      const { error: updateError } = await supabase
        .from('comments')
        .update({ likes: updatedLikes })
        .eq('id', commentId)

      if (updateError) {
        console.error('Ошибка при обновлении лайков:', updateError)
      }

      fetchComments()
    } catch (e) {
      console.error('handleLike fatal', e)
    }
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Напишите комментарий..."
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
          onClick={handleAddComment}
          disabled={submitting || !newComment.trim()}
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
          {submitting ? 'Отправка...' : 'Отправить'}
        </button>
      </div>

      <div>
        {loading ? (
          <div style={{ color: '#aaa' }}>Загрузка комментариев...</div>
        ) : comments.length === 0 ? (
          <div style={{ color: '#888' }}>Пока нет комментариев — будь первым!</div>
        ) : (
          comments
            .filter(c => !c.parent_comment_id)
            .map(comment => (
              <div
                key={comment.id}
                style={{
                  padding: 10,
                  background: 'rgba(255,255,255,0.02)',
                  borderRadius: 10,
                  marginBottom: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ color: '#fff', fontWeight: 600 }}>
                    {comment.author_name ?? (String(comment.author_id).startsWith('anon-') ? 'Аноним' : `User ${shortId(String(comment.author_id))}`)}
                  </div>
                  <div style={{ color: '#aaa', fontSize: 12 }}>{new Date(comment.created_at).toLocaleString()}</div>
                </div>

                <div style={{ color: '#eee' }}>{comment.text}</div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  
                </div>
              </div>
            ))
        )}
      </div>
    </div>
  )
}
