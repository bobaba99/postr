/**
 * ProfileFields — optional author metadata (name, institution, ORCID…)
 * kept in localStorage and used for author auto-fill.
 */
import { useState } from 'react';
import type { User } from '@supabase/supabase-js';

// ── ProfileFields — optional metadata (name, institution, etc.) ────

const PROFILE_KEY = 'postr.profile';

interface ProfileData {
  displayName: string;
  institution: string;
  department: string;
  orcid: string;
  website: string;
}

function loadProfile(): ProfileData {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? { ...defaultProfile(), ...JSON.parse(raw) } : defaultProfile();
  } catch {
    return defaultProfile();
  }
}

function defaultProfile(): ProfileData {
  return { displayName: '', institution: '', department: '', orcid: '', website: '' };
}

export function ProfileFields({ user, onStatusMessage }: { user: User | null; onStatusMessage: (msg: string) => void }) {
  const [profile, setProfile] = useState<ProfileData>(loadProfile);
  const [dirty, setDirty] = useState(false);

  const update = (field: keyof ProfileData, value: string) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
    setDirty(true);
  };

  const save = () => {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    setDirty(false);
    onStatusMessage('Profile saved.');
  };

  const fieldRow = (label: string, field: keyof ProfileData, placeholder: string, hint?: string) => (
    <div className="mb-3">
      <label htmlFor={`profile-${field}`} className="block text-sm text-[#9ca3af] mb-1">{label}</label>
      <input
        id={`profile-${field}`}
        value={profile[field]}
        onChange={(e) => update(field, e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-[#2a2a3a] bg-[#1a1a26] px-4 py-2.5 text-sm text-[#e2e2e8] outline-none focus:border-[#7c6aed] placeholder:text-[#8b8f99]"
      />
      {hint && <div className="text-[13px] text-[#8b8f99] mt-1">{hint}</div>}
    </div>
  );

  return (
    <div>
      {fieldRow('Display name', 'displayName', 'e.g. Dr. Jane Smith', 'Used for author auto-fill')}
      {fieldRow('Institution', 'institution', 'e.g. Acme State University')}
      {fieldRow('Department', 'department', 'e.g. Department of Psychology')}
      {fieldRow('ORCID', 'orcid', 'e.g. 0000-0002-1234-5678', 'Optional — links to your ORCID profile')}
      {fieldRow('Website / Lab page', 'website', 'e.g. https://lab.example.com')}
      <button
        onClick={save}
        disabled={!dirty}
        className={`mt-2 ${dirty ? 'cursor-pointer rounded-md bg-[#5641b8] px-4 py-2 text-sm font-medium text-white hover:bg-[#4c39a6]' : 'cursor-not-allowed rounded-md bg-[#2d6a4f] px-4 py-2 text-sm font-medium text-white opacity-80'}`}
      >
        {dirty ? 'Save profile' : '✓ Saved'}
      </button>
    </div>
  );
}
