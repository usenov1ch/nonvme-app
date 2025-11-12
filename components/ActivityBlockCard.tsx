// components/ActivityBlockCard.tsx
import React from 'react'

type Block = {
  id: string
  title: string
  description?: string
  cover_url?: string | null
  partner?: string | null
}

type Props = {
  block: Block
  isOpen: boolean
  onToggle: (id: string) => void
}

export default function ActivityBlockCard({ block, isOpen, onToggle }: Props) {
  return (
    <div
      style={{
        background: '#111',
        borderRadius: 16,
        border: '1px solid #333',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {block.cover_url && (
        <img src={block.cover_url} alt="" style={{ width: '100%', height: 120, objectFit: 'cover' }} />
      )}
      <div style={{ padding: 14 }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>{block.title}</div>
        {block.partner && (
          <div style={{ fontSize: 12, opacity: .8, marginBottom: 6 }}>Партнёр: {block.partner}</div>
        )}
        {block.description && (
          <div style={{ fontSize: 13, opacity: .9, marginBottom: 10 }}>
            {block.description.length > 120 ? block.description.slice(0,120)+'…' : block.description}
          </div>
        )}

        <button
          onClick={() => onToggle(block.id)}
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 10,
            background: '#2e2159',
            color: '#fff',
            border: 'none',
            fontWeight: 700,
            cursor:'pointer'
          }}
        >
          {isOpen ? 'скрыть' : 'открыть'}
        </button>
      </div>
    </div>
  )
}
