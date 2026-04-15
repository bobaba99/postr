import { BrowserRouter } from 'react-router-dom';
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
    </BrowserRouter>
  );
}
