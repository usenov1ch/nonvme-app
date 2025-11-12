import React from 'react'

type BillboardItem = { id: string; title?: string; question?: string }

type BillboardProps = {
  items: BillboardItem[]
  // поддерживаем Оба пропа, чтобы не падало
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
    // если передали onSelectTopic — используем его, иначе onJumpToPost
    const fn = onSelectTopic ?? onJumpToPost
    if (fn) fn(id)
  }

  const onKey = (e: React.KeyboardEvent<HTMLDivElement>, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleClick(id)
    }
  }

  return (
    <div
      style={{
        overflowX: 'auto',
        display: 'flex',
        gap: 12,
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
        return (
          <div
            key={item.id}
            role="button"
            tabIndex={0}
            aria-pressed={isActive}
            onKeyDown={(e) => onKey(e, item.id)}
            onClick={() => handleClick(item.id)}
            style={{
              scrollSnapAlign: 'start',
              flex: '0 0 250px',
              background: isActive
                ? 'linear-gradient(180deg, #6a5acd 0%, #483d8b 100%)'
                : '#5F4B8B',
              borderRadius: 20,
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: isActive ? '0 10px 24px rgba(0,0,0,.35)' : '0 6px 16px rgba(0,0,0,.25)',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <div style={{ color: '#fff' }}>
              <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>
                {item.title || 'Без заголовка'}
              </div>
              {item.question && (
                <div style={{ fontSize: 12, opacity: .85 }}>
                  {item.question.length > 60 ? item.question.slice(0, 60) + '…' : item.question}
                </div>
              )}
            </div>

            <div
              style={{
                marginTop: 10,
                padding: '10px',
                borderRadius: 12,
                background: 'rgba(0,0,0,.22)',
                color: '#fff',
                fontWeight: 700,
                textAlign: 'center',
                pointerEvents: 'none',
              }}
            >
              {isActive ? 'выбрано' : 'выбрать тему'}
            </div>
          </div>
        )
      })}
      <style>{`div::-webkit-scrollbar{display:none}`}</style>
    </div>
  )
}
