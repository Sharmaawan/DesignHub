/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canva: {
          purple: '#7B2FBE',
          'purple-dark': '#6025A0',
          'purple-light': '#9B5FD6',
          blue: '#00C4CC',
          pink: '#FF6B9D',
          orange: '#FF8A00',
          dark: {
            bg: '#1B1B2F',
            surface: '#242440',
            border: '#3A3A5C',
            text: '#E8E8F0',
          },
          light: {
            bg: '#F7F7F8',
            surface: '#FFFFFF',
            border: '#E5E5E5',
            text: '#1B1B2F',
          },
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'canva': '0 2px 8px rgba(0, 0, 0, 0.08)',
        'canva-lg': '0 4px 16px rgba(0, 0, 0, 0.12)',
        'canva-xl': '0 8px 32px rgba(0, 0, 0, 0.16)',
        'editor': '0 1px 3px rgba(0, 0, 0, 0.1)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'slide-left': 'slideLeft 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'spin-slow': 'spin 2s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideLeft: {
          '0%': { transform: 'translateX(10px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
