import React, { useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { api } from '../api.js'
import { useStore } from '../store.js'
import FilterBar from '../components/FilterBar.jsx'
import VideoCard from '../components/VideoCard.jsx'
import StatsBar from '../components/StatsBar.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { VideoCardSkeleton } from '../components/Skeleton.jsx'
import { LayoutGrid, RefreshCw } from 'lucide-react'

export default function Dashboard() {
  const filters = useStore((s) => s.filters)

  // Build query params from filters
  const queryParams = {
    sort: filters.sort,
    per_page: 30,
    ...(filters.tab === 'outliers' && { outliers_only: 'true' }),
    ...(filters.tab === 'favorited' && { favorited_only: 'true' }),
    ...(filters.platform && { platform: filters.platform }),
    ...(filters.period && { period: filters.period }),
  }

  const {
    data,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['videos', queryParams],
    queryFn: ({ pageParam = 1 }) => api.videos.list({ ...queryParams, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const nextPage = lastPage.page + 1
      return nextPage <= lastPage.pages ? nextPage : undefined
    },
  })

  const allVideos = data?.pages.flatMap((p) => p.items) ?? []
  const total = data?.pages[0]?.total ?? 0

  return (
    <div>
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 2 }}>Тренды</h1>
          {!isLoading && (
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {total} видео
            </p>
          )}
        </div>
        <StatsBar />
      </div>

      {/* Filters */}
      <div style={{ marginBottom: 20 }}>
        <FilterBar />
      </div>

      {/* Error */}
      {isError && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 8,
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.2)',
            color: '#f87171',
            fontSize: 13,
            marginBottom: 16,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>Ошибка загрузки: {error.message}</span>
          <button
            onClick={() => refetch()}
            style={{
              background: 'none',
              border: 'none',
              color: '#f87171',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 12,
            }}
          >
            <RefreshCw size={12} /> Повторить
          </button>
        </div>
      )}

      {/* Grid */}
      {isLoading ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 16,
          }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <VideoCardSkeleton key={i} />
          ))}
        </div>
      ) : allVideos.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title="Видео не найдены"
          description={
            filters.tab === 'outliers'
              ? 'Нет вирусных видео за выбранный период'
              : filters.tab === 'favorited'
              ? 'Добавьте видео в избранное'
              : 'Добавьте блогеров для начала мониторинга'
          }
        />
      ) : (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: 16,
              marginBottom: 24,
            }}
          >
            {allVideos.map((video) => (
              <VideoCard key={video.id} video={video} />
            ))}
          </div>

          {/* Load more */}
          {hasNextPage && (
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                style={{
                  padding: '9px 24px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                {isFetchingNextPage ? 'Загрузка...' : 'Загрузить ещё'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
