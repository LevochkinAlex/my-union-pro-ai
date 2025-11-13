import localFont from 'next/font/local'

// Используем переменный шрифт Onest для всех начертаний
export const onest = localFont({
  src: '../public/fonts/Onest-Variable.woff2',
  variable: '--font-onest',
  weight: '100 900',
  display: 'swap',
})

