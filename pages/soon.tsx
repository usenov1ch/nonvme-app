import { useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import BottomNav from '../components/BottomNav'

export default function CreatePollPage() {
  const [title, setTitle] = useState('')
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', ''])
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const handleOptionChange = (value: string, index: number) => {
    const newOptions = [...options]
    newOptions[index] = value
    setOptions(newOptions)
  }

  const addOption = () => {
    if (options.length < 10) setOptions([...options, ''])
  }

  const removeOption = (index: number) => {
    if (options.length > 2) {
      const newOptions = options.filter((_, i) => i !== index)
      setOptions(newOptions)
    }
  }

  const handleSubmit = async () => {
    setError('')
    const trimmedOptions = options.map(o => o.trim()).filter(Boolean)
    const trimmedQuestion = question.trim()
    const trimmedTitle = title.trim()

    if (!trimmedTitle || !trimmedQuestion || trimmedOptions.length < 2) {
      setError('Введите заголовок, вопрос и минимум 2 варианта')
      return
    }

    setLoading(true)

    try {
      const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user
      const author_id = tgUser?.id

      if (!author_id) throw new Error('Telegram ID не найден')

      let media_url = null

      if (file) {
        const fileExt = file.name.split('.').pop()
        const filePath = `polls/${Date.now()}.${fileExt}`

        const { error: uploadError } = await supabase.storage
          .from('media')
          .upload(filePath, file)

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

      const pollOptions = trimmedOptions.map(text => ({
        poll_id: poll.id,
        text
      }))

      const { error: optionError } = await supabase
        .from('poll_options')
        .insert(pollOptions)

      if (optionError) throw optionError

      alert('Опрос создан!')
      router.push('/feed')
    } catch (err: any) {
      console.error('[Ошибка создания опроса]', err)
      setError(`Ошибка: ${err.message || 'неизвестная'}`)
    }

    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#000',
      color: '#fff',
      fontFamily: 'sans-serif',
      padding: 20
    }}>
      <h1 style={{ fontSize: 24, marginBottom: 20 }}>Создать опрос</h1>

      <input
        type="text"
        placeholder="Заголовок опроса..."
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        style={{ width: '100%', marginBottom: 10, padding: 10 }}
      />

      <input
        type="text"
        placeholder="Введите вопрос..."
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        style={{ width: '100%', marginBottom: 10, padding: 10 }}
      />

      {options.map((opt, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <input
            type="text"
            value={opt}
            onChange={(e) => handleOptionChange(e.target.value, i)}
            placeholder={`Вариант ${i + 1}`}
            style={{ flex: 1, padding: 8 }}
          />
          {options.length > 2 && (
            <button onClick={() => removeOption(i)} style={{ marginLeft: 8 }}>✕</button>
          )}
        </div>
      ))}

      {options.length < 10 && (
        <button onClick={addOption} style={{ marginBottom: 12 }}>Добавить вариант</button>
      )}

      <input
        type="file"
        accept="image/*"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
        style={{ marginBottom: 12 }}
      />

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <button onClick={handleSubmit} disabled={loading} style={{ padding: '10px 20px' }}>
        {loading ? 'Сохранение...' : 'Создать'}
      </button>

      <BottomNav />
    </div>
  )
}
