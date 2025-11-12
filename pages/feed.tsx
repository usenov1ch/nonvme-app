// pages/feed.tsx
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import BottomNav from '../components/BottomNav'
import Billboard from '../components/Billboard'
import CommentSection from '../components/CommentSection'

declare global { interface Window { Telegram?: any } }

type Poll = {
  id: string
  title?: string
  question: string
  media_url: string | null
  created_at: string
  topic_id?: string | null
}

type Option = {
  id: string
  text: string
  poll_id: string
}

type Topic = { id: string; title: string; code: string }

export default function FeedPage() {
  const [polls, setPolls] = useState<Poll[]>([])
  const [optionsMap, setOptionsMap] = useState<Record<string, Option[]>>({})
  const [loading, setLoading] = useState(true)

  const [topics, setTopics] = useState<Topic[]>([])
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null)

  // режим: "вся лента" (false) vs "моя лента" (true)
  const [myFeed, setMyFeed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    const v = localStorage.getItem('myFeed') // запоминаем выбор
    return v === '1'
  })

  const [tgId, setTgId] = useState<string>('')

  const postRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // Telegram ID
  useEffect(() => {
    const u = (typeof window !== 'undefined')
      ? window.Telegram?.WebApp?.initDataUnsafe?.user
      : null
    if (u?.id) setTgId(String(u.id))
  }, [])

  // Загружаем список тем (для билбордов и фильтра)
  useEffect(() => {
    let cancel = false
    ;(async () => {
      const { data } = await supabase
        .from('topics')
        .select('id,title,code')
        .order('position', { ascending: true })
      if (!cancel) setTopics(data ?? [])
      // если темы есть и ни одна не выбрана — выберем первую
      if (!cancel && !myFeed && !selectedTopicId && (data?.length ?? 0) > 0) {
        setSelectedTopicId(data![0].id)
      }
    })()
    return () => { cancel = true }
  }, [myFeed])

  // основная загрузка постов — зависит от режима и выбранной темы
  useEffect(() => {
    let cancel = false
    ;(async () => {
      setLoading(true)

      try {
        let pollsData: Poll[] = []

        if (myFeed) {
          // Моя лента: получить темы пользователя
          if (!tgId) { setLoading(false); return }
          const { data: myTopics } = await supabase
            .from('user_feed_topics')
            .select('topic_id')
            .eq('telegram_id', tgId)

          const ids = (myTopics ?? []).map(r => r.topic_id).filter(Boolean)
          if (ids.length === 0) {
            setPolls([])
            setOptionsMap({})
            setLoading(false)
            return
          }

          const { data, error } = await supabase
            .from('polls')
            .select('*')
            .in('topic_id', ids)
            .order('created_at', { ascending: false })

          if (error) throw error
          pollsData = data as any
        } else {
          // Общая лента: при выбранной теме фильтруем по ней; иначе — все посты
          let query = supabase.from('polls').select('*').order('created_at', { ascending: false })
          if (selectedTopicId) query = query.eq('topic_id', selectedTopicId)
          const { data, error } = await query
          if (error) throw error
          pollsData = data as any
        }

        if (cancel) return
        setPolls(pollsData || [])

        // загрузим варианты для всех постов одной пачкой
        const ids = pollsData.map(p => p.id)
        if (ids.length) {
          const { data: optionsData } = await supabase
            .from('poll_options')
            .select('*')
            .in('poll_id', ids)

          const grouped: Record<string, Option[]> = {}
          optionsData?.forEach(opt => {
            if (!grouped[opt.poll_id]) grouped[opt.poll_id] = []
            grouped[opt.poll_id].push(opt)
          })
          if (!cancel) setOptionsMap(grouped)
        } else {
          if (!cancel) setOptionsMap({})
        }
      } catch (e) {
        console.error('Ошибка загрузки ленты:', e)
      } finally {
        if (!cancel) setLoading(false)
      }
    })()
    return () => { cancel = true }
  }, [myFeed, selectedTopicId, tgId])

  // сохраняем выбор режима
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('myFeed', myFeed ? '1' : '0')
    }
  }, [myFeed])

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#000',
      color: '#fff',
      padding: '20px 20px 80px',
      fontFamily: 'sans-serif'
    }}>
      {/* Переключатель режимов */}
      <div style={{ display:'flex', gap:8, marginBottom:16 }}>
        <button
          onClick={() => setMyFeed(false)}
          style={{
            padding:'8px 14px',
            borderRadius:999,
            border: myFeed ? '1px solid #444' : '1px solid #7c5cff',
            background: myFeed ? 'transparent' : 'rgba(124,92,255,.18)',
            color:'#fff',
            fontWeight:700,
            cursor:'pointer'
          }}
        >
          Лента
        </button>
        <button
          onClick={() => setMyFeed(true)}
          style={{
            padding:'8px 14px',
            borderRadius:999,
            border: myFeed ? '1px solid #7c5cff' : '1px solid #444',
            background: myFeed ? 'rgba(124,92,255,.18)' : 'transparent',
            color:'#fff',
            fontWeight:700,
            cursor:'pointer'
          }}
        >
          Моя лента
        </button>
      </div>

      {/* БИЛБОРДЫ — показываем только в общей ленте */}
      {!myFeed && topics.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <Billboard
            // отдаём темы в билборд
            items={topics.map(t => ({ id: t.id, title: t.title, question: '' }))}
            onJumpToPost={(id) => {
              // тут мы используем билборд как переключатель темы
              setSelectedTopicId(id)
              // скроллить никуда не нужно — просто перезагрузится список
            }}
          />
          {/* можно подсветить выбранную тему небольшим текстом */}
          {selectedTopicId && (
            <div style={{ fontSize:12, opacity:.8, marginTop:6 }}>
              Тема: {topics.find(t => t.id === selectedTopicId)?.title}
            </div>
          )}
        </div>
      )}

      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 20 }}>
        {myFeed ? 'Моя лента' : 'Лента'}
      </h1>

      {/* Подсказка, если "моя лента" включена, а темы не выбраны */}
      {myFeed && !loading && polls.length === 0 && (
        <div style={{ background:'#111', border:'1px solid #333', borderRadius:12, padding:12, marginBottom:16 }}>
          <div style={{ opacity:.85, marginBottom:6 }}>
            Похоже, у вас ещё не выбраны темы.
          </div>
          <div style={{ fontSize:12, opacity:.7 }}>
            Зайдите в профиль и настройте «Моя лента: темы».
          </div>
        </div>
      )}

      {loading ? (
        <p>Загрузка...</p>
      ) : (
        polls.map(poll => (
          <div
            key={poll.id}
            ref={(el: HTMLDivElement | null) => { postRefs.current[poll.id] = el }}
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
