import React, { useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ExternalLink,
  Heart,
  Sparkles,
  Play,
  Loader2,
} from 'lucide-react'
import { api } from '../api.js'
import { formatNumber, formatDuration, timeAgo } from '../utils.js'
import XFactorBadge from '../components/XFactorBadge.jsx'
import PlatformIcon from '../components/PlatformIcon.jsx'
import Timeline from '../components/Timeline.jsx'
import GenerateForm from '../components/GenerateForm.jsx'
import { useStore } from '../store.js'

export default function VideoDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const addToast = useStore((s) => s.addToast)
  const generateFormOpen = useStore((s) => s.generateFormOpen)
  const openGenerateForm = useStore((s) => s.openGenerateForm)
  const closeGenerateForm = useStore((s) => s.closeGenerateForm)
  const qc = useQueryClient()

  const { data: video, isLoading } = useQuery({
    queryKey: ['video', id],
    queryFn: () => api.videos.get(id),
  })

  // Poll analysis status
  const { data: statusData } = useQuery({
    queryKey: ['analysis-status', id],
    queryFn: () => api.analysis.status(id),
    refetchInterval: (data) =>
      data?.status === 'running' || data?.status === 'pending' ? 3000 : false,
    enabled: !!video && !video.is_analyzed,
  })

  const analysisStatus = statusData?.status

  // Refresh video data when analysis completes
  useEffect(() => {
    if (analysisStatus === 'done') {
      qc.invalidateQueries({ queryKey: ['video', id] })
    }
  }, [analysisStatus, id, qc])

  const analyzeMutation = useMutation({
    mutationFn: () => api.analysis.trigger(id),
    onSuccess: () => {
      addToast('Анализ запущен', 'info')
      qc.invalidateQueries({ queryKey: ['analysis-status', id] })
    },
    onError: (err) => addToast(err.message, 'error'),
  })

  const favMutation = useMutation({
    mutationFn: () => api.videos.toggleFavorite(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['video', id] }),
    onError: (err) => addToast(err.message, 'error'),
  })

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
        <Loader2 size={24} color="var(--text-muted)" style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }

  if (!video) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
        Видео не найдено
      </div>
    )
  }

  const analysis = video.ai_analysis
  const isAnalysing = analysisStatus === 'running' || analysisStatus === 'pending'

  return (
    <div>
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'none',
          border: 'none',
          color: 'var(--text-muted)',
          fontSize: 13,
          cursor: 'pointer',
          marginBottom: 20,
          padding: 0,
        }}
      >
        <ArrowLeft size={14} /> Назад
      </button>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
        {/* LEFT COLUMN */}
        <div>
          {/* Thumbnail */}
          <div
            style={{
              borderRadius: 10,
              overflow: 'hidden',
              background: '#0f0f0f',
              marginBottom: 16,
              position: 'relative',
              paddingTop: '56.25%',
            }}
          >
            {video.thumbnail_url ? (
              <img
                src={video.thumbnail_url}
                alt={video.title}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Play size={40} color="var(--text-muted)" />
              </div>
            )}
          </div>

          {/* Title */}
          <h1 style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.3, marginBottom: 8 }}>
            {video.title || '(без названия)'}
          </h1>

          {/* Author */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <PlatformIcon platform={video.platform} />
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>@{video.blogger_username}</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {formatNumber(video.blogger_followers_count)} подп.
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
              {timeAgo(video.published_at)}
            </span>
          </div>

          {/* X-Factor badge — large */}
          <div style={{ marginBottom: 16 }}>
            <XFactorBadge xFactor={video.x_factor} isOutlier={video.is_outlier} size="lg" />
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
              от медианы автора ({formatNumber(Math.round(video.blogger_avg_views))} просм.)
            </span>
          </div>

          {/* Metrics grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 10,
              marginBottom: 20,
            }}
          >
            {[
              { label: 'Просмотры', value: formatNumber(video.views) },
              { label: 'Лайки', value: formatNumber(video.likes) },
              { label: 'Комменты', value: formatNumber(video.comments) },
              { label: 'Репосты', value: formatNumber(video.shares) },
              { label: 'CR%', value: `${video.comment_rate}%` },
              { label: 'Длина', value: formatDuration(video.duration) || '—' },
            ].map(({ label, value }) => (
              <div
                key={label}
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '10px',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-primary)',
                    marginBottom: 2,
                  }}
                >
                  {value}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <a
              href={video.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '9px',
                borderRadius: 7,
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                fontSize: 13,
                textDecoration: 'none',
              }}
            >
              <ExternalLink size={14} /> Открыть оригинал
            </a>
            <button
              onClick={() => favMutation.mutate()}
              style={{
                padding: '9px 14px',
                borderRadius: 7,
                border: '1px solid var(--border)',
                background: 'transparent',
                color: video.is_favorited ? '#ef4444' : 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 13,
              }}
            >
              <Heart size={14} fill={video.is_favorited ? '#ef4444' : 'none'} />
              {video.is_favorited ? 'В избранном' : 'Избранное'}
            </button>
          </div>

          {/* Analyse button */}
          {!video.is_analyzed && (
            <button
              onClick={() => analyzeMutation.mutate()}
              disabled={isAnalysing || analyzeMutation.isPending}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: 8,
                border: 'none',
                background: isAnalysing ? 'var(--bg-tertiary)' : 'var(--accent)',
                color: isAnalysing ? 'var(--text-muted)' : '#000',
                fontSize: 14,
                fontWeight: 700,
                cursor: isAnalysing ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              {isAnalysing ? (
                <>
                  <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
                  Анализирую...
                </>
              ) : (
                <>
                  <Sparkles size={15} /> Запустить анализ
                </>
              )}
            </button>
          )}
        </div>

        {/* RIGHT COLUMN — Analysis */}
        <div>
          {analysis ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Hook */}
              <Section title="Хук">
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 8,
                    background: 'rgba(229,224,0,0.06)',
                    border: '1px solid rgba(229,224,0,0.15)',
                  }}
                >
                  <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 8 }}>{analysis.hook}</p>
                  <span
                    style={{
                      fontSize: 11,
                      padding: '2px 7px',
                      borderRadius: 4,
                      background: 'rgba(229,224,0,0.12)',
                      color: 'var(--accent)',
                    }}
                  >
                    {analysis.hook_type}
                  </span>
                </div>
              </Section>

              {/* Structure */}
              {analysis.structure?.length > 0 && (
                <Section title="Структура видео">
                  <Timeline structure={analysis.structure} />
                </Section>
              )}

              {/* Why viral */}
              {analysis.why_viral?.length > 0 && (
                <Section title="Почему залетело">
                  <ol style={{ paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {analysis.why_viral.map((reason, i) => (
                      <li key={i} style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                        {reason}
                      </li>
                    ))}
                  </ol>
                </Section>
              )}

              {/* Emotion + Format */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {analysis.emotion_trigger && (
                  <div
                    style={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      padding: 12,
                    }}
                  >
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Эмоция</div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{analysis.emotion_trigger}</div>
                  </div>
                )}
                {analysis.format && (
                  <div
                    style={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      padding: 12,
                    }}
                  >
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Формат</div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{analysis.format}</div>
                  </div>
                )}
              </div>

              {/* Techniques */}
              {analysis.reusable_techniques?.length > 0 && (
                <Section title="Техники">
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {analysis.reusable_techniques.map((t) => (
                      <span
                        key={t}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 6,
                          background: 'var(--bg-tertiary)',
                          border: '1px solid var(--border)',
                          fontSize: 12,
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </Section>
              )}

              {/* Key insight */}
              {analysis.key_insight && (
                <Section title="Главный инсайт">
                  <p
                    style={{
                      fontSize: 14,
                      lineHeight: 1.6,
                      color: 'var(--text-primary)',
                      fontStyle: 'italic',
                      borderLeft: '3px solid var(--accent)',
                      paddingLeft: 12,
                    }}
                  >
                    {analysis.key_insight}
                  </p>
                </Section>
              )}

              {/* Difficulty */}
              {analysis.difficulty_to_replicate && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 12,
                    color: 'var(--text-muted)',
                  }}
                >
                  Сложность повторения:
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 12,
                      background:
                        analysis.difficulty_to_replicate === 'легко'
                          ? 'rgba(34,197,94,0.1)'
                          : analysis.difficulty_to_replicate === 'сложно'
                          ? 'rgba(239,68,68,0.1)'
                          : 'rgba(245,158,11,0.1)',
                      color:
                        analysis.difficulty_to_replicate === 'легко'
                          ? '#22c55e'
                          : analysis.difficulty_to_replicate === 'сложно'
                          ? '#ef4444'
                          : '#f59e0b',
                    }}
                  >
                    {analysis.difficulty_to_replicate}
                  </span>
                </div>
              )}

              {/* Generate script CTA */}
              <button
                onClick={() => openGenerateForm(video.id)}
                style={{
                  padding: '10px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'rgba(229,224,0,0.1)',
                  color: 'var(--accent)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  borderColor: 'rgba(229,224,0,0.2)',
                  borderWidth: 1,
                  borderStyle: 'solid',
                }}
              >
                <Sparkles size={14} /> Создать сценарий на основе этого
              </button>
            </div>
          ) : (
            <div
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '32px',
                textAlign: 'center',
                color: 'var(--text-muted)',
              }}
            >
              {isAnalysing ? (
                <div>
                  <Loader2
                    size={28}
                    style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px' }}
                    color="var(--accent)"
                  />
                  <p style={{ fontSize: 14 }}>AI анализирует видео...</p>
                  <p style={{ fontSize: 12, marginTop: 4 }}>Это займёт 15-30 секунд</p>
                </div>
              ) : (
                <div>
                  <Sparkles size={28} style={{ margin: '0 auto 12px' }} />
                  <p style={{ fontSize: 14 }}>Анализ ещё не запущен</p>
                  <p style={{ fontSize: 12, marginTop: 4 }}>Нажмите «Запустить анализ» слева</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {generateFormOpen && (
        <GenerateForm videoId={video.id} onClose={closeGenerateForm} />
      )}

      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--text-muted)',
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  )
}
