import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/router'

export default function RegisterPage() {
  const [nonvme, setNonvme] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [userId, setUserId] = useState<number | null>(null)
  const router = useRouter()

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user
      if (tgUser?.id) setUserId(tgUser.id)
    }
  }, [])

  useEffect(() => {
    if (!userId) return
    const checkUser = async () => {
      const { data } = await supabase
        .from('users')
        .select('nonvme')
        .eq('telegram_id', userId)
        .single()

      if (data?.nonvme) router.push('/feed')
    }
    checkUser()
  }, [userId])

  const handleRegister = async () => {
  if (!userId) {
    setError('Ошибка: Telegram ID не получен. Попробуйте позже.')
    return
  }

  setError('')
  const trimmed = nonvme.trim()
  const lowercased = trimmed.toLowerCase()
  const valid = /^[a-zA-Z0-9]{5,20}$/

  if (!valid.test(trimmed)) {
    setError('format') // <-- Ключ ошибки
    return
  }



  setLoading(true)

  // Проверка: есть ли такое имя в нижнем регистре
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .filter('nonvme', 'ilike', lowercased)
    .single()

  if (existing) {
    setError('taken')
    setLoading(false)
    return
  }


  const { error: insertError } = await supabase.from('users').insert([
    {
      telegram_id: userId,
      nonvme: lowercased,
    },
  ])

  if (insertError) {
    setError('Ошибка при сохранении. Попробуйте ещё раз.')
  } else {
    router.push('/feed')
  }

  setLoading(false)
}


  return (
  <div style={{
    minHeight: '100vh',
    backgroundColor: '#000',
    color: '#fff',
    fontFamily: 'sans-serif',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  }}>
    <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 40 }}>NoNvme</h1>

    <div style={{ width: '100%', maxWidth: 300, textAlign: 'left' }}>
      <h2 style={{ fontSize: 20, fontWeight: 500, marginBottom: 30, lineHeight: 1.3 }}>
        Добавьте <br /> имя пользователя
      </h2>

      {/* Обёртка над input и ошибкой */}
      <div style={{ position: 'relative', width: '100%' }}>
        <input
          type="text"
          value={nonvme}
          onChange={(e) => setNonvme(e.target.value)}
          placeholder="Username"
          style={{
            width: '100%',
            backgroundColor: 'transparent',
            border: 'none',
            borderBottom: `1px solid ${error === 'taken' || error === 'format' ? '#f44336' : '#fff'}`,
            color: '#fff',
            padding: '10px 5px',
            fontSize: 16,
            outline: 'none',
          }}
        />
        {error === 'format' && (
          <p style={{ color: '#f44336', fontSize: 11, marginTop: 6 }}>
            Имя должно быть от 5 до 20 символов и содержать только латиницу и цифры
          </p>
        )}

        {error === 'taken' && (
          <span style={{
            position: 'absolute',
            right: 5,
            top: 10,
            fontSize: 12,
            color: '#f44336'
          }}>
            Имя уже занято
          </span>
        )}
      </div>


      <p style={{
        fontSize: 11,
        color: '#aaa',
        marginTop: 8,
        lineHeight: 1.4
      }}>
        Имя нельзя менять в течение 30 дней. Выбирайте с умом.
      </p>
    </div>

    <div style={{ marginTop: 100 }}>
      <button
        onClick={handleRegister}
        disabled={loading}
        style={{
          padding: '10px 40px',
          borderRadius: 30,
          border: '1px solid #fff',
          backgroundColor: 'transparent',
          color: '#fff',
          fontSize: 16,
          cursor: 'pointer',
        }}
      >
        {loading ? 'Регистрация...' : 'Продолжить'}
      </button>
    </div>
  </div>
)



}
