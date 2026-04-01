/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0f172a',
        mist: '#f6f7fb',
        sky: '#d9f1ff',
        peach: '#ffe0cc',
        mint: '#dbf7e3',
        sand: '#fff8dd',
      },
      fontFamily: {
        sans: ['"Noto Sans SC"', '"PingFang SC"', '"Microsoft YaHei"', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 20px 45px rgba(15, 23, 42, 0.08)',
      },
      backgroundImage: {
        grain:
          'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.95), transparent 30%), radial-gradient(circle at 80% 0%, rgba(217,241,255,0.85), transparent 25%), linear-gradient(135deg, rgba(255,224,204,0.55), rgba(219,247,227,0.65) 55%, rgba(255,248,221,0.9))',
      },
    },
  },
  plugins: [],
}
