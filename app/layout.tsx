import { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { IconsHead } from "@/components/IconsHead";
import { getIconUrl } from "@/lib/cdn";

// Получаем CDN URL для иконок
const cdnUrl = process.env.NEXT_PUBLIC_CDN_URL;
const useCDN = !!cdnUrl;

export const metadata: Metadata = {
  title: "MyUnion Pro — единая панель управления профсоюзом",
  description: "Современная AI-платформа для управления профсоюзом. Автоматизация документооборота, управление членами, обработка обращений. До 80% автоматизации рутинных задач.",
  keywords: ["профсоюз", "управление профсоюзом", "AI", "автоматизация", "документооборот", "MyUnion"],
  authors: [{ name: "MyUnion Pro" }],
  openGraph: {
    title: "MyUnion Pro — единая панель управления профсоюзом",
    description: "Современная AI-платформа для управления профсоюзом",
    url: "https://myunion.pro",
    siteName: "MyUnion Pro",
    locale: "ru_RU",
    type: "website",
  },
  icons: {
    icon: [
      { url: getIconUrl("/favicon.ico", useCDN), sizes: "any" },
      { url: getIconUrl("/icon.png", useCDN), sizes: "any" },
      { url: getIconUrl("/favicon-16x16.png", useCDN), sizes: "16x16", type: "image/png" },
      { url: getIconUrl("/favicon-32x32.png", useCDN), sizes: "32x32", type: "image/png" },
      { url: getIconUrl("/icon-192x192.png", useCDN), sizes: "192x192", type: "image/png" },
      { url: getIconUrl("/icon-512x512.png", useCDN), sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: getIconUrl("/apple-touch-icon.png", useCDN), sizes: "180x180", type: "image/png" },
    ],
    shortcut: getIconUrl("/favicon.ico", useCDN),
  },
  // manifest.json должен быть локальным (не через CDN), так как браузер требует CORS заголовки
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "MyUnion Pro",
  },
  other: {
    "referrer-policy": "strict-origin-when-cross-origin",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        {/* Яндекс Партнёрка: верификационный код (временно, потом удалить) */}
        <meta name="yandex-verification" content="zbrq7qg64z2qsesl" />
        {/* Favicon и иконки для всех браузеров (с поддержкой CDN) */}
        <IconsHead />
        
        {/* Theme Flash Prevention - must be first script */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('myunion-theme');
                  if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                    document.documentElement.classList.add('dark');
                    document.documentElement.style.colorScheme = 'dark';
                  } else {
                    document.documentElement.classList.remove('dark');
                    document.documentElement.style.colorScheme = 'light';
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
        {/* Early Error Suppression - runs before React loads */}
        <Script
          id="early-error-handler"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                // Suppress React hydration errors early (before React loads)
                var origError = console.error;
                console.error = function() {
                  var args = Array.prototype.slice.call(arguments);
                  var msg = args.join(' ');
                  // Suppress React hydration errors #418, #423, #425
                  if (msg.indexOf('Minified React error #418') !== -1 ||
                      msg.indexOf('Minified React error #423') !== -1 ||
                      msg.indexOf('Minified React error #425') !== -1 ||
                      msg.indexOf('Hydration failed') !== -1 ||
                      msg.indexOf('hydrating') !== -1) {
                    return;
                  }
                  origError.apply(console, arguments);
                };
                
                // Suppress uncaught React hydration errors and extension errors
                window.addEventListener('error', function(e) {
                  var msg = e.message || '';
                  if (msg.indexOf('Minified React error #418') !== -1 ||
                      msg.indexOf('Minified React error #423') !== -1 ||
                      msg.indexOf('Minified React error #425') !== -1 ||
                      msg.indexOf('message channel closed') !== -1 ||
                      msg.indexOf('listener indicated an asynchronous response') !== -1 ||
                      msg.indexOf('Extension context invalidated') !== -1) {
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                  }
                }, true);
                
                // Suppress extension-related unhandled rejections
                window.addEventListener('unhandledrejection', function(e) {
                  var reason = e.reason || {};
                  var msg = reason.message || String(reason);
                  if (msg.indexOf('message channel closed') !== -1 ||
                      msg.indexOf('listener indicated an asynchronous response') !== -1 ||
                      msg.indexOf('Extension context invalidated') !== -1) {
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                  }
                }, true);
                
                var reloadAttempted = false;
                
                window.addEventListener('error', function(e) {
                  if (reloadAttempted) return;
                  
                  var msg = e.message || '';
                  var isChunkError = (
                    msg.indexOf('Loading chunk') !== -1 ||
                    msg.indexOf('ChunkLoadError') !== -1 ||
                    msg.indexOf('Failed to fetch dynamically imported module') !== -1
                  );
                  
                  // Don't reload for React errors
                  var isReactError = msg.indexOf('Minified React error') !== -1;
                  
                  if (isChunkError && !isReactError) {
                    console.log('[ChunkError] Detected chunk loading error, reloading...');
                    reloadAttempted = true;
                    
                    if ('caches' in window) {
                      caches.keys().then(function(names) {
                        names.forEach(function(name) {
                          caches.delete(name);
                        });
                      });
                    }
                    
                    setTimeout(function() {
                      window.location.reload();
                    }, 100);
                  }
                });
                
                window.addEventListener('unhandledrejection', function(e) {
                  if (reloadAttempted) return;
                  
                  var reason = e.reason;
                  var isChunkError = reason && (
                    (reason.name === 'ChunkLoadError') ||
                    (reason.message && (
                      reason.message.includes('Loading chunk') ||
                      reason.message.includes('Failed to fetch dynamically imported module')
                    ))
                  );
                  
                  // Игнорируем React errors
                  var isReactError = reason && reason.message && (
                    reason.message.includes('Minified React error') || 
                    reason.message.includes('Hydration')
                  );
                  
                  if (isChunkError && !isReactError) {
                    console.log('[ChunkError] Detected chunk loading rejection, reloading...');
                    reloadAttempted = true;
                    
                    if ('caches' in window) {
                      caches.keys().then(function(names) {
                        names.forEach(function(name) {
                          caches.delete(name);
                        });
                      });
                    }
                    
                    setTimeout(function() {
                      window.location.reload();
                    }, 100);
                  }
                });
              })();
            `,
          }}
        />
        {/* Firebase Cloud Messaging Service Worker Registration */}
        <Script
          id="firebase-sw-register"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/firebase-messaging-sw.js')
                    .then(function() { /* SW registered */ })
                    .catch(function(error) {
                      console.error('[Firebase] Service Worker registration failed:', error);
                    });
                });
              }
            `,
          }}
        />
      </head>
      <body className="font-sans" suppressHydrationWarning>
        <Providers>{children}</Providers>
        {/* Яндекс Партнёрка: копирайт/верификация zbrq7qg64z2qsesl (временно, потом удалить) */}
        <span className="sr-only" aria-hidden="true" data-yandex-partner="zbrq7qg64z2qsesl">zbrq7qg64z2qsesl</span>
      </body>
    </html>
  );
}
