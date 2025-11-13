// components/AdminNewsForm.tsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Props = { tgId: string }
type Topic = { id: string; title: string; code?: string }

export default function AdminNewsForm({ tgId }: Props) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const [topics, setTopics] = useState<Topic[]>([])
  const [selectedTopicId, setSelectedTopicId] = useState<string>('')
  const [options, setOptions] = useState<string[]>(['', ''])

  // load topics
  useEffect(() => {
    let cancel = false
    ;(async () => {
      try {
        const { data } = await supabase
          .from('topics')
          .select('id,title,code')
          .order('position', { ascending: true })
        if (!cancel && data) {
          setTopics(data)
          if (!selectedTopicId && data.length) setSelectedTopicId(data[0].id)
        }
      } catch (e) {
        console.warn('[AdminNewsForm] topics load failed', e)
      }
    })()
    return () => { cancel = true }
  }, [])

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null)
  }

  const setOption = (i: number, v: string) => {
    setOptions(prev => prev.map((x, idx) => idx === i ? v : x))
  }
  const addOption = () => { if (options.length < 10) setOptions(prev => [...prev, '']) }
  const removeOption = (i: number) => { if (options.length > 2) setOptions(prev => prev.filter((_, idx) => idx !== i)) }

  const publishNews = async () => {
    setError('')
    setOk('')
    const trimmedTitle = title.trim()
    const trimmedContent = content.trim()
    const trimmedOptions = options.map(o => o.trim()).filter(Boolean)

    if (!trimmedTitle && trimmedOptions.length < 2) {
      setError('Введите заголовок или добавьте как минимум 2 варианта для опроса.')
      return
    }

    setLoading(true)
    try {
      // upload media if present
      let media_url: string | null = null
      if (file) {
        const ext = (file.name.split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase()
        const path = `news/${tgId}_${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage.from('media').upload(path, file)
        if (upErr) throw upErr
        const { data } = supabase.storage.from('media').getPublicUrl(path) as any
        media_url = data?.publicUrl ?? data?.publicURL ?? null
      }

      // If >=2 options -> create main_news as a poll + insert options into main_news_options
      if (trimmedOptions.length >= 2) {
        if (!selectedTopicId) {
          setError('Выберите тему для опроса.')
          setLoading(false)
          return
        }

        // Insert main_news row with is_poll = true and block_id (so news page/billboard sees the topic)
        const insertPayload: any = {
          author_tg_id: tgId,
          title: trimmedTitle || null,
          content: trimmedContent || null,
          media_url,
          topic_id: selectedTopicId, // optional: keep in topic_id too
          block_id: selectedTopicId, // IMPORTANT: news.tsx uses block_id
          is_poll: true
        }

        const { data: newsRow, error: newsErr } = await supabase
          .from('main_news')
          .insert([insertPayload])
          .select()
          .single()

        if (newsErr) throw newsErr
        const mainNewsId = (newsRow as any)?.id
        if (!mainNewsId) throw new Error('Не удалось создать запись новости (нет id).')

        // Insert options linked to main_news
        const optionsPayload = trimmedOptions.map((t, idx) => ({
          main_news_id: mainNewsId,
          text: t,
          position: idx
        }))

        const { error: optsErr } = await supabase.from('main_news_options').insert(optionsPayload)
        if (optsErr) {
          // cleanup created main_news on failure to keep DB consistent
          try { await supabase.from('main_news').delete().eq('id', mainNewsId) } catch (_) {}
          throw optsErr
        }

        setOk('Опрос успешно создан в ленте новостей.')
        setTitle(''); setContent(''); setFile(null); setOptions(['',''])
        setLoading(false)
        return
      }

      // Otherwise: create normal main_news entry (no poll) — include block_id so topic is visible
      const { error } = await supabase
        .from('main_news')
        .insert([{
          author_tg_id: tgId,
          title: trimmedTitle || null,
          content: trimmedContent || null,
          media_url,
          topic_id: selectedTopicId || null,
          block_id: selectedTopicId || null,
          is_poll: false
        }])

      if (error) throw error

      setOk('Опубликовано в новостях!')
      setTitle(''); setContent(''); setFile(null); setOptions(['',''])
    } catch (e: any) {
      console.error('[AdminNewsForm] publish error', e)
      setError(e?.message || 'Ошибка публикации')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      background: '#0b0b0c',
      borderRadius: 14,
      padding: 14,
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02)',
    }}>
      <div style={{ fontWeight:800, marginBottom:10, color:'#f3f3f3' }}>Новости проекта (для админов)</div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize:12, color:'#aaa', marginBottom:6 }}>Тема (если создаёте опрос)</div>
        <select
          value={selectedTopicId}
          onChange={(e)=>setSelectedTopicId(e.target.value)}
          style={{
            width:'100%',
            padding:12,
            background:'#0f0f10',
            color:'#fff',
            border:'1px solid rgba(255,255,255,0.04)',
            borderRadius:10,
            marginBottom:8,
            outline:'none'
          }}
          onFocus={(e)=> (e.currentTarget.style.boxShadow = '0 0 0 4px rgba(124,92,255,0.06)')}
          onBlur={(e)=> (e.currentTarget.style.boxShadow = 'none')}
        >
          <option value=''>— Тема не выбрана —</option>
          {topics.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select>
      </div>

      <input
        value={title}
        onChange={(e)=>setTitle(e.target.value)}
        placeholder="Заголовок"
        style={{
          width:'100%',
          padding:12,
          background:'#0f0f10',
          color:'#ffffff',
          border:'1px solid rgba(255,255,255,0.04)',
          borderRadius:10,
          marginBottom:10,
          fontSize:14,
          outline:'none',
          boxShadow: '0 1px 0 rgba(0,0,0,0.6) inset'
        }}
        onFocus={(e)=> (e.currentTarget.style.boxShadow = '0 0 0 4px rgba(124,92,255,0.06)')}
        onBlur={(e)=> (e.currentTarget.style.boxShadow = '0 1px 0 rgba(0,0,0,0.6) inset')}
      />

      <textarea
        value={content}
        onChange={(e)=>setContent(e.target.value)}
        placeholder="Текст новости / вопрос опроса…"
        rows={4}
        style={{
          width:'100%',
          padding:12,
          background:'#0f0f10',
          color:'#fff',
          border:'1px solid rgba(255,255,255,0.04)',
          borderRadius:10,
          marginBottom:10,
          resize:'vertical',
          fontSize:14,
          outline:'none',
          boxShadow: '0 1px 0 rgba(0,0,0,0.6) inset'
        }}
        onFocus={(e)=> (e.currentTarget.style.boxShadow = '0 0 0 4px rgba(124,92,255,0.06)')}
        onBlur={(e)=> (e.currentTarget.style.boxShadow = '0 1px 0 rgba(0,0,0,0.6) inset')}
      />

      <div style={{ fontSize:13, color:'#bdbdbd', marginBottom:8 }}>Варианты опроса (если добавите ≥2 вариантов — будет создан опрос)</div>
      {options.map((opt, i) => (
        <div key={i} style={{ display:'flex', gap:8, marginBottom:8 }}>
          <input
            value={opt}
            onChange={(e)=>setOption(i, e.target.value)}
            placeholder={`Вариант ${i+1}`}
            style={{
              flex:1,
              padding:10,
              background:'#0f0f10',
              color:'#fff',
              borderRadius:10,
              border:'1px solid rgba(255,255,255,0.04)'
            }}
          />
          {options.length > 2 && (
            <button type="button" onClick={()=>removeOption(i)} style={{ width:36, height:36, borderRadius:8, background:'#2b2b2b', color:'#fff', border:'1px solid rgba(255,255,255,0.04)', cursor:'pointer' }} aria-label="Удалить вариант">✕</button>
          )}
        </div>
      ))}
      <div style={{ marginBottom:12 }}>
        <button type="button" onClick={addOption} style={{ padding:'8px 12px', borderRadius:10, background:'transparent', color:'#fff', border:'1px dashed rgba(255,255,255,0.06)', cursor:'pointer' }}>+ Добавить вариант</button>
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
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
          <input type="file" accept="image/*" onChange={onFileChange} style={{ display:'none' }} />
          Выбор файла
        </label>
        <div style={{ color:'#bdbdbd', fontSize:13 }}>{file ? file.name : 'Не выбран ни один файл'}</div>
      </div>

      {error && <div style={{ color:'#ff7b7b', fontSize:13, marginBottom:10 }}>{error}</div>}
      {ok && <div style={{ color:'#7ee787', fontSize:13, marginBottom:10 }}>{ok}</div>}

      <button
        onClick={publishNews}
        disabled={loading || (!title.trim() && options.map(o=>o.trim()).filter(Boolean).length < 2)}
        style={{
          width:'100%',
          padding:'11px 14px',
          borderRadius:10,
          background: loading ? '#4b3b7d' : 'linear-gradient(180deg,#6c56ff,#5846d8)',
          color:'#fff',
          border:'none',
          fontWeight:800,
          boxShadow: '0 6px 18px rgba(88,70,216,0.18)'
        }}
      >
        {loading ? 'Публикация…' : 'Опубликовать'}
      </button>
    </div>
  )
}
