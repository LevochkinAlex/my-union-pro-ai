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
                
                // Suppress uncaught React hydration errors
                window.addEventListener('error', function(e) {
                  var msg = e.message || '';
                  if (msg.indexOf('Minified React error #418') !== -1 ||
                      msg.indexOf('Minified React error #423') !== -1 ||
                      msg.indexOf('Minified React error #425') !== -1) {
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
      <body className="font-sans" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
