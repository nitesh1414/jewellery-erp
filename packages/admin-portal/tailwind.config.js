/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fff4e6',
          100: '#ffe8cc',
          200: '#ffd8a8',
          300: '#ffc078',
          400: '#ffa94d',
          500: '#ff922b',
          600: '#f76707',
          700: '#e8590c',
          800: '#d9480f',
          900: '#c92a2a',
        },
      },
    },
  },
  plugins: [],
};
