/**
 * Компонент для рендеринга иконок с поддержкой CDN
 * Используется в layout.tsx для динамической генерации иконок
 */

import { getIconUrl } from "@/lib/cdn";

export function IconsHead() {
  const cdnUrl = process.env.NEXT_PUBLIC_CDN_URL;
  const useCDN = !!cdnUrl;

  // Список иконок
  const icons = [
    { rel: "icon", href: "/favicon.ico", sizes: "any" },
    { rel: "icon", href: "/icon.png", sizes: "any" },
    { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16x16.png" },
    { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32x32.png" },
    { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192x192.png" },
    { rel: "icon", type: "image/png", sizes: "512x512", href: "/icon-512x512.png" },
  ];

  const appleIcons = [
    { rel: "apple-touch-icon", sizes: "180x180", type: "image/png", href: "/apple-touch-icon.png" },
  ];

  return (
    <>
      {/* Favicon и иконки для всех браузеров */}
      {icons.map((icon, index) => (
        <link
          key={`icon-${index}`}
          rel={icon.rel}
          href={getIconUrl(icon.href, useCDN)}
          {...(icon.type && { type: icon.type })}
          {...(icon.sizes && { sizes: icon.sizes })}
        />
      ))}

      {/* Apple Touch Icon (явный элемент для Safari/iOS и проверок доступности) */}
      <link
        rel="apple-touch-icon"
        sizes="180x180"
        type="image/png"
        href={getIconUrl("/apple-touch-icon.png", useCDN)}
      />
      {appleIcons.map((icon, index) => (
        <link
          key={`apple-${index}`}
          rel={icon.rel}
          href={getIconUrl(icon.href, useCDN)}
          sizes={icon.sizes}
          type={icon.type}
        />
      ))}

      {/* Manifest */}
      {/* manifest.json должен быть локальным (не через CDN) из-за CORS */}
      <link rel="manifest" href="/manifest.json" />

      {/* Meta теги (theme-color поддерживается Chrome/Edge/Safari, в Firefox — ограниченно) */}
      <meta name="theme-color" content="#3b82f6" />
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      <meta name="apple-mobile-web-app-title" content="MyUnion Pro" />
    </>
  );
}

