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
        const fileExt = file.name.split('.').pop()
        const filePath = `polls/${Date.now()}.${fileExt}`
        const { error: uploadError } = await supabase.storage.from('media').upload(filePath, file)
        if (uploadError) throw uploadError
        const { data } = supabase.storage.from('media').getPublicUrl(filePath)
        media_url = data.publicUrl
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

      alert('Публикация/опрос создан!')
      setTitle(''); setQuestion(''); setOptions(['', '']); setFile(null); setSelectedTopicId('')
      router.push('/feed')
    } catch (e: any) {
      console.error('[Ошибка создания опроса]', e)
      setError(`Ошибка: ${e?.message || 'неизвестная'}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Создать публикацию</h2>

      {/* Тема (обязательная) */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: '#aaa', marginBottom: 6 }}>Тема публикации *</div>
        <select
          value={selectedTopicId}
          onChange={(e) => setSelectedTopicId(e.target.value)}
          style={{
            width:'95%', padding:10, background:'#111', color:'#fff',
            borderRadius:10, border: `1px solid ${!selectedTopicId && error ? '#f44336' : '#333'}`
          }}
        >
          <option value="">— выберите тему —</option>
          {topics.map(t => (
            <option key={t.id} value={t.id}>{t.title}</option>
          ))}
        </select>
      </div>

      <input
        type="text" placeholder="Заголовок..." value={title} onChange={(e) => setTitle(e.target.value)}
        style={{ width:'95%', padding:10, background:'#111', color:'#fff', borderRadius:10, border:'1px solid #333', marginBottom:12 }}
      />

      <textarea
        placeholder="Введите вопрос/текст..." value={question} onChange={(e) => setQuestion(e.target.value)} rows={3}
        style={{ width:'95%', padding:10, background:'#111', color:'#fff', borderRadius:10, border:'1px solid #333', marginBottom:12, resize:'vertical' }}
      />

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: '#aaa', marginBottom: 6 }}>Варианты (мин. 2, макс. 10)</div>
        {options.map((opt, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              type="text" placeholder={`Вариант ${i + 1}`} value={opt} onChange={(e) => handleOptionChange(e.target.value, i)}
              style={{ flex:1, padding:10, background:'#111', color:'#fff', borderRadius:10, border:'1px solid #333' }}
            />
            {options.length > 2 && (
              <button onClick={() => removeOption(i)}
                style={{ width:36, height:36, borderRadius:8, background:'#2b2b2b', color:'#fff', border:'1px solid #444', cursor:'pointer' }}
                aria-label="Удалить вариант"
              >✕</button>
            )}
          </div>
        ))}
        {options.length < 10 && (
          <button onClick={addOption}
            style={{ padding:'8px 12px', borderRadius:10, background:'transparent', color:'#fff', border:'1px dashed #555', cursor:'pointer' }}
          >+ Добавить вариант</button>
        )}
      </div>

      <div style={{ marginBottom: 12 }}>
        <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      </div>

      {error && <p style={{ color: 'red', marginBottom: 8 }}>{error}</p>}

      <button onClick={handleSubmit} disabled={loading}
        style={{ padding:'10px 20px', borderRadius:999, border:'1px solid #fff', background:'transparent', color:'#fff', fontSize:16, cursor: loading?'not-allowed':'pointer' }}>
        {loading ? 'Сохранение...' : 'Создать'}
      </button>
    </div>
  )
}
