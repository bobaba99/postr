import { BrowserRouter } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { AppRoutes } from '@/routes';
import { FeedbackModal } from '@/components/FeedbackModal';
import { PublishFlow } from '@/components/PublishFlow';
import { SessionExpiredModal } from '@/components/SessionExpiredModal';

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
      <FeedbackModal />
      <PublishFlow />
      <SessionExpiredModal />
      <Analytics />
    </BrowserRouter>
  );
}
