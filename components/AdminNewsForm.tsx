import { useState } from 'react'
import { supabase } from '../lib/supabase'

type Props = { tgId: string }

export default function AdminNewsForm({ tgId }: Props) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const publishNews = async () => {
    setError(''); setOk('')
    if (!title.trim() || !content.trim()) {
      setError('Введите заголовок и текст.')
      return
    }
    setLoading(true)
    try {
      let media_url: string | null = null
      if (file) {
        const ext = file.name.split('.').pop()
        const path = `news/${tgId}_${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage.from('media').upload(path, file)
        if (upErr) throw upErr
        const { data } = supabase.storage.from('media').getPublicUrl(path)
        media_url = data.publicUrl
      }

      // Триггер в БД не даст вставить, если tgId не админ
      const { error } = await supabase
        .from('main_news')
        .insert([{ author_tg_id: tgId, title: title.trim(), content: content.trim(), media_url }])

      if (error) throw error

      setOk('Опубликовано в новостях!')
      setTitle(''); setContent(''); setFile(null)
    } catch (e: any) {
      setError(e?.message || 'Ошибка публикации')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ background:'#111', border:'1px solid #333', borderRadius:16, padding:14 }}>
      <div style={{ fontWeight:800, marginBottom:8 }}>Новости проекта (для админов)</div>

      <input
        value={title}
        onChange={(e)=>setTitle(e.target.value)}
        placeholder="Заголовок"
        style={{ width:'100%', padding:10, background:'#0f0f0f', color:'#fff', border:'1px solid #333', borderRadius:10, marginBottom:8 }}
      />

      <textarea
        value={content}
        onChange={(e)=>setContent(e.target.value)}
        placeholder="Текст новости…"
        rows={4}
        style={{ width:'100%', padding:10, background:'#0f0f0f', color:'#fff', border:'1px solid #333', borderRadius:10, marginBottom:8, resize:'vertical' }}
      />

      <input type="file" accept="image/*" onChange={(e)=>setFile(e.target.files?.[0] || null)} style={{ marginBottom:8 }} />

      {error && <div style={{ color:'#f66', fontSize:12, marginBottom:8 }}>{error}</div>}
      {ok && <div style={{ color:'#7ee787', fontSize:12, marginBottom:8 }}>{ok}</div>}

      <button
        onClick={publishNews}
        disabled={loading || !title.trim() || !content.trim()}
        style={{
          width:'100%', padding:'10px 12px', borderRadius:10,
          background: loading ? '#473a7d' : '#2e2159',
          color:'#fff', border:'none', fontWeight:700
        }}
      >
        {loading ? 'Публикация…' : 'Опубликовать в новости'}
      </button>
    </div>
  )
}
