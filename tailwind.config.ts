import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';
import { colors, dropShadows, fonts, radii, shadows, sizes, seniorTextScale } from './src/design/tokens';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors,
      fontFamily: { display: [...fonts.display], body: [...fonts.body] },
      borderRadius: radii,
      boxShadow: shadows,
      dropShadow: dropShadows,
      maxWidth: { app: sizes.appWidth },
      minHeight: { tap: 'var(--tap)' },
      height: { tap: 'var(--tap)', nav: sizes.nav },
      minWidth: { tap: 'var(--tap)' },
      width: { tap: 'var(--tap)' },
      spacing: { gutter: sizes.gutter, nav: sizes.nav },
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      addBase({
        ':root': { '--tap': sizes.tap },
        // Senior mode: 1.25x text (rem-based) and 56px buttons
        'html[data-senior="true"]': {
          '--tap': sizes.tapSenior,
          fontSize: `${seniorTextScale * 100}%`,
        },
      });
    }),
  ],
} satisfies Config;
