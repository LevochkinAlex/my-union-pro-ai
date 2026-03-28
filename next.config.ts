require('dotenv').config({ path: './.env.local' });

const { withSentryConfig } = require('@sentry/nextjs');

const packageJson = require('./package.json');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  // Исключаем серверные пакеты из клиентского бандла
  serverExternalPackages: [
    '@prisma/client', 
    'prisma',
    'sharp',
    'puppeteer',
    'pdfkit',
    'mammoth',
    'pdf-parse',
    'exceljs',
    'nodemailer',
    'firebase-admin',
    'bullmq',
    'ioredis',
    '@socket.io/redis-adapter',
    'socket.io',
  ],
  // Оптимизация webpack
  webpack: (config, { isServer }) => {
    // Исключаем подпроекты из компиляции
    config.watchOptions = {
      ...config.watchOptions,
      ignored: [
        '**/node_modules/**',
        '**/trade-union-survey-system/**',
        '**/profreport-main/**',
      ],
    };
    
    // Исключаем server/socket.ts из сборки (используется только в runtime)
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({
        '@/server/socket': 'commonjs @/server/socket',
      });
    }
    
    if (!isServer) {
      // Исключаем серверные модули из клиентского бандла
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        child_process: false,
        dns: false,
      };
    }
    return config;
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
        hostname: 'cdn.myunion.pro', // VK Cloud CDN
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
        protocol: 'https',
        hostname: 'avatars.yandex.net',
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

// Обертываем конфигурацию в withSentryConfig для интеграции Sentry
module.exports = withSentryConfig(
  nextConfig,
  {
    // For all available options, see:
    // https://github.com/getsentry/sentry-webpack-plugin#options

    // Suppresses source map uploading logs during build
    silent: true,
    org: "yappix-llc-vk",
    project: "javascript-nextjs",
    // Отключаем автоматическую загрузку source maps во время сборки (может вызывать проблемы с Turbopack)
    disable: process.env.SKIP_SENTRY_BUILD === 'true',
  },
  {
    // For all available options, see:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

    // Upload a larger set of source maps for prettier stack traces (increases build time)
    widenClientFileUpload: true,

    // НЕ транспилируем для IE11 - уменьшает размер бандла
    transpileClientSDK: false,

    // Routes browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
    // This can increase your server load as well as your hosting bill.
    // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
    // side errors will fail.
    tunnelRoute: "/monitoring",

    // Hides source maps from generated client bundles
    hideSourceMaps: true,

    // Automatically tree-shake Sentry logger statements to reduce bundle size
    disableLogger: true,

    // Enables automatic instrumentation of Vercel Cron Monitors.
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,
  }
);
