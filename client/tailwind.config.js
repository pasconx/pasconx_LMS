/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#f0f7ff',
          100: '#e0effe',
          200: '#bae0fd',
          300: '#7cc7fb',
          400: '#36abf6',
          500: '#0c8ee7',
          600: '#006ec5',
          700: '#01579f',
          800: '#064b82',
          900: '#0b3f6c',
          950: '#072847',
        },
        edtech: {
          cyan: '#06b6d4',
          turquoise: '#22d3ee',
          violet: '#7c3aed',
          purple: '#8b5cf6',
          lavender: '#c084fc',
          sky: '#38bdf8',
          deepBlue: '#1e40af',
        }
      }
    },
  },
  plugins: [],
}
