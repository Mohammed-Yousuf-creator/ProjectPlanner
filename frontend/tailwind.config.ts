/**
 * Design tokens translated to named Tailwind utilities.
 * Every hex value comes from DESIGN_SYSTEM.md Section 2 - do not add new colours
 * here. The only permitted addition is the error/danger ramp (Tailwind's stock
 * red-50 / red-200 / red-800), documented in PLAN.md Section 1.5.
 */
import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#FAF7F2',
        'canvas-2': '#F8F5F0',
        fill: '#F4EFEA',
        surface: '#FFFFFF',
        line: '#E7DFD5',
        'line-subtle': '#F0EAE1',
        ink: '#1F1916',
        taupe: '#73645A',
        muted: '#8A7A70',
        forest: '#2F5B3C',
        'forest-dark': '#23452D',
        rust: '#943C1D',
        'obsidian-hover': '#332A25',
        'hover-stone': '#EFE9DF',
        'selection-tint': '#EBDDCF',
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in': {
          from: { opacity: '0', transform: 'translateX(12px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'slide-in': 'slide-in 180ms ease-out',
      },
    },
  },
  plugins: [],
} satisfies Config;
