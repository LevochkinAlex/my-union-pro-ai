require('dotenv').config({ path: './.env.local' });

const packageJson = require('./package.json');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
  },
  // Увеличиваем лимит размера тела запроса для загрузки файлов до 50MB (для HEIC)
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.jsdelivr.net',
      },
      {
        protocol: 'https',
        hostname: 'bestbenefits.ru',
      },
      {
        protocol: 'https',
        hostname: 'myunion.pro',
      },
      {
        protocol: 'https',
        hostname: 'dnznrvs05pmza.cloudfront.net', // RunwayML CDN
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
      },
      {
        protocol: 'https',
        hostname: 'dnznrvs05pmza.cloudfront.net', // RunwayML CDN
      },
    ],
    // Разрешаем data URLs и blob URLs для загруженных изображений
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    // Оптимизация изображений
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60,
    // Увеличиваем лимит для base64 изображений
    unoptimized: false,
  },
};

module.exports = nextConfig;
