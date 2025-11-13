// components/BottomNav.tsx  — оптимизированная версия (lottie + pausing + low-fr + idle-load)
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'

declare global { interface Window { Telegram?: any; requestIdleCallback?: any } }

const ICONS = [
  { path: '/news', key: 'home', json: '/icons/Home_lottie.json' },
  { path: '/feed', key: 'feed', json: '/icons/Bottom_Navigation_lottie.json' },
  { path: '/chat', key: 'chat', json: '/icons/Event_List_lottie.json' },
  { path: '/soon', key: 'blocks', json: '/icons/Extension_lottie.json' },
  { path: '/profile', key: 'profile', json: '/icons/Deployed_Code_lottie.json' },
]

const NAV_STYLE: React.CSSProperties = {
  position: 'fixed', bottom: 14, left: '50%', transform: 'translateX(-50%)',
  width: 'min(92%, 420px)', height: 72, background: 'rgba(0,0,0,0.85)',
  border: '1px solid rgba(255,255,255,0.06)', borderRadius: 999,
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '8px 12px', gap: 8, zIndex: 1000, boxShadow: '0 8px 30px rgba(0,0,0,0.6)',
  backdropFilter: 'blur(6px)'
}

const BTN_BASE = (active = false): React.CSSProperties => ({
  width: 64, height: 64, borderRadius: 999, border: 'none',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: active ? 'linear-gradient(180deg,#2b2b2b,#1f1f1f)' : 'transparent',
  cursor: 'pointer', position: 'relative',
})

export default function BottomNav() {
  const router = useRouter()
  const current = router.pathname

  const [tgId, setTgId] = useState<string>('')
  const [isAdmin, setIsAdmin] = useState(false)

  const containerRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const anims = useRef<Record<string, any>>({})
  const lottieRef = useRef<any>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const hasLoadedRef = useRef<Record<string, boolean>>({})

  useEffect(() => {
    const u = (typeof window !== 'undefined') ? window.Telegram?.WebApp?.initDataUnsafe?.user : null
    if (u?.id) setTgId(String(u.id))
  }, [])

  useEffect(() => {
    if (!tgId) return
    ;(async () => {
      try {
        const { data } = await supabase
          .from('admin_publishers')
          .select('telegram_id')
          .eq('telegram_id', tgId)
          .maybeSingle()
        setIsAdmin(!!data)
      } catch (e) { console.warn(e) }
    })()
  }, [tgId])

  // уменьшает кадррей̆т внутри json (перед рендером) — простая и эффективная оптимизация
  function clampJsonFrameRate(json: any, maxFps = 20) {
    try {
      if (json && typeof json.fr === 'number') {
        json.fr = Math.min(json.fr, maxFps)
      }
    } catch (e) { /* ignore */ }
  }

  // create animation (but try to defer non-critical ones)
  const createAnim = async (key: string, jsonUrl: string) => {
    if (anims.current[key]) return
    try {
      // fetch JSON
      const resp = await fetch(jsonUrl, { cache: 'force-cache' })
      if (!resp.ok) throw new Error('JSON not found')
      const json = await resp.json()
      // clamp framerate to reduce CPU
      clampJsonFrameRate(json, 20)

      // dynamic import only once
      if (!lottieRef.current) {
        const lib = await import('lottie-web')
        lottieRef.current = lib
      }
      const lottie = lottieRef.current

      const container = containerRefs.current[key]
      if (!container) return

      // destroy previous if any
      if (anims.current[key]?.destroy) {
        try { anims.current[key].destroy() } catch (e) {}
        delete anims.current[key]
      }

      // create animation
      const anim = lottie.loadAnimation({
        container,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        animationData: json,
        rendererSettings: { preserveAspectRatio: 'xMidYMid meet' }
      })

      // ---- осветление иконки ----
      anim.addEventListener('DOMLoaded', () => {
        const svg = container.querySelector('svg')
        if (!svg) return

        // Увеличиваем яркость линий
        const LIGHT_COLOR = 'rgba(255,255,255,0.95)'  // ← можешь менять
        const FILL_COLOR  = 'rgba(255,255,255,0.90)'   // ← для заливок

        svg.querySelectorAll('*').forEach(el => {
          if (el instanceof SVGElement) {
            if (el.getAttribute('stroke')) el.setAttribute('stroke', LIGHT_COLOR)
            if (el.getAttribute('fill') && el.getAttribute('fill') !== 'none') {
              el.setAttribute('fill', FILL_COLOR)
            }
          }
        })
      })

      setTimeout(() => {
        const svg = container.querySelector('svg')
        if (!svg) return

        const LIGHT_COLOR = 'rgba(255,255,255,0.95)'
        const FILL_COLOR  = 'rgba(255,255,255,0.90)'

        svg.querySelectorAll('*').forEach(el => {
          if (el instanceof SVGElement) {
            if (el.getAttribute('stroke')) el.setAttribute('stroke', LIGHT_COLOR)
            if (el.getAttribute('fill') && el.getAttribute('fill') !== 'none') {
              el.setAttribute('fill', FILL_COLOR)
            }
          }
        })
      }, 50)

      // make it a bit slower to reduce CPU
      try { anim.setSpeed(0.85) } catch (e) {}

      anims.current[key] = anim

      // observe visibility of container to pause/play when off-screen
      if (observerRef.current && container) observerRef.current.observe(container)
      hasLoadedRef.current[key] = true
    } catch (e) {
      console.warn('[BottomNav] createAnim failed', key, e)
    }
  }

  // init observer + load animations (but defer non-critical via requestIdleCallback)
  useEffect(() => {
    // IntersectionObserver: pause animation when not visible in viewport
    observerRef.current = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const el = entry.target as HTMLDivElement
        const key = el.getAttribute('data-lkey') || ''
        const anim = anims.current[key]
        if (!anim) return
        if (entry.isIntersecting) {
          try { anim.play() } catch (e) {}
        } else {
          try { anim.pause() } catch (e) {}
        }
      })
    }, { root: null, threshold: 0.1 })

    // strategy: load critical animation(s) immediately (e.g., home + center), defer others to idle
    const immediateKeys = ['home', 'blocks'] // tweak: which icons should be instant
    ICONS.forEach(ic => {
      if (immediateKeys.includes(ic.key)) {
        // load immediately
        void createAnim(ic.key, ic.json)
      } else {
        // defer to idle to avoid blocking
        const doLoad = () => void createAnim(ic.key, ic.json)
        if (typeof (window as any).requestIdleCallback === 'function') {
          (window as any).requestIdleCallback(doLoad, { timeout: 1000 })
        } else {
          // fallback: small timeout
          setTimeout(doLoad, 700)
        }
      }
    })

    // pause all when tab hidden
    const onVisibility = () => {
      if (document.hidden) {
        Object.values(anims.current).forEach(a => { try { a.pause() } catch (e) {} })
      } else {
        Object.values(anims.current).forEach(a => { try { a.play() } catch (e) {} })
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      try {
        observerRef.current?.disconnect()
      } catch (e) {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // cleanup on unmount
  useEffect(() => {
    return () => {
      try {
        Object.values(anims.current).forEach(a => { try { a.destroy() } catch (e) {} })
        anims.current = {}
      } catch (e) {}
    }
  }, [])

  const go = (p: string) => router.push(p)

  return (
    <nav style={NAV_STYLE} aria-label="Bottom navigation">
      {ICONS.map(it => {
        const active = current === it.path
        return (
          <button key={it.path} onClick={() => go(it.path)} style={BTN_BASE(active)} aria-label={it.key}>
            <div
              ref={el => {
                if (!el) return
                el.setAttribute('data-lkey', it.key)
                containerRefs.current[it.key] = el
              }}
              style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', background: 'transparent' }}
            />
          </button>
        )
      })}
    </nav>
  )
}
