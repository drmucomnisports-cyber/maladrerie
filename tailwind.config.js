/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'muc-blue': '#004B93',
        'muc-yellow': '#FFD700',
        'white': '#FFFFFF',
        'steel-gray': '#333333',
      },
      fontFamily: {
        sans: ['Outfit', 'sans-serif'],
        serif: ['"Playfair Display"', 'serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
}
