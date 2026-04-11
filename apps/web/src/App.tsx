import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from '@/routes';
import { FeedbackModal } from '@/components/FeedbackModal';

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
      <FeedbackModal />
    </BrowserRouter>
  );
}
