import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { Home, User, MessageSquare, Newspaper, Shield } from 'lucide-react'
import { supabase } from '../lib/supabase'

declare global { interface Window { Telegram?: any } }

export default function BottomNav() {
  const router = useRouter()
  const current = router.pathname

  const [isAdmin, setIsAdmin] = useState(false)
  const [tgId, setTgId] = useState<string>('')

  // получаем Telegram ID пользователя
  useEffect(() => {
    const u = (typeof window !== 'undefined') ? window.Telegram?.WebApp?.initDataUnsafe?.user : null
    if (u?.id) setTgId(String(u.id))
  }, [])

  // проверяем, является ли пользователь админом
  useEffect(() => {
    if (!tgId) return
    ;(async () => {
      const { data } = await supabase
        .from('admin_publishers')
        .select('telegram_id')
        .eq('telegram_id', tgId)
        .maybeSingle()
      setIsAdmin(!!data)
    })()
  }, [tgId])

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 340,
        height: 60,
        backgroundColor: '#000',
        border: '1px solid #fff',
        borderRadius: 999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        padding: '0 16px',
        zIndex: 1000,
      }}
    >


      {/* Новости (основная лента, видна всем) */}
      <button
        onClick={() => router.push('/news')}
        style={{
          width: 40,
          height: 40,
          borderRadius: 999,
          backgroundColor: current === '/news' ? '#2b2b2b' : 'transparent',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <Home size={22} color="#fff" />
      </button>


      {/* Главная лента */}
      <button
        onClick={() => router.push('/feed')}
        style={{
          width: 40,
          height: 40,
          borderRadius: 999,
          backgroundColor: current === '/feed' ? '#2b2b2b' : 'transparent',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <Newspaper size={22} color="#fff" />
      </button>


      

      {/* Общий чат */}
      <button
        onClick={() => router.push('/chat')}
        style={{
          width: 40,
          height: 40,
          borderRadius: 999,
          backgroundColor: current === '/chat' ? '#2b2b2b' : 'transparent',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <MessageSquare size={22} color="#fff" />
      </button>

      {/* Active Blocks */}
      <button
        onClick={() => router.push('/soon')}
        style={{
          width: 100,
          height: 40,
          borderRadius: 999,
          backgroundColor: current === '/soon' ? '#2b2b2b' : 'transparent',
          border: 'none',
          color: '#fff',
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        Active<br />Blocks
      </button>

      

      {/* Профиль */}
      <button
        onClick={() => router.push('/profile')}
        style={{
          width: 40,
          height: 40,
          borderRadius: 999,
          backgroundColor: current === '/profile' ? '#2b2b2b' : 'transparent',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <User size={22} color="#fff" />
      </button>
    </div>
  )
}
