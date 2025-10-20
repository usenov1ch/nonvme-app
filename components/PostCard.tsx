type Post = {
  id: number
  title: string
  subtitle: string
  description: string
}

export default function PostCard({ post }: { post: Post }) {
  return (
    <div style={{
      backgroundColor: '#313060',
      borderRadius: 18,
      padding: 14,
      marginBottom: 20,
      color: '#fff',
      fontFamily: 'sans-serif',
    }}>
      {/* «шапка» */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{
          width: 60,
          height: 60,
          borderRadius: 12,
          background: '#202040',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 28,
          fontWeight: 700,
        }}>
          {post.id}
        </div>

        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{post.title}</h3>
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.2 }}>{post.subtitle}</p>
        </div>
      </div>

      {/* тело */}
      <p style={{
        fontSize: 12,
        marginTop: 14,
        lineHeight: 1.4,
        maxHeight: 95,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {post.description}
      </p>

      {/* кнопка-заглушка */}
      <button style={{
        marginTop: 10,
        width: '100%',
        padding: '8px 0',
        borderRadius: 8,
        border: 'none',
        backgroundColor: '#181840',
        color: '#fff',
        fontSize: 13,
        cursor: 'pointer',
      }}>
        перейти
      </button>
    </div>
  )
}
