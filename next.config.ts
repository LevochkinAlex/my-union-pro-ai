require('dotenv').config({ path: './.env.local' });

const { withSentryConfig } = require('@sentry/nextjs');

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
  // Исключаем Prisma из клиентского бандла (перемещено из experimental в Next.js 16)
  serverExternalPackages: ['@prisma/client', 'prisma'],
  // Исключаем Prisma из webpack бандла
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
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
        hostname: 'cdn.myunion.pro', // Selectel CDN
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
  },
  {
    // For all available options, see:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

    // Upload a larger set of source maps for prettier stack traces (increases build time)
    widenClientFileUpload: true,

    // Transpiles SDK to be compatible with IE11 (increases bundle size)
    transpileClientSDK: true,

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
