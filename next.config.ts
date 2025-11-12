import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/,
      use: ["@svgr/webpack"],
    });
    return config;
  },
  // Пустой конфиг Turbopack для подавления предупреждения
  turbopack: {},
};

export default nextConfig;
