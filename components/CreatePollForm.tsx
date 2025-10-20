import { useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'

export default function CreatePollForm() {
  const [title, setTitle] = useState('')
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', ''])
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

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
      const trimmedTitle = title.trim()
      const trimmedQuestion = question.trim()
      const trimmedOptions = options.map(o => o.trim()).filter(Boolean)
      if (!trimmedTitle || !trimmedQuestion || trimmedOptions.length < 2) {
        setError('Введите заголовок, вопрос и минимум 2 варианта')
        return
      }

      setLoading(true)
      const tgUser = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user
      const author_id = tgUser?.id
      if (!author_id) throw new Error('Telegram ID не найден')

      let media_url: string | null = null
      if (file) {
        const fileExt = file.name.split('.').pop()
        const filePath = `polls/${Date.now()}.${fileExt}`
        const { error: uploadError } = await supabase.storage.from('media').upload(filePath, file)
        if (uploadError) throw uploadError
        const { data } = supabase.storage.from('media').getPublicUrl(filePath)
        media_url = data.publicUrl
      }

      const { data: poll, error: pollError } = await supabase
        .from('polls')
        .insert([{ author_id, title: trimmedTitle, question: trimmedQuestion, media_url }])
        .select()
        .single()
      if (pollError) throw pollError

      const pollOptions = trimmedOptions.map(text => ({ poll_id: poll.id, text }))
      const { error: optionError } = await supabase.from('poll_options').insert(pollOptions)
      if (optionError) throw optionError

      alert('Публикация/опрос создан!')
      setTitle(''); setQuestion(''); setOptions(['','']); setFile(null)
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

      <input
        type="text" placeholder="Заголовок..." value={title} onChange={(e) => setTitle(e.target.value)}
        style={{ width:'100%', padding:10, background:'#111', color:'#fff', borderRadius:10, border:'1px solid #333', marginBottom:12 }}
      />

      <textarea
        placeholder="Введите вопрос/текст..." value={question} onChange={(e) => setQuestion(e.target.value)} rows={3}
        style={{ width:'100%', padding:10, background:'#111', color:'#fff', borderRadius:10, border:'1px solid #333', marginBottom:12, resize:'vertical' }}
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
