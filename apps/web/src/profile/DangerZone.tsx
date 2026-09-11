/**
 * Danger Zone — the destructive actions block on the Profile page, plus
 * the copy for its confirmation modal. When a paid term is active the
 * account-deletion row says so explicitly: the API cancels the CA$18.99
 * term (and any add-on) immediately as part of deletion (P0-3).
 */
import { Section } from './ProfileChrome';
import { btnDanger } from './styles';

export const TERM_CANCEL_LINE =
  'This also cancels your CA$18.99 term and any add-on immediately.';

/** The confirmation phrase the user must type before deleting the account. */
export const DELETE_ACCOUNT_PHRASE = 'I confirm the deletion of my account';

export function deleteAccountDescription(hasActiveTerm: boolean): string {
  const base =
    'Permanently delete your account and all associated data. You will be signed out.';
  return hasActiveTerm ? `${base} ${TERM_CANCEL_LINE}` : base;
}

export function deleteAccountConfirmMessage(hasActiveTerm: boolean): string {
  const base =
    'This will permanently delete your account, all posters, and all preferences. You will be signed out. This action cannot be undone.';
  return hasActiveTerm ? `${base} ${TERM_CANCEL_LINE}` : base;
}

export function DangerZone({
  posterCount,
  hasActiveTerm,
  onDeletePosters,
  onDeleteAccount,
}: {
  posterCount: number;
  hasActiveTerm: boolean;
  onDeletePosters: () => void;
  onDeleteAccount: () => void;
}) {
  return (
    <Section title="Danger Zone" danger>
      <div className="space-y-4">
        <DangerAction
          title="Delete all posters"
          description={`Permanently delete all ${posterCount} poster(s). This cannot be undone.`}
          buttonText="Delete all posters"
          onClick={onDeletePosters}
          disabled={posterCount === 0}
        />
        <div className="border-t border-[#2a2a3a]" />
        <DangerAction
          title="Delete account"
          description={deleteAccountDescription(hasActiveTerm)}
          buttonText="Delete account"
          onClick={onDeleteAccount}
        />
      </div>
    </Section>
  );
}

function DangerAction({
  title,
  description,
  buttonText,
  onClick,
  disabled,
}: {
  title: string;
  description: string;
  buttonText: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-[14pt] font-medium text-[#c8cad0]">{title}</div>
        <div className="text-[14pt] text-[#8b8f99] mt-1">{description}</div>
      </div>
      <button onClick={onClick} disabled={disabled} className={btnDanger}>
        {buttonText}
      </button>
    </div>
  );
}
