// pages/news.tsx — Основная лента (читает каждый)
import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import BottomNav from '../components/BottomNav'

type News = {
  id: string
  author_tg_id: string
  title: string
  content: string
  media_url?: string | null
  created_at: string
  users?: { nonvme?: string | null } | null
}

function NewsPage() {
  const [items, setItems] = useState<News[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancel = false
    ;(async () => {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('main_news')
          .select('id,author_tg_id,title,content,media_url,created_at')
          .order('created_at', { ascending: false })
          .limit(200)
        if (error) throw error

        const base = (data || []) as News[]
        const tgs = Array.from(new Set(base.map(n => String(n.author_tg_id))))
        let nameMap: Record<string, string | null> = {}
        if (tgs.length) {
          const { data: usersRows } = await supabase
            .from('users')
            .select('telegram_id, nonvme')
            .in('telegram_id', tgs as any)
          nameMap = Object.fromEntries((usersRows ?? []).map((u: any) => [String(u.telegram_id), u.nonvme || null]))
        }
        const withNames = base.map(n => ({ ...n, users: { nonvme: nameMap[String(n.author_tg_id)] ?? null } }))
        if (!cancel) setItems(withNames)
      } finally {
        if (!cancel) setLoading(false)
      }
    })()
    return () => { cancel = true }
  }, [])

  return (
    <div style={{ minHeight:'100vh', background:'#000', color:'#fff', padding:'16px 16px 84px', fontFamily:'sans-serif' }}>
      <h1 style={{ fontSize:22, fontWeight:800, marginBottom:12 }}>Новости проекта</h1>

      {loading ? (
        <div style={{ opacity:.7 }}>Загрузка…</div>
      ) : items.length === 0 ? (
        <div style={{ opacity:.7 }}>Пока новостей нет</div>
      ) : items.map(n => (
        <div key={n.id} style={{ background:'#111', border:'1px solid #333', borderRadius:16, padding:14, marginBottom:12 }}>
          <div style={{ fontSize:12, opacity:.7, marginBottom:6 }}>
            {n.users?.nonvme || n.author_tg_id} · {new Date(n.created_at).toLocaleString()}
          </div>
          <div style={{ fontWeight:800, fontSize:16, marginBottom:6 }}>{n.title}</div>
          <div style={{ whiteSpace:'pre-wrap' }}>{n.content}</div>
          {n.media_url && <img src={n.media_url} alt="" style={{ width:'100%', borderRadius:10, marginTop:8 }} />}
        </div>
      ))}

      <div style={{ marginTop:'auto' }}>
        <BottomNav />
      </div>
    </div>
  )
}

export default dynamic(() => Promise.resolve(NewsPage), { ssr:false })
