import React from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import StepUpModal from './components/StepUpModal'
import Layout from './components/Layout'

import LoginPage from './pages/LoginPage'
import HomePage from './pages/HomePage'

import UsersListPage from './pages/users/UsersListPage'
import UserCreatePage from './pages/users/UserCreatePage'
import UserDetailPage from './pages/users/UserDetailPage'
import UsersAnalyticsPage from './pages/users/UsersAnalyticsPage'

import QueuePage from './pages/moderation/QueuePage'
import ContentPage from './pages/moderation/ContentPage'
import BlocklistPage from './pages/moderation/BlocklistPage'
import SoundsPage from './pages/moderation/SoundsPage'
import ReviewQueuePage from './pages/moderation/ReviewQueuePage'
import ReviewCasePage from './pages/moderation/ReviewCasePage'
import AutoModHealthPage from './pages/moderation/AutoModHealthPage'
import ModerationSettingsPage from './pages/moderation/ModerationSettingsPage'
import DatasetPage from './pages/moderation/DatasetPage'
import ModelRegistryPage from './pages/moderation/ModelRegistryPage'

import ReportsPage from './pages/safety/ReportsPage'
import ReportDetailPage from './pages/safety/ReportDetailPage'
import StrikesPage from './pages/safety/StrikesPage'
import UserRecordPage from './pages/safety/UserRecordPage'
import SafetyAnalyticsPage from './pages/safety/SafetyAnalyticsPage'

import ResearchPage from './pages/research/ResearchPage'
import QnaPage from './pages/qna/QnaPage'
import TagsPage from './pages/tags/TagsPage'
import KnowledgePage from './pages/knowledge/KnowledgePage'

import ChatPage from './pages/chat/ChatPage'
import ChannelsPage from './pages/chat/ChannelsPage'
import StreamsPage from './pages/chat/StreamsPage'
import LegalHoldsPage from './pages/chat/LegalHoldsPage'

import MediaPage from './pages/media/MediaPage'
import StoragePage from './pages/media/StoragePage'

import NotificationsPage from './pages/notifications/NotificationsPage'
import AnnouncementsPage from './pages/notifications/AnnouncementsPage'
import EmailPage from './pages/notifications/EmailPage'

import SearchOpsPage from './pages/search/SearchOpsPage'
import FeedPage from './pages/feed/FeedPage'
import SuggestionsPage from './pages/feed/SuggestionsPage'

import LogsPage from './pages/logs/LogsPage'
import AuditPage from './pages/logs/AuditPage'
import AnalyticsPage from './pages/analytics/AnalyticsPage'
import OpsPage from './pages/ops/OpsPage'
import ActivityPage from './pages/activity/ActivityPage'
import DiscoveryPage from './pages/discovery/DiscoveryPage'

function RequireAuth({ children }) {
  const { user } = useAuth()
  const loc = useLocation()
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  return children
}

function Shell() {
  return (
    <RequireAuth>
      <Layout />
    </RequireAuth>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <StepUpModal />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<Shell />}>
          <Route path="/" element={<HomePage />} />

          <Route path="/users" element={<UsersListPage />} />
          <Route path="/users/new" element={<UserCreatePage />} />
          <Route path="/users/analytics" element={<UsersAnalyticsPage />} />
          <Route path="/users/:id" element={<UserDetailPage />} />

          <Route path="/moderation" element={<QueuePage />} />
          <Route path="/moderation/content" element={<ContentPage />} />
          <Route path="/moderation/blocklist" element={<BlocklistPage />} />
          <Route path="/moderation/sounds" element={<SoundsPage />} />

          {/* automated text moderation — the classifier's own surface */}
          <Route path="/moderation/review" element={<ReviewQueuePage />} />
          <Route path="/moderation/review/:caseId" element={<ReviewCasePage />} />
          <Route path="/moderation/health" element={<AutoModHealthPage />} />
          <Route path="/moderation/settings" element={<ModerationSettingsPage />} />
          <Route path="/moderation/dataset" element={<DatasetPage />} />
          <Route path="/moderation/model" element={<ModelRegistryPage />} />

          <Route path="/safety" element={<ReportsPage />} />
          <Route path="/safety/reports/:id" element={<ReportDetailPage />} />
          <Route path="/safety/strikes" element={<StrikesPage />} />
          <Route path="/safety/record" element={<UserRecordPage />} />
          <Route path="/safety/analytics" element={<SafetyAnalyticsPage />} />

          <Route path="/research" element={<ResearchPage />} />
          <Route path="/qna" element={<QnaPage />} />
          <Route path="/tags" element={<TagsPage />} />
          <Route path="/knowledge" element={<KnowledgePage />} />

          <Route path="/chat" element={<ChatPage />} />
          <Route path="/chat/channels" element={<ChannelsPage />} />
          <Route path="/chat/streams" element={<StreamsPage />} />
          <Route path="/chat/legal-holds" element={<LegalHoldsPage />} />

          <Route path="/media" element={<MediaPage />} />
          <Route path="/media/storage" element={<StoragePage />} />

          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/notifications/announcements" element={<AnnouncementsPage />} />
          <Route path="/notifications/email" element={<EmailPage />} />

          <Route path="/search" element={<SearchOpsPage />} />
          <Route path="/feed" element={<FeedPage />} />
          <Route path="/feed/suggestions" element={<SuggestionsPage />} />

          <Route path="/logs" element={<LogsPage />} />
          <Route path="/logs/audit" element={<AuditPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/ops" element={<OpsPage />} />
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/discovery" element={<DiscoveryPage />} />

          <Route path="*" element={<div><h1>Page not found</h1><p className="muted">This page does not exist. Please pick a page from the menu on the left.</p></div>} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}
