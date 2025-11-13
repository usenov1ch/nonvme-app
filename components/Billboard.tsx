// components/Billboard.tsx
import React from 'react'

type BillboardItem = {
  id: string
  title?: string // русское название
  code?: string  // английский код (вариант)
  question?: string // иногда используется вместо code
}

type BillboardProps = {
  items: BillboardItem[]
  onSelectTopic?: (id: string) => void
  onJumpToPost?: (id: string) => void
  selectedId?: string | null
}

export default function Billboard({
  items,
  onSelectTopic,
  onJumpToPost,
  selectedId,
}: BillboardProps) {
  const handleClick = (id: string) => {
    const fn = onSelectTopic ?? onJumpToPost
    if (fn) fn(id)
  }

  if (!items || items.length === 0) {
    return <div style={{ opacity: .7 }}>Темы не найдены</div>
  }

  return (
    <div
      style={{
        overflowX: 'auto',
        display: 'flex',
        gap: 18,
        paddingBottom: 16,
        paddingTop: 10,
        marginBottom: 20,
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
        scrollSnapType: 'x mandatory',
      }}
    >
      {items.map((item) => {
        const isActive = selectedId ? selectedId === item.id : false

        // choose english code: prefer question, then code, else fallback to title
        const codeRaw = item.question ?? item.code ?? item.title ?? ''
        const code = String(codeRaw).toUpperCase()
        const ruTitle = item.title ?? ''

        return (
          <div
            key={item.id}
            role="button"
            tabIndex={0}
            aria-pressed={isActive}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handleClick(item.id)
              }
            }}
            onClick={() => handleClick(item.id)}
            style={{
              scrollSnapAlign: 'start',
              flex: '0 0 280px',
              borderRadius: 18,
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              minWidth: 280,
              maxWidth: 280,
              cursor: 'pointer',
              userSelect: 'none',
              background: isActive
                ? 'linear-gradient(180deg,#202020,#141414)'
                : 'linear-gradient(180deg,#171717,#0f0f0f)',
              boxShadow: isActive ? '0 18px 40px rgba(0,0,0,0.6)' : '0 10px 28px rgba(0,0,0,0.5)',
              border: isActive ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(255,255,255,0.03)',
              color: '#fff',
            }}
          >
            {/* big square */}
            <div
              style={{
                width: '100%',
                height: 160,
                borderRadius: 12,
                background: 'linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0.18))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                padding: 12,
                boxSizing: 'border-box',
                textAlign: 'center',
              }}
            >
              <div style={{
                fontFamily: '"Anton", "Arial Black", "Arial", sans-serif',
                fontWeight: 800,
                fontSize: 28,
                letterSpacing: 1,
                textTransform: 'uppercase',
                color: '#f5f5f5',
                lineHeight: 1,
                marginBottom: 8,
              }}>
                {code}
              </div>

              <div style={{
                fontSize: 12,
                color: 'rgba(255,255,255,0.65)',
              }}>
                {ruTitle}
              </div>
            </div>

            {/* bottom button area — only "Читать" centered (no star) */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{
                width: '100%',
                maxWidth: 180,
                borderRadius: 12,
                background: '#ffffff',
                padding: '10px 14px',
                color: '#000',
                fontWeight: 800,
                textAlign: 'center',
                boxShadow: '0 8px 20px rgba(0,0,0,0.25)',
                fontSize: 16,
              }}>
                Читать
              </div>
            </div>
          </div>
        )
      })}
      <style>{`div::-webkit-scrollbar{display:none}`}</style>
    </div>
  )
}
