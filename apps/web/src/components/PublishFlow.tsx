/**
 * PublishFlow — mounts the two publish modals at the app root and
 * wires them to usePublishFlowStore.
 *
 * The flow is:
 *   openForPoster / openForUpload → step = 'consent'
 *     PublishConsentModal shown
 *     onConfirm → advanceToMetadata → step = 'metadata'
 *       PublishGalleryModal shown
 *       onSuccess(entryId) → close + navigate('/gallery/:id')
 *       onCancel → close
 *     onCancel → close
 */
import { useNavigate } from 'react-router-dom';
import { PublishConsentModal } from '@/components/PublishConsentModal';
import { PublishGalleryModal } from '@/components/PublishGalleryModal';
import { usePublishFlowStore } from '@/stores/publishFlowStore';

export function PublishFlow() {
  const navigate = useNavigate();
  const step = usePublishFlowStore((s) => s.step);
  const posterId = usePublishFlowStore((s) => s.posterId);
  const posterTitle = usePublishFlowStore((s) => s.posterTitle);
  const advanceToMetadata = usePublishFlowStore((s) => s.advanceToMetadata);
  const close = usePublishFlowStore((s) => s.close);

  return (
    <>
      <PublishConsentModal
        open={step === 'consent'}
        mode="publish"
        posterTitle={posterTitle ?? undefined}
        onConfirm={advanceToMetadata}
        onCancel={close}
      />
      <PublishGalleryModal
        open={step === 'metadata'}
        posterId={posterId}
        defaultTitle={posterTitle ?? undefined}
        onSuccess={(entryId) => {
          close();
          navigate(`/gallery/${entryId}`);
        }}
        onCancel={close}
      />
    </>
  );
}
