import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

type Comment = {
  id: string
  text: string
  created_at: string
  parent_comment_id: string | null
  likes: number
  author_id: string
  poll_id: string
}

export default function CommentSection({ pollId }: { pollId: string }) {
  const [comments, setComments] = useState<Comment[]>([])
  const [expanded, setExpanded] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fetchComments = async () => {
    const { data, error } = await supabase
      .from('comments')
      .select('*')
      .eq('poll_id', pollId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Ошибка при загрузке комментариев:', error)
    } else {
      setComments(data || [])
    }
  }

  useEffect(() => {
    if (expanded) fetchComments()
  }, [expanded])

  const handleAddComment = async () => {
    if (!newComment.trim()) return

    setSubmitting(true)

    const tgUser = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user
    const author_id = tgUser?.id?.toString()

    if (!author_id) {
      alert('Пользователь Telegram не найден')
      setSubmitting(false)
      return
    }

    const { error } = await supabase.from('comments').insert([
      {
        poll_id: pollId,
        author_id,
        text: newComment.trim(),
        parent_id: null,
        likes: 0
      }
    ])

    if (error) {
      console.error('Ошибка при добавлении комментария:', error)
      alert(`Не удалось отправить комментарий: ${error.message || 'Неизвестная ошибка'}`)
    } else {
      setNewComment('')
      fetchComments()
    }

    setSubmitting(false)
  }

  const handleLike = async (commentId: string) => {
    const tgUser = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user
    const author_id = tgUser?.id?.toString()

    if (!author_id) return

    const { data: existing } = await supabase
      .from('comment_likes')
      .select('id')
      .eq('comment_id', commentId)
      .eq('author_id', author_id)
      .single()

    if (existing) return

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
  }

  return (
    <div style={{ marginTop: 16 }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          marginBottom: 10,
          backgroundColor: '#222',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          padding: '8px 12px',
          cursor: 'pointer'
        }}
      >
        {expanded ? 'Скрыть комментарии' : 'Читать комментарии'}
      </button>

      {expanded && (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleAddComment()
            }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              marginBottom: 16,
            }}
          >
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Новый комментарий..."
              style={{
                width: '90%',
                padding: '10px',
                borderRadius: 6,
                border: '1px solid #444',
                background: '#111',
                color: '#fff',
                fontSize: 14
              }}
            />
            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: '10px',
                backgroundColor: '#333',
                color: '#fff',
                fontWeight: 'bold',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                opacity: submitting ? 0.6 : 1
              }}
            >
              {submitting ? 'Отправка...' : 'Добавить'}
            </button>
          </form>

          {comments
            .filter(c => !c.parent_comment_id)
            .map(comment => (
              <div
                key={comment.id}
                style={{
                  padding: 8,
                  background: '#1a1a1a',
                  borderRadius: 8,
                  marginBottom: 10
                }}
              >
                <p style={{ marginBottom: 6 }}>{comment.text}</p>
                <small style={{ color: '#aaa' }}>❤️ {comment.likes}</small>
                <button
                  onClick={() => handleLike(comment.id)}
                  style={{
                    marginLeft: 10,
                    fontSize: 12,
                    padding: '4px 8px',
                    backgroundColor: '#333',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer'
                  }}
                >
                  +1
                </button>
              </div>
          ))}
        </>
      )}
    </div>
  )
}
