import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from '@/routes';
import { FeedbackModal } from '@/components/FeedbackModal';
import { PublishFlow } from '@/components/PublishFlow';

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
      <FeedbackModal />
      <PublishFlow />
    </BrowserRouter>
  );
}
