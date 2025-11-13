import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/router'

export default function RegisterPage() {
  const [nonvme, setNonvme] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [userId, setUserId] = useState<number | null>(null)
  const [videoError, setVideoError] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const tgUser = (window as any).Telegram?.WebApp?.initDataUnsafe?.user
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

      if (data?.nonvme) router.push('/news')
    }
    checkUser()
  }, [userId])

  const handleRegister = async () => {
    if (!userId) {
      setError('Ошибка: Telegram ID не получен.')
      return
    }

    setError('')
    const trimmed = nonvme.trim()
    const lowercased = trimmed.toLowerCase()
    const valid = /^[a-zA-Z0-9]{5,20}$/

    if (!valid.test(trimmed)) {
      setError('format')
      return
    }

    setLoading(true)

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
      setError('Ошибка при сохранении.')
    } else {
      router.push('/news')
    }

    setLoading(false)
  }

  return (
    <div style={{
      minHeight:'100vh',
      background:'#000',
      color:'#fff',
      fontFamily:'sans-serif',
      display:'flex',
      flexDirection:'column',
      justifyContent:'center',
      alignItems:'center',
      padding:20
    }}>
      
      {/* 🔥 Анимация — уменьшенная и идеально выровненная */}
      <div style={{
        display:'flex',
        justifyContent:'center',
        alignItems:'center',
        width:'100%',
        maxWidth:240,
        marginBottom:40
      }}>
        {!videoError ? (
          <video
            src="/nonvmeTxtAnim.webm"
            autoPlay
            loop
            muted
            playsInline
            onError={() => setVideoError(true)}
            style={{
              width:'100%',
              height:'250px',
              borderRadius:8,
              objectFit:'contain'
            }}
          />
        ) : (
          <h1 style={{ fontSize:32, fontWeight:800 }}>NoNvme</h1>
        )}
      </div>

      {/* Блок ввода */}
      <div style={{ width:'100%', maxWidth:300, textAlign:'left' }}>
        <h2 style={{ fontSize:20, fontWeight:500, marginBottom:20, lineHeight:1.3 }}>
          Добавьте <br /> имя пользователя
        </h2>

        <div style={{ position:'relative', width:'100%' }}>
          <input
            type="text"
            value={nonvme}
            onChange={(e) => setNonvme(e.target.value)}
            placeholder="Username"
            style={{
              width:'100%',
              background:'transparent',
              border:'none',
              borderBottom:`1px solid ${error ? '#f44336' : '#fff'}`,
              color:'#fff',
              padding:'10px 5px',
              fontSize:16,
              outline:'none'
            }}
          />

          {error === 'format' && (
            <p style={{ color:'#f44336', fontSize:11, marginTop:6 }}>
              Имя 5–20 символов, только латиница и цифры
            </p>
          )}
          {error === 'taken' && (
            <p style={{ color:'#f44336', fontSize:11, marginTop:6 }}>
              Такое имя уже занято
            </p>
          )}
        </div>

        <p style={{ fontSize:11, color:'#aaa', marginTop:10 }}>
          Имя нельзя менять 30 дней. Выбирайте с умом.
        </p>
      </div>

      <button
        onClick={handleRegister}
        disabled={loading}
        style={{
          marginTop:60,
          padding:'10px 40px',
          borderRadius:30,
          border:'1px solid #fff',
          background:'transparent',
          color:'#fff',
          fontSize:16,
          cursor:'pointer'
        }}
      >
        {loading ? 'Регистрация...' : 'Продолжить'}
      </button>
    </div>
  )
}
