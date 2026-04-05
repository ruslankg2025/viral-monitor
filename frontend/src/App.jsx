import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Bloggers from './pages/Bloggers.jsx'
import VideoDetail from './pages/VideoDetail.jsx'
import Scripts from './pages/Scripts.jsx'
import Settings from './pages/Settings.jsx'
import Toast from './components/Toast.jsx'
import ConfirmDialog from './components/ConfirmDialog.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
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
