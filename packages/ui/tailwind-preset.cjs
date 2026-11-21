/** VTL design tokens as a Tailwind preset. Colours reference CSS variables from tokens.css, so hex is defined once. */
const v = (name) => `rgb(var(--${name}-rgb) / <alpha-value>)`;
module.exports = {
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: v('vtl-navy'), 700: v('vtl-navy-700'), 600: v('vtl-navy-600'), 50: v('vtl-navy-50') },
        orange: { DEFAULT: v('vtl-orange'), 600: v('vtl-orange-600'), 700: v('vtl-orange-700'), 50: v('vtl-orange-50') },
        surface: v('vtl-surface'),
        border: v('vtl-border'),
        ink: { DEFAULT: v('vtl-navy'), muted: v('vtl-ink-muted') },
        success: { DEFAULT: v('success'), 50: v('success-50'), 700: v('success-700') },
        warning: { DEFAULT: v('warning'), 50: v('warning-50'), 700: v('warning-700') },
        danger: { DEFAULT: v('danger'), 50: v('danger-50'), 700: v('danger-700') },
        info: { DEFAULT: v('info'), 50: v('info-50'), 700: v('info-700') },
      },
      fontFamily: {
        heading: ['"Plus Jakarta Sans"', '"Noto Sans Devanagari"', 'system-ui', 'sans-serif'],
        sans: ['Inter', '"Noto Sans Devanagari"', 'system-ui', 'sans-serif'],
        hindi: ['"Noto Sans Devanagari"', 'Inter', 'sans-serif'],
      },
      borderRadius: { DEFAULT: '8px', card: '8px', input: '8px' },
      boxShadow: {
        card: '0 1px 2px rgb(7 16 45 / 0.06), 0 1px 3px rgb(7 16 45 / 0.08)',
        raised: '0 4px 12px rgb(7 16 45 / 0.10)',
      },
      ringColor: { DEFAULT: v('vtl-orange') },
      spacing: { 18: '4.5rem' },
    },
  },
};
