import { Navigate, Route, Routes } from 'react-router-dom';
import FeedbackPage from './pages/FeedbackPage.jsx';
import PrizePortal from './pages/PrizePortal.jsx';
import AdminLogin from './pages/admin/AdminLogin.jsx';
import AdminLayout from './pages/admin/AdminLayout.jsx';
import FeedbackDashboard from './pages/admin/FeedbackDashboard.jsx';
import SubmissionDetail from './pages/admin/SubmissionDetail.jsx';
import QuestionsPage from './pages/admin/QuestionsPage.jsx';
import AttributesPage from './pages/admin/AttributesPage.jsx';
import WinnersPage from './pages/admin/WinnersPage.jsx';
import PrizesPage from './pages/admin/PrizesPage.jsx';
import SettingsPage from './pages/admin/SettingsPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<FeedbackPage />} />
      <Route path="/prize/:token" element={<PrizePortal />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Navigate to="feedback" replace />} />
        <Route path="feedback" element={<FeedbackDashboard />} />
        <Route path="feedback/:id" element={<SubmissionDetail />} />
        <Route path="questions" element={<QuestionsPage />} />
        <Route path="ratings" element={<AttributesPage />} />
        <Route path="winners" element={<WinnersPage />} />
        <Route path="prizes" element={<PrizesPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
