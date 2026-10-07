import { Analytics } from '@vercel/analytics/react';
import { BrowserRouter } from 'react-router';
import { AppRoutes } from '@/routes';
import { FeedbackModal } from '@/components/FeedbackModal';
import { PublishFlow } from '@/components/PublishFlow';
import { SessionExpiredModal } from '@/components/SessionExpiredModal';
import { RouteScrollManager } from '@/components/RouteScrollManager';
import { MobileNotice } from '@/components/MobileNotice';
import { redactUrl } from '@/analytics/redactUrl';
import { globalPrivacyControlOn } from '@/analytics/globalPrivacyControl';

export default function App() {
  return (
    <BrowserRouter>
      <RouteScrollManager />
      {/* Phone-width strip on every route: Postr is a desktop tool. */}
      <MobileNotice />
      <AppRoutes />
      <FeedbackModal />
      <PublishFlow />
      <SessionExpiredModal />
      {/*
        Vercel Web Analytics — cookieless by design: no cookies, no
        localStorage, no cross-site identifier. Visitors are a hash of
        the incoming request, discarded after 24 hours, and every data
        point is aggregated. That is why it is compatible with the
        promise on /cookies; a tool that stores nothing on the device
        needs no consent banner under ePrivacy Art. 5(3).

        `beforeSend` is the privacy boundary, not a nicety: Vercel
        records the URL of every page view, and /s/:slug is a share
        link to unpublished research where the slug IS the capability.
        See analytics/redactUrl.ts.

        Not mounted at all when the browser sends Global Privacy Control
        (analytics/globalPrivacyControl.ts): no script, no beacon. The
        Privacy and Cookies policies say so.
      */}
      {!globalPrivacyControlOn() && (
        <Analytics beforeSend={(event) => ({ ...event, url: redactUrl(event.url) })} />
      )}
    </BrowserRouter>
  );
}
