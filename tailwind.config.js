/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eefbf3',
          100: '#d6f5e1',
          200: '#b0eac7',
          300: '#7bd9a6',
          400: '#45c081',
          500: '#22a566',
          600: '#158551',
          700: '#126a43',
          800: '#115437',
          900: '#0f452f',
        },
      },
      keyframes: {
        'xp-pop': {
          '0%': { transform: 'translateY(0) scale(0.8)', opacity: '0' },
          '20%': { transform: 'translateY(-6px) scale(1.1)', opacity: '1' },
          '100%': { transform: 'translateY(-40px) scale(1)', opacity: '0' },
        },
        'tick-bounce': {
          '0%': { transform: 'scale(1)' },
          '40%': { transform: 'scale(1.25)' },
          '100%': { transform: 'scale(1)' },
        },
      },
      animation: {
        'xp-pop': 'xp-pop 900ms ease-out forwards',
        'tick-bounce': 'tick-bounce 300ms ease-out',
      },
    },
  },
  plugins: [],
};
