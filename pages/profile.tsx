import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import BottomNav from '../components/BottomNav'
import CreatePollForm from '../components/CreatePollForm'

export default function ProfilePage() {
  const [user, setUser] = useState<{ nonvme: string; registered_at: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user
    const userId = tgUser?.id

    if (!userId) {
      setError('Ошибка: Telegram ID не найден.')
      setLoading(false)
      return
    }

    const fetchProfile = async () => {
      const { data, error } = await supabase
        .from('users')
        .select('nonvme, registered_at')
        .eq('telegram_id', userId)
        .single()

      if (error) {
        setError('Профиль не найден.')
      } else {
        setUser(data)
      }

      setLoading(false)
    }

    fetchProfile()
  }, [])

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#000',
      color: '#fff',
      fontFamily: 'sans-serif',
      padding: '40px 20px 80px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      overflowX: 'hidden',
    }}>
      <h1 style={{
        fontSize: 28,
        fontWeight: 700,
        marginBottom: 30,
        textAlign: 'center',
      }}>
        Профиль
      </h1>

      {loading ? (
        <p>Загрузка профиля...</p>
      ) : error ? (
        <p style={{ color: 'red' }}>{error}</p>
      ) : user && (
        <div style={{
          width: '100%',
          maxWidth: 320,
          background: '#111',
          borderRadius: 20,
          padding: '24px 20px',
          textAlign: 'center',
          border: '1px solid #333',
          boxShadow: '0 0 20px rgba(255,255,255,0.05)',
        }}>
          <div style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: '#222',
            margin: '0 auto 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 24,
            fontWeight: 600,
            color: '#aaa',
            border: '2px solid #444',
          }}>
            {user.nonvme[0].toUpperCase()}
          </div>

          <div style={{ fontSize: 20, fontWeight: 600 }}>{user.nonvme}</div>
          <div style={{ color: '#777', fontSize: 12, marginBottom: 20 }}>nonvme</div>

          <div style={{ textAlign: 'left' }}>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: '#777' }}>Дата регистрации</div>
              <div style={{ fontSize: 14 }}>
                {new Date(user.registered_at).toLocaleDateString('ru-RU')}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#777' }}>Голосов</div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>0</div>
            </div>
          </div>
        </div>
      )}

      <CreatePollForm />
        
      <div style={{ marginTop: 'auto' }}>
        
        <BottomNav />
      </div>
    </div>
  )
}
