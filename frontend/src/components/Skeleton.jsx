import React from 'react'

export function SkeletonBlock({ width = '100%', height = 16, className = '' }) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{ width, height, borderRadius: 6 }}
    />
  )
}

export function VideoCardSkeleton() {
  return (
    <div
      style={{
        background: 'var(--bg-secondary)',
        borderRadius: 10,
        border: '1px solid var(--border)',
        overflow: 'hidden',
      }}
    >
      <div className="skeleton" style={{ width: '100%', paddingTop: '56.25%' }} />
      <div style={{ padding: 14 }}>
        <SkeletonBlock width="60%" height={12} />
        <div style={{ marginTop: 8 }} />
        <SkeletonBlock width="100%" height={14} />
        <div style={{ marginTop: 4 }} />
        <SkeletonBlock width="80%" height={14} />
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <SkeletonBlock width={60} height={10} />
          <SkeletonBlock width={60} height={10} />
          <SkeletonBlock width={60} height={10} />
        </div>
      </div>
    </div>
  )
}

export function BloggerCardSkeleton() {
  return (
    <div
      style={{
        background: 'var(--bg-secondary)',
        borderRadius: 10,
        border: '1px solid var(--border)',
        padding: 16,
        display: 'flex',
        gap: 14,
      }}
    >
      <div className="skeleton" style={{ width: 48, height: 48, borderRadius: '50%', flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <SkeletonBlock width="50%" height={14} />
        <div style={{ marginTop: 6 }} />
        <SkeletonBlock width="30%" height={11} />
        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          <SkeletonBlock width={70} height={10} />
          <SkeletonBlock width={70} height={10} />
        </div>
      </div>
    </div>
  )
}
