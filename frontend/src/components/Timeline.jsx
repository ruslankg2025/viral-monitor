import React from 'react'

export default function Timeline({ structure }) {
  if (!structure?.length) return null

  return (
    <div style={{ position: 'relative', paddingLeft: 24 }}>
      {/* Vertical line */}
      <div
        style={{
          position: 'absolute',
          left: 7,
          top: 8,
          bottom: 8,
          width: 2,
          background: 'var(--border)',
        }}
      />

      {structure.map((item, i) => (
        <div key={i} style={{ position: 'relative', marginBottom: 16 }}>
          {/* Dot */}
          <div
            style={{
              position: 'absolute',
              left: -21,
              top: 4,
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: i === 0 ? 'var(--accent)' : 'var(--border)',
              border: '2px solid var(--bg-secondary)',
            }}
          />

          {/* Content */}
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
              <span
                style={{
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--accent)',
                  fontWeight: 600,
                }}
              >
                {item.second !== undefined ? `${item.second}с` : ''}
              </span>
              <span
                style={{
                  fontSize: 12,
                  padding: '1px 6px',
                  borderRadius: 4,
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-muted)',
                }}
              >
                {item.technique}
              </span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5 }}>
              {item.element}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
