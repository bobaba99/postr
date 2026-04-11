/**
 * Custom palette persistence. User-created palettes live in
 * localStorage alongside style presets and custom checklist templates.
 * They appear in the Style tab's palette list beneath the curated
 * catalog and travel with style presets that reference them.
 */
import type { NamedPalette } from './constants';

const STORAGE_KEY = 'postr.custom-palettes';

export function loadCustomPalettes(): NamedPalette[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as NamedPalette[];
    // Defensive — drop anything missing a name or bg field.
    return parsed.filter(
      (p): p is NamedPalette =>
        typeof p?.name === 'string' &&
        typeof p?.bg === 'string' &&
        typeof p?.primary === 'string',
    );
  } catch {
    return [];
  }
}

export function saveCustomPalettes(palettes: NamedPalette[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(palettes));
  } catch {
    // Quota / private mode — silently drop.
  }
}

/** Upsert by case-insensitive name. Returns the resulting list. */
export function upsertCustomPalette(palette: NamedPalette): NamedPalette[] {
  const current = loadCustomPalettes();
  const idx = current.findIndex(
    (p) => p.name.toLowerCase() === palette.name.toLowerCase(),
  );
  const next =
    idx >= 0
      ? current.map((p, i) => (i === idx ? palette : p))
      : [...current, palette];
  saveCustomPalettes(next);
  return next;
}

export function deleteCustomPalette(name: string): NamedPalette[] {
  const current = loadCustomPalettes();
  const next = current.filter((p) => p.name !== name);
  saveCustomPalettes(next);
  return next;
}
