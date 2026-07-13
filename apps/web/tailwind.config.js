/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Motion tokens mirror the CSS custom properties defined in
      // index.css :root — the CSS vars stay the single source of truth,
      // and these keys just expose them to Tailwind so JSX can write
      // `ease-smooth duration-base` instead of an inline cubic-bezier.
      transitionTimingFunction: {
        smooth: 'var(--ease-out)', // entering / exiting UI
        'in-out-strong': 'var(--ease-in-out)', // movement on screen
        drawer: 'var(--ease-drawer)', // sheets & drawers
        back: 'var(--ease-back)', // subtle overshoot
        standard: 'var(--ease-standard)', // neutral in-out
      },
      transitionDuration: {
        press: '120ms',
        fast: '160ms',
        base: '220ms',
        slow: '280ms',
      },
    },
  },
  plugins: [],
};
