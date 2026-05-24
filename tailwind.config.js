/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#EDF4FC',
          100: '#D6E8F7',
          500: '#2D7DD2',
          700: '#1A5FA8',
          900: '#0D2B4E',
        },
        accent: {
          100: '#FFF0DD',
          500: '#B85C00',
        },
        success: {
          100: '#E4F4EB',
          500: '#1B6B3A',
        },
        danger: {
          100: '#FDEAEA',
          500: '#8B1A1A',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
