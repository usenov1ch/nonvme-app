import React from 'react'

type BillboardProps = {
  items: { id: string; question: string; title?: string }[]
  onJumpToPost: (id: string) => void
}

export default function Billboard({ items, onJumpToPost }: BillboardProps) {
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
      }}
    >
      {items.map((item) => (
        <div
          key={item.id}
          style={{
            flex: '0 0 260px',
            backgroundColor: '#5F4B8B',
            borderRadius: 24,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                backgroundColor: '#2E2159',
                flexShrink: 0,
                marginRight: 12,
              }}
            />
            <div style={{ color: '#fff', flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>
                {item.title || 'Без заголовка'}
              </div>
              <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>
                {item.question.length > 60 ? item.question.slice(0, 60) + '...' : item.question}
              </div>
            </div>
          </div>

          <button
            onClick={() => onJumpToPost(item.id)}
            style={{
              padding: '10px',
              borderRadius: 10,
              border: 'none',
              backgroundColor: '#2e2159',
              color: '#fff',
              fontWeight: 'bold',
              cursor: 'pointer',
              width: '100%',
            }}
          >
            перейти
          </button>
        </div>
      ))}
      <style>
        {`
          div::-webkit-scrollbar {
            display: none;
          }
        `}
      </style>
    </div>
  )
}
