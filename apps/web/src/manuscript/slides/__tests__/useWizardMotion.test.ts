import { renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { describe, it, expect, vi } from 'vitest';
import gsap from 'gsap';
import { useWizardMotion } from '../useWizardMotion';

describe('useWizardMotion', () => {
  it('does not call gsap when reducedMotion is true', () => {
    const spy = vi.spyOn(gsap, 'fromTo');
    const { result } = renderHook(() => {
      const ref = useRef<HTMLDivElement>(document.createElement('div'));
      return useWizardMotion(ref, { reducedMotion: true });
    });
    result.current.animateStepIn(document.createElement('div'));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
