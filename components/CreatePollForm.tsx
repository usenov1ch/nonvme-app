// components/CreatePollForm.tsx
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'

type Topic = { id: string; code: string; title: string; position?: number }

export default function CreatePollForm() {
  const [title, setTitle] = useState('')
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', ''])
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [topics, setTopics] = useState<Topic[]>([])
  const [selectedTopicId, setSelectedTopicId] = useState<string>('') // <-- выбрана ли тема

  const router = useRouter()

  // === Загрузка тем из справочника ===
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('topics')
        .select('id, code, title, position')
        .order('position', { ascending: true })
        .order('title', { ascending: true })

      if (!cancelled) {
        if (error) {
          console.error('[topics] load error:', error)
          setTopics([])
        } else {
          setTopics(data ?? [])
          if (!selectedTopicId && data && data.length) {
            setSelectedTopicId(data[0].id)
          }
        }
      }
    })()
    return () => { cancelled = true }
  }, [])

  const handleOptionChange = (value: string, index: number) => {
    const next = [...options]
    next[index] = value
    setOptions(next)
  }

  const addOption = () => options.length < 10 && setOptions([...options, ''])
  const removeOption = (index: number) => options.length > 2 && setOptions(options.filter((_, i) => i !== index))

  const handleSubmit = async () => {
    try {
      setError('')

      // Валидация формы
      const trimmedTitle = title.trim()
      const trimmedQuestion = question.trim()
      const trimmedOptions = options.map(o => o.trim()).filter(Boolean)

      if (!trimmedTitle || !trimmedQuestion || trimmedOptions.length < 2) {
        setError('Введите заголовок, вопрос и минимум 2 варианта')
        return
      }
      if (!selectedTopicId) {
        setError('Выберите тему публикации')
        return
      }

      setLoading(true)

      // Telegram user
      const tgUser = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user
      const author_id = tgUser?.id
      if (!author_id) throw new Error('Telegram ID не найден (откройте из бота)')

      // Медиа (если есть)
      let media_url: string | null = null
      if (file) {
        const fileExt = (file.name.split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase()
        const filePath = `polls/${Date.now()}.${fileExt}`
        const { error: uploadError } = await supabase.storage.from('media').upload(filePath, file)
        if (uploadError) throw uploadError
        const { data } = supabase.storage.from('media').getPublicUrl(filePath) as any
        media_url = data?.publicUrl ?? data?.publicURL ?? null
      }

      // Вставка поста с topic_id
      const { data: poll, error: pollError } = await supabase
        .from('polls')
        .insert([{
          author_id,
          title: trimmedTitle,
          question: trimmedQuestion,
          media_url,
          topic_id: selectedTopicId,     // <<=== обязательное поле темы
        }])
        .select()
        .single()
      if (pollError) throw pollError

      // Варианты ответа
      const pollOptions = trimmedOptions.map(text => ({ poll_id: poll.id, text }))
      const { error: optionError } = await supabase.from('poll_options').insert(pollOptions)
      if (optionError) throw optionError

      // Успех
      setTitle(''); setQuestion(''); setOptions(['', '']); setFile(null); setSelectedTopicId('')
      router.push('/feed')
    } catch (e: any) {
      console.error('[Ошибка создания опроса]', e)
      setError(`Ошибка: ${e?.message || 'неизвестная'}`)
    } finally {
      setLoading(false)
    }
  }

  // UI styles mirror AdminNewsForm — neutral dark with subtle focus
  const inputBase: React.CSSProperties = {
    width: '100%',
    padding: 12,
    background: '#0f0f10',
    color: '#fff',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.04)',
    marginBottom: 12,
    fontSize: 14,
    outline: 'none',
    boxShadow: '0 1px 0 rgba(0,0,0,0.6) inset'
  }

  const smallLabel: React.CSSProperties = { fontSize: 12, color: '#aaa', marginBottom: 6 }

  return (
    <div style={{ background: '#0b0b0c', borderRadius: 14, padding: 14, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02)' }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 12px 0' }}>Создать публикацию</h2>

      {/* Тема (обязательная) */}
      <div style={{ marginBottom: 12 }}>
        <div style={smallLabel}>Тема публикации *</div>
        <select
          value={selectedTopicId}
          onChange={(e) => setSelectedTopicId(e.target.value)}
          style={{
            ...inputBase,
            padding: 10,
            height: 44,
            width: '100%',
            border: `1px solid ${!selectedTopicId && error ? '#f44336' : 'rgba(255,255,255,0.04)'}`
          }}
          onFocus={(e) => (e.currentTarget.style.boxShadow = '0 0 0 4px rgba(124,92,255,0.06)')}
          onBlur={(e) => (e.currentTarget.style.boxShadow = '0 1px 0 rgba(0,0,0,0.6) inset')}
        >
          <option value="">— выберите тему —</option>
          {topics.map(t => (
            <option key={t.id} value={t.id}>{t.title}</option>
          ))}
        </select>
      </div>

      <input
        type="text" placeholder="Заголовок..." value={title} onChange={(e) => setTitle(e.target.value)}
        style={{ ...inputBase }}
        onFocus={(e)=> (e.currentTarget.style.boxShadow = '0 0 0 4px rgba(124,92,255,0.06)')}
        onBlur={(e)=> (e.currentTarget.style.boxShadow = '0 1px 0 rgba(0,0,0,0.6) inset')}
      />

      <textarea
        placeholder="Введите вопрос/текст..." value={question} onChange={(e) => setQuestion(e.target.value)} rows={3}
        style={{ ...inputBase, resize: 'vertical', minHeight: 80 }}
        onFocus={(e)=> (e.currentTarget.style.boxShadow = '0 0 0 4px rgba(124,92,255,0.06)')}
        onBlur={(e)=> (e.currentTarget.style.boxShadow = '0 1px 0 rgba(0,0,0,0.6) inset')}
      />

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: '#aaa', marginBottom: 6 }}>Варианты (мин. 2, макс. 10)</div>
        {options.map((opt, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              type="text" placeholder={`Вариант ${i + 1}`} value={opt} onChange={(e) => handleOptionChange(e.target.value, i)}
              style={{ flex:1, padding:10, background:'#0f0f10', color:'#fff', borderRadius:10, border:'1px solid rgba(255,255,255,0.04)' }}
            />
            {options.length > 2 && (
              <button onClick={() => removeOption(i)}
                style={{ width:36, height:36, borderRadius:8, background:'#2b2b2b', color:'#fff', border:'1px solid rgba(255,255,255,0.04)', cursor:'pointer' }}
                aria-label="Удалить вариант"
                type="button"
              >✕</button>
            )}
          </div>
        ))}
        {options.length < 10 && (
          <button onClick={addOption}
            style={{ padding:'8px 12px', borderRadius:10, background:'transparent', color:'#fff', border:'1px dashed rgba(255,255,255,0.06)', cursor:'pointer' }}
            type="button"
          >+ Добавить вариант</button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <label style={{
          display:'inline-flex',
          alignItems:'center',
          gap:10,
          padding:'8px 12px',
          borderRadius:8,
          background:'#0e0e10',
          border:'1px solid rgba(255,255,255,0.04)',
          color:'#fff',
          cursor:'pointer',
          fontSize:13,
          userSelect:'none'
        }}>
          <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ display:'none' }} />
          Выбор файла
        </label>
        <div style={{ color:'#bdbdbd', fontSize:13 }}>
          {file ? file.name : 'Не выбран ни один файл'}
        </div>
      </div>

      {error && <div style={{ color:'#ff7b7b', marginBottom: 10 }}>{error}</div>}

      <div style={{ display:'flex', gap: 12, alignItems: 'center' }}>
        <button onClick={handleSubmit} disabled={loading}
          style={{
            padding:'10px 20px',
            borderRadius:10,
            border:'none',
            background: loading ? '#4b3b7d' : 'linear-gradient(180deg,#6c56ff,#5846d8)',
            color:'#fff',
            fontSize:16,
            cursor: loading ? 'not-allowed' : 'pointer',
            fontWeight: 800,
            boxShadow: '0 6px 18px rgba(88,70,216,0.18)'
          }}>
          {loading ? 'Сохранение...' : 'Создать'}
        </button>

        <button type="button"
          onClick={() => { setTitle(''); setQuestion(''); setOptions(['','']); setFile(null); setSelectedTopicId(topics[0]?.id ?? '') }}
          style={{
            padding:'10px 14px',
            borderRadius:10,
            background:'#111',
            color:'#fff',
            border:'1px solid rgba(255,255,255,0.04)',
            cursor:'pointer'
          }}>
          Сбросить
        </button>
      </div>
    </div>
  )
}
