import React, { useState } from 'react'
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
import Toast from './components/Toast.jsx'
import ConfirmDialog from './components/ConfirmDialog.jsx'
import Onboarding from './components/Onboarding.jsx'
import { api } from './api.js'

const ONBOARDING_DONE_KEY = 'onboarding_done'

export default function App() {
  const [onboardingDismissed, setOnboardingDismissed] = useState(
    () => localStorage.getItem(ONBOARDING_DONE_KEY) === 'true'
  )

  const { data: providersStatus, isLoading } = useQuery({
    queryKey: ['providers-status'],
    queryFn: api.settings.providersStatus,
    staleTime: 30_000,
    retry: false,
  })

  const handleOnboardingComplete = () => {
    localStorage.setItem(ONBOARDING_DONE_KEY, 'true')
    setOnboardingDismissed(true)
  }

  // Show onboarding if: no keys configured AND user hasn't dismissed it before
  const showOnboarding =
    !onboardingDismissed &&
    !isLoading &&
    providersStatus &&
    !providersStatus.any_ai_ready

  return (
    <BrowserRouter>
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
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
      <Toast />
      <ConfirmDialog />
    </BrowserRouter>
  )
}
