/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#faf8f5',
          100: '#f2ede4',
          200: '#e4d9c4',
          300: '#d4c0a0',
          400: '#c4a77c',
          500: '#b8945e',
          600: '#a77d4a',
          700: '#8b653e',
          800: '#735337',
          900: '#5e4631',
        },
        primary: {
          50: '#f0f4ff',
          100: '#dbe4ff',
          200: '#bac8ff',
          300: '#91a7ff',
          400: '#748ffc',
          500: '#5c7cfa',
          600: '#4c6ef5',
          700: '#4263eb',
          800: '#3b5bdb',
          900: '#364fc7',
        },
      },
    },
  },
  plugins: [],
};