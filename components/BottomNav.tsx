import { useRouter } from 'next/router'
import { Home, User } from 'lucide-react'

export default function BottomNav() {
  const router = useRouter()
  const current = router.pathname

  return (
    <div style={{
      position: 'fixed',
      bottom: 16,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 280,
      height: 60,
      backgroundColor: '#000',
      border: '1px solid #fff',
      borderRadius: 999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 20px',
      zIndex: 1000,
    }}>
      {/* Левая кнопка - Feed */}
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
        <Home size={22} color="#fff" />
      </button>

      {/* Центр. кнопка - Coming soon */}
      <div
        onClick={() => router.push('/soon')}
        style={{
          width: 100,
          height: 40,
          backgroundColor: current === '/soon' ? '#2b2b2b' : 'transparent',
          borderRadius: 999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          color: '#fff',
          textAlign: 'center',
          lineHeight: 1.1,
          cursor: 'pointer',
        }}
      >
        coming<br />soon
      </div>

      {/* Правая кнопка - Profile */}
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
