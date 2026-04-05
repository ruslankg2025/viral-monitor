import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api.js'

const PROVIDER_LABELS = {
  claude: 'Claude (Anthropic)',
  openai: 'OpenAI',
  groq: 'Groq (Llama)',
  assemblyai: 'AssemblyAI',
  apify: 'Apify',
}

const PROVIDER_COLORS = {
  claude: '#a78bfa',
  openai: '#34d399',
  groq: '#60a5fa',
  assemblyai: '#f472b6',
  apify: '#fb923c',
}

export default function CostDashboard() {
  const [period, setPeriod] = useState('month')

  const { data } = useQuery({
    queryKey: ['costs', period],
    queryFn: () => api.stats.costs(period),
  })

  return (
    <div>
      {/* Period tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {[{ value: 'week', label: 'Неделя' }, { value: 'month', label: 'Месяц' }].map(
          ({ value, label }) => (
            <button
              key={value}
              onClick={() => setPeriod(value)}
              style={{
                padding: '4px 12px',
                borderRadius: 6,
                border: period === value ? 'none' : '1px solid var(--border)',
                background: period === value ? 'var(--accent)' : 'transparent',
                color: period === value ? '#000' : 'var(--text-secondary)',
                fontSize: 12,
                fontWeight: period === value ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          )
        )}
      </div>

      {/* Table */}
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 8,
          overflow: 'hidden',
          marginBottom: 16,
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--bg-tertiary)' }}>
              {['Сервис', 'Запросов', 'Tokens IN', 'Tokens OUT', 'Стоимость'].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: '8px 12px',
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    textAlign: 'left',
                    fontWeight: 600,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data?.by_provider.map((row) => (
              <tr
                key={row.provider}
                style={{ borderTop: '1px solid var(--border)' }}
              >
                <td style={{ padding: '8px 12px', fontSize: 13 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: PROVIDER_COLORS[row.provider] || '#888',
                        flexShrink: 0,
                      }}
                    />
                    {PROVIDER_LABELS[row.provider] || row.provider}
                  </div>
                </td>
                <td style={{ padding: '8px 12px', fontSize: 13, fontFamily: 'var(--font-mono)' }}>
                  {row.requests}
                </td>
                <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {row.tokens_in.toLocaleString()}
                </td>
                <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {row.tokens_out.toLocaleString()}
                </td>
                <td style={{ padding: '8px 12px', fontSize: 13, fontFamily: 'var(--font-mono)' }}>
                  <span style={{ color: row.cost_usd === 0 ? 'var(--success)' : 'var(--text-primary)' }}>
                    {row.cost_usd === 0 ? 'Бесплатно' : `$${row.cost_usd.toFixed(4)}`}
                  </span>
                </td>
              </tr>
            ))}

            {/* Total row */}
            {data && (
              <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--bg-tertiary)' }}>
                <td colSpan={4} style={{ padding: '8px 12px', fontSize: 13, fontWeight: 600 }}>
                  ИТОГО
                </td>
                <td
                  style={{
                    padding: '8px 12px',
                    fontSize: 14,
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--accent)',
                  }}
                >
                  ${data.total_cost.toFixed(4)}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {!data?.by_provider.length && (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            Нет данных о расходах за выбранный период
          </div>
        )}
      </div>

      {/* Visual bar */}
      {data?.total_cost > 0 && data.by_provider.length > 0 && (
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
            Распределение расходов
          </div>
          <div style={{ height: 8, borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
            {data.by_provider
              .filter((r) => r.cost_usd > 0)
              .map((row) => (
                <div
                  key={row.provider}
                  title={`${PROVIDER_LABELS[row.provider]}: $${row.cost_usd.toFixed(4)}`}
                  style={{
                    width: `${(row.cost_usd / data.total_cost) * 100}%`,
                    background: PROVIDER_COLORS[row.provider] || '#888',
                  }}
                />
              ))}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
            {data.by_provider
              .filter((r) => r.cost_usd > 0)
              .map((row) => (
                <div key={row.provider} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 2,
                      background: PROVIDER_COLORS[row.provider] || '#888',
                    }}
                  />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {PROVIDER_LABELS[row.provider] || row.provider}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
