/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        manrope: ['Manrope', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
      },
      colors: {
        'accent-blue': '#2563eb',
      },
      animation: {
        'fade-up': 'fadeUp 0.8s ease-out forwards',
        'border-spin': 'borderSpin 2.5s linear infinite',
        'ping-slow': 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite',
        'spin-slow': 'spin 3s linear infinite',
        'marquee': 'marquee 30s linear infinite',
      },
      keyframes: {
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        borderSpin: {
          from: { '--gradient-angle': '0deg' },
          to: { '--gradient-angle': '360deg' },
        },
        marquee: {
          from: { transform: 'translateX(0%)' },
          to: { transform: 'translateX(-50%)' },
        },
      },
    },
  },
  plugins: [],
}
