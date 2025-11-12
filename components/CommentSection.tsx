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
}

export default function CommentSection({ pollId }: { pollId: string }) {
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  // поле в таблице, которое реально используется для parent (может быть parent_comment_id или parent_id)
  const [parentField, setParentField] = useState<'parent_comment_id' | 'parent_id'>('parent_comment_id')
  const parentFieldRef = useRef<'parent_comment_id' | 'parent_id'>('parent_comment_id')

  // helper: get or create anon id
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

  // fetch comments and normalize rows to our Comment type
  const fetchComments = async () => {
    setLoading(true)
    try {
      // get all columns (select *) — we'll normalize parent field below
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

      // determine which parent field exists in the returned rows
      if (rows.length > 0) {
        const sample = rows[0]
        if (sample.hasOwnProperty('parent_comment_id')) {
          parentFieldRef.current = 'parent_comment_id'
          setParentField('parent_comment_id')
        } else if (sample.hasOwnProperty('parent_id')) {
          parentFieldRef.current = 'parent_id'
          setParentField('parent_id')
        } else {
          // default to parent_comment_id if none present
          parentFieldRef.current = 'parent_comment_id'
          setParentField('parent_comment_id')
        }
      }

      // normalize each row -> Comment
      const normalized = rows.map(r => {
        const parentVal = r.parent_comment_id ?? r.parent_id ?? null
        return {
          id: String(r.id),
          text: r.text ?? '',
          created_at: r.created_at ?? new Date().toISOString(),
          parent_comment_id: parentVal ?? null,
          likes: Number(r.likes ?? 0),
          author_id: r.author_id != null ? String(r.author_id) : null,
          poll_id: String(r.poll_id ?? pollId)
        } as Comment
      })

      setComments(normalized)
    } catch (e) {
      console.error('fetchComments fatal', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!pollId) return
    fetchComments()

    // subscribe to changes on comments and comment_likes — simple: re-fetch on any change
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
        (payload) => {
          // if like pertains to a comment for this poll, refresh; otherwise do a safe refresh either way
          // to keep it simple we'll just refresh
          fetchComments()
        }
      )
      .subscribe()

    return () => {
      try { supabase.removeChannel(channel) } catch (e) { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollId])

  // robust insert: try with current parentField; on column-not-found error, switch and retry
  const insertComment = async (payload: Record<string, any>) => {
    try {
      const { data, error } = await supabase.from('comments').insert([payload]).select()
      if (error) {
        // check message about missing column name -> fallback
        const msg = String(error.message || '')
        if (msg.includes('Could not find the') || msg.includes('column') && msg.includes('does not exist')) {
          // switch parent field and try again (if payload used parent field)
          const alt = parentFieldRef.current === 'parent_comment_id' ? 'parent_id' : 'parent_comment_id'
          parentFieldRef.current = alt
          setParentField(alt)
          // rebuild payload with alt field
          const newPayload = { ...payload }
          if (payload.hasOwnProperty('parent_comment_id')) {
            delete newPayload['parent_comment_id']
            newPayload['parent_id'] = payload['parent_comment_id']
          } else if (payload.hasOwnProperty('parent_id')) {
            delete newPayload['parent_id']
            newPayload['parent_comment_id'] = payload['parent_id']
          }
          const retry = await supabase.from('comments').insert([newPayload]).select()
          if (retry.error) {
            throw retry.error
          }
          return retry.data
        }
        throw error
      }
      return data
    } catch (e) {
      throw e
    }
  }

  const handleAddComment = async () => {
    if (!newComment.trim()) return
    setSubmitting(true)

    try {
      const tgUser = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user
      let author_id = tgUser?.id ? String(tgUser.id) : null
      if (!author_id) {
        author_id = getAnonId()
      }

      // build payload using the currently known parent field
      const parentKey = parentFieldRef.current ?? 'parent_comment_id'
      const payload: Record<string, any> = {
        poll_id: pollId,
        author_id,
        text: newComment.trim(),
        likes: 0
      }
      payload[parentKey] = null

      // try inserting (function handles fallback)
      await insertComment(payload)
      setNewComment('')
      // refresh comments
      await fetchComments()
    } catch (err: any) {
      console.error('Ошибка при добавлении комментария:', err)
      // if it's a schema column error mention it explicitly
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

      // Prevent duplicate likes by this author
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

      if (existing && existing.length > 0) {
        // already liked — do nothing
        return
      }

      const { error: insertError } = await supabase
        .from('comment_likes')
        .insert([{ comment_id: commentId, author_id }])

      if (insertError) {
        console.error('Ошибка при лайке:', insertError)
        return
      }

      // increment likes counter on comments table (simple approach)
      const comment = comments.find(c => c.id === commentId)
      const updatedLikes = (comment?.likes || 0) + 1

      const { error: updateError } = await supabase
        .from('comments')
        .update({ likes: updatedLikes })
        .eq('id', commentId)

      if (updateError) {
        console.error('Ошибка при обновлении лайков:', updateError)
      }

      // refresh
      fetchComments()
    } catch (e) {
      console.error('handleLike fatal', e)
    }
  }

  return (
    <div style={{ marginTop: 12 }}>
      {/* always shown — feed.tsx controls when component is rendered */}
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
                    {String(comment.author_id).startsWith('anon-') ? 'Аноним' : `User ${comment.author_id}`}
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
