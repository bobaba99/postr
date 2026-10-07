/**
 * PasswordStrength — inline password strength checker + requirements.
 *
 * Enforces: uppercase, lowercase, number, symbol, min 8 chars.
 * Shows a color-coded progress bar labelled "N of 5 met" + individual
 * requirement checks. It measures rule compliance, not entropy.
 *
 * In French on /auth/fr (fix 26): the labels are in i18n/auth.ts. The
 * profile's guest conversion card is English and passes no language.
 */
import { AUTH_COPY, type AuthCopy } from '@/i18n/auth';
import type { Lang } from '@/i18n/lang';

interface Rule {
  key: keyof AuthCopy['passwordRules'];
  test: (pw: string) => boolean;
}

const RULES: Rule[] = [
  { key: 'length', test: (pw) => pw.length >= 8 },
  { key: 'upper', test: (pw) => /[A-Z]/.test(pw) },
  { key: 'lower', test: (pw) => /[a-z]/.test(pw) },
  { key: 'digit', test: (pw) => /\d/.test(pw) },
  { key: 'symbol', test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

export function isPasswordValid(password: string): boolean {
  return RULES.every((r) => r.test(password));
}

export function PasswordStrength({ password, lang = 'en' }: { password: string; lang?: Lang }) {
  if (!password) return null;
  const c = AUTH_COPY[lang];

  const passed = RULES.filter((r) => r.test(password)).length;
  const total = RULES.length;
  const pct = (passed / total) * 100;

  const barColor =
    passed <= 1 ? '#f87171' :
    passed <= 2 ? '#f97316' :
    passed <= 3 ? '#f9e2af' :
    passed <= 4 ? '#89b4fa' : '#a6e3a1';

  // A count of rules met, not a strength rating: the meter checks the five
  // rules only (nothing past the 8-character minimum, no common-password
  // list), so a word like "Password1!" meets all five. Naming it "Strong"
  // or "Excellent" claimed a strength the check does not measure.
  const strengthLabel = c.passwordMet(passed, total);

  return (
    <div style={{ marginTop: 6 }}>
      {/* Strength bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{ flex: 1, height: 4, background: '#2a2a3a', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 2, transition: 'width 0.2s, background 0.2s' }} />
        </div>
        <span style={{ fontSize: 13, color: barColor, fontWeight: 600, minWidth: 65 }}>{strengthLabel}</span>
      </div>

      {/* Requirements checklist */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {RULES.map((rule) => {
          const ok = rule.test(password);
          return (
            <div key={rule.key} style={{ fontSize: 13, color: ok ? '#a6e3a1' : '#555', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11 }}>{ok ? '✓' : '○'}</span>
              {c.passwordRules[rule.key]}
            </div>
          );
        })}
      </div>
    </div>
  );
}
