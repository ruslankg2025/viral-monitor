import React from 'react'
import { xfactorBg } from '../utils.js'

export default function XFactorBadge({ xFactor, isOutlier, size = 'sm' }) {
  const colorClass = xfactorBg(xFactor)
  const isLarge = size === 'lg'

  return (
    <span
      className={isOutlier ? 'outlier-pulse' : ''}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: isLarge ? '4px 10px' : '2px 6px',
        borderRadius: 6,
        fontSize: isLarge ? 15 : 11,
        fontWeight: 700,
        fontFamily: 'var(--font-mono)',
        letterSpacing: '-0.3px',
        border: '1px solid',
        background:
          xFactor >= 10
            ? 'rgba(239,68,68,0.15)'
            : xFactor >= 5
            ? 'rgba(245,158,11,0.15)'
            : 'rgba(255,255,255,0.05)',
        color:
          xFactor >= 10
            ? '#f87171'
            : xFactor >= 5
            ? '#fbbf24'
            : '#6b7280',
        borderColor:
          xFactor >= 10
            ? 'rgba(239,68,68,0.3)'
            : xFactor >= 5
            ? 'rgba(245,158,11,0.3)'
            : 'rgba(255,255,255,0.1)',
        whiteSpace: 'nowrap',
      }}
    >
      {xFactor?.toFixed(1)}x
    </span>
  )
}
