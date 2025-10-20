import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import BottomNav from '../components/BottomNav'
import Billboard from '../components/Billboard'
import CommentSection from '../components/CommentSection' // импорт компонента комментариев

type Poll = {
  id: string
  title?: string // Новый заголовок
  question: string
  media_url: string | null
  created_at: string
}

type Option = {
  id: string
  text: string
  poll_id: string
}

export default function FeedPage() {
  const [polls, setPolls] = useState<Poll[]>([])
  const [optionsMap, setOptionsMap] = useState<Record<string, Option[]>>({})
  const [loading, setLoading] = useState(true)

  const postRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    const fetchPolls = async () => {
      const { data: pollsData, error } = await supabase
        .from('polls')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Ошибка загрузки опросов:', error)
        setLoading(false)
        return
      }

      setPolls(pollsData || [])

      const ids = pollsData?.map(p => p.id) || []
      const { data: optionsData } = await supabase
        .from('poll_options')
        .select('*')
        .in('poll_id', ids)

      const grouped: Record<string, Option[]> = {}
      optionsData?.forEach(opt => {
        if (!grouped[opt.poll_id]) grouped[opt.poll_id] = []
        grouped[opt.poll_id].push(opt)
      })

      setOptionsMap(grouped)
      setLoading(false)
    }

    fetchPolls()
  }, [])

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#000',
      color: '#fff',
      padding: '20px 20px 80px',
      fontFamily: 'sans-serif'
    }}>
      {/* БИЛБОРДЫ */}
      {polls.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <Billboard
            items={polls}
            onJumpToPost={(id) => {
              const el = postRefs.current[id]
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
          />
        </div>
      )}

      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 20 }}>Лента</h1>

      {loading ? (
        <p>Загрузка...</p>
      ) : (
        polls.map(poll => (
          <div
            key={poll.id}
            ref={(el: HTMLDivElement | null) => {
              postRefs.current[poll.id] = el
            }}
            style={{
              background: '#111',
              borderRadius: 16,
              padding: 16,
              marginBottom: 20,
              border: '1px solid #333',
              scrollMarginTop: 100
            }}
          >
            {/* Заголовок */}
            {poll.title && (
              <p style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>
                {poll.title}
              </p>
            )}

            {/* Вопрос */}
            <p style={{ fontSize: 16, fontWeight: 600 }}>{poll.question}</p>

            {/* Изображение */}
            {poll.media_url && (
              <img
                src={poll.media_url}
                alt="Изображение"
                style={{ width: '100%', borderRadius: 12, marginTop: 10 }}
              />
            )}

            {/* Варианты */}
            <div style={{ marginTop: 12 }}>
              {optionsMap[poll.id]?.map(opt => (
                <div
                  key={opt.id}
                  style={{
                    padding: 8,
                    backgroundColor: '#222',
                    borderRadius: 8,
                    marginBottom: 6
                  }}
                >
                  {opt.text}
                </div>
              ))}
            </div>

            {/* Комментарии */}
            <div style={{ marginTop: 16 }}>
              <CommentSection pollId={poll.id} />
            </div>
          </div>
        ))
      )}

      <div style={{ marginTop: 'auto' }}>
        <BottomNav />
      </div>
    </div>
  )
}
