import React, { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import Layout from './components/Layout.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Bloggers from './pages/Bloggers.jsx'
import VideoDetail from './pages/VideoDetail.jsx'
import Scripts from './pages/Scripts.jsx'
import Settings from './pages/Settings.jsx'
import AnalyzePage from './pages/AnalyzePage.jsx'
import AnalyzeResult from './pages/AnalyzeResult.jsx'
import MyVideos from './pages/MyVideos.jsx'
import Auth from './pages/Auth.jsx'
import AccountProfile from './pages/AccountProfile.jsx'
import Toast from './components/Toast.jsx'
import ConfirmDialog from './components/ConfirmDialog.jsx'
import Onboarding from './components/Onboarding.jsx'
import { api } from './api.js'
import { useStore } from './store.js'

const ONBOARDING_DONE_KEY = 'onboarding_done'

function AppInner() {
  const [onboardingDismissed, setOnboardingDismissed] = useState(
    () => localStorage.getItem(ONBOARDING_DONE_KEY) === 'true'
  )

  const { currentToken, setAccount, logout } = useStore()

  // Validate token on mount
  const { data: accountData, error: accountError, isLoading: accountLoading } = useQuery({
    queryKey: ['accounts-me'],
    queryFn: api.accounts.me,
    enabled: !!currentToken,
    staleTime: 60_000,
    retry: false,
  })

  // Store validated account in Zustand
  useEffect(() => {
    if (accountData) {
      setAccount(accountData)
    }
  }, [accountData, setAccount])

  // If token validation failed with 401, logout is handled in api.js interceptor
  // But if there's another error and no token, just show auth
  const { data: providersStatus, isLoading: providersLoading } = useQuery({
    queryKey: ['providers-status'],
    queryFn: api.settings.providersStatus,
    staleTime: 30_000,
    retry: false,
    enabled: !!currentToken && !!accountData,
  })

  const handleOnboardingComplete = () => {
    localStorage.setItem(ONBOARDING_DONE_KEY, 'true')
    setOnboardingDismissed(true)
  }

  // If no token → show Auth page
  if (!currentToken) {
    return (
      <>
        <Auth />
        <Toast />
      </>
    )
  }

  // Still validating token
  if (accountLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-primary)',
          color: 'var(--text-muted)',
          fontSize: 14,
        }}
      >
        Загрузка...
      </div>
    )
  }

  // Token invalid (account fetch error) — logout handled in api.js, re-render will show Auth
  if (accountError && !accountData) {
    return (
      <>
        <Auth />
        <Toast />
      </>
    )
  }

  // Show onboarding if: no keys configured AND user hasn't dismissed it before
  const showOnboarding =
    !onboardingDismissed &&
    !providersLoading &&
    providersStatus &&
    !providersStatus.any_ai_ready

  return (
    <>
      {showOnboarding && <Onboarding onComplete={handleOnboardingComplete} />}
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/analyze" replace />} />
          <Route path="analyze" element={<AnalyzePage />} />
          <Route path="analyze/:id" element={<AnalyzeResult />} />
          <Route path="my-videos" element={<MyVideos />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="bloggers" element={<Bloggers />} />
          <Route path="video/:id" element={<VideoDetail />} />
          <Route path="scripts" element={<Scripts />} />
          <Route path="profile" element={<AccountProfile />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInner />
      <Toast />
      <ConfirmDialog />
    </BrowserRouter>
  )
}
