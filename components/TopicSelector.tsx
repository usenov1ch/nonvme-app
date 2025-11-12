// components/TopicSelector.tsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Topic = { id: string; title: string; code: string }
type Props = { title?: string }

export default function TopicSelector({ title = 'Моя лента: темы' }: Props) {
  const [tgId, setTgId] = useState<string>('')
  const [topics, setTopics] = useState<Topic[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loadingTopics, setLoadingTopics] = useState(true)
  const [loadingMine, setLoadingMine] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Получаем Telegram ID только в браузере
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const u = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user
      if (u?.id) setTgId(String(u.id))
    }
  }, [])

  // 1) Загружаем ВСЕ темы (НЕ зависим от tgId)
  useEffect(() => {
    let cancel = false
    ;(async () => {
      setLoadingTopics(true)
      try {
        const { data, error } = await supabase
          .from('topics')
          .select('id,title,code')
          .order('position', { ascending: true })
        if (error) throw error
        if (!cancel) setTopics(data ?? [])
      } catch (e) {
        if (!cancel) setTopics([])
      } finally {
        if (!cancel) setLoadingTopics(false)
      }
    })()
    return () => { cancel = true }
  }, [])

  // 2) Загружаем выбранные темы пользователя (когда знаем tgId)
  useEffect(() => {
    if (!tgId) return
    let cancel = false
    ;(async () => {
      setLoadingMine(true)
      setError('')
      try {
        const { data, error } = await supabase
          .from('user_feed_topics')
          .select('topic_id')
          .eq('telegram_id', tgId)
        if (error) throw error
        if (!cancel) setSelected(new Set((data ?? []).map(r => r.topic_id)))
      } catch (e: any) {
        if (!cancel) setError('Не удалось загрузить выбранные темы')
      } finally {
        if (!cancel) setLoadingMine(false)
      }
    })()
    return () => { cancel = true }
  }, [tgId])

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const save = async () => {
    if (!tgId) { setError('Откройте мини-апп из Telegram'); return }
    setSaving(true); setError('')
    try {
      const { data: existing } = await supabase
        .from('user_feed_topics')
        .select('topic_id')
        .eq('telegram_id', tgId)

      const current = new Set((existing ?? []).map(r => r.topic_id))
      const want = selected

      const toDelete = Array.from(current).filter(id => !want.has(id))
      const toInsert = Array.from(want).filter(id => !current.has(id))

      if (toDelete.length) {
        await supabase
          .from('user_feed_topics')
          .delete()
          .eq('telegram_id', tgId)
          .in('topic_id', toDelete)
      }

      if (toInsert.length) {
        const rows = toInsert.map(topic_id => ({ telegram_id: tgId, topic_id }))
        await supabase.from('user_feed_topics').insert(rows)
      }
    } catch (e: any) {
      setError(e?.message || 'Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  const busy = loadingTopics || loadingMine

  return (
    <div style={{ background:'#111', border:'1px solid #333', borderRadius:16, padding:14, marginTop:16 }}>
      <div style={{ fontWeight:800, fontSize:16, marginBottom:10 }}>{title}</div>

      {busy ? (
        <div style={{ opacity:.7 }}>Загрузка…</div>
      ) : topics.length === 0 ? (
        <div style={{ opacity:.7 }}>
          Тем пока нет
        </div>
      ) : (
        <>
          <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
            {topics.map(t => {
              const active = selected.has(t.id)
              return (
                <button
                  key={t.id}
                  onClick={() => toggle(t.id)}
                  style={{
                    padding:'8px 12px',
                    borderRadius:999,
                    border: active ? '1px solid #7c5cff' : '1px solid #444',
                    background: active ? 'rgba(124,92,255,.18)' : 'transparent',
                    color:'#fff',
                    fontSize:13,
                    cursor:'pointer'
                  }}
                >
                  {t.title}
                </button>
              )
            })}
          </div>

          <div style={{ display:'flex', gap:8, marginTop:12 }}>
            <button
              onClick={save}
              disabled={saving}
              style={{
                padding:'10px 14px', borderRadius:10, border:'none',
                background:saving ? '#473a7d' : '#2e2159', color:'#fff',
                fontWeight:700, cursor:saving?'default':'pointer'
              }}
            >
              {saving ? 'Сохранение…' : 'Сохранить'}
            </button>
            {error && <div style={{ color:'#f66', fontSize:12, alignSelf:'center' }}>{error}</div>}
          </div>

          {selected.size > 0 && (
            <div style={{ fontSize:12, opacity:.8, marginTop:10 }}>
              Вы выбрали: {Array.from(selected)
                .map(id => topics.find(t => t.id === id)?.title)
                .filter(Boolean)
                .join(', ')}
            </div>
          )}
        </>
      )}
    </div>
  )
}
