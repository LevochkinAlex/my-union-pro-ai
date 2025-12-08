import { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: "MyUnion — единая панель управления профсоюзом",
  description: "Управляйте документами, участниками и уведомлениями в одном месте",
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
        {/* Global ChunkLoadError Handler */}
        {/* ChunkLoadError Handler - ТОЛЬКО для ошибок загрузки чанков, НЕ для React errors */}
        <Script
          id="chunk-error-handler"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var reloadAttempted = false;
                
                window.addEventListener('error', function(e) {
                  if (reloadAttempted) return;
                  
                  // ИСПРАВЛЕНО: Проверяем ТОЛЬКО конкретные ошибки загрузки чанков
                  // НЕ срабатываем на React hydration errors (#418, #423, #425)
                  var msg = e.message || '';
                  var isChunkError = (
                    msg.includes('Loading chunk') ||
                    msg.includes('ChunkLoadError') ||
                    msg.includes('Failed to fetch dynamically imported module')
                  );
                  
                  // Игнорируем React errors (hydration, minified и т.д.)
                  var isReactError = msg.includes('Minified React error') || msg.includes('Hydration');
                  
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
                    .then(function(registration) {
                      console.log('[Firebase] ✅ Service Worker registered:', registration.scope);
                    })
                    .catch(function(error) {
                      console.error('[Firebase] ❌ Service Worker registration failed:', error);
                    });
                });
              }
            `,
          }}
        />
      </head>
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
