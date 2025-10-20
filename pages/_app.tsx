import type { AppProps } from 'next/app'
import { useEffect } from 'react'
import '../styles/globals.css'

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    // Проверка, что Telegram SDK доступен в окне
    if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
      window.Telegram.WebApp.expand() // Разворачивает WebApp на весь экран
    }
  }, [])

  return <Component {...pageProps} />
}

