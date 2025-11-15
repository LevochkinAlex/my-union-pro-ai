import { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: "MyUnion — единая панель управления профсоюзом",
  description: "Управляйте документами, участниками и уведомлениями в одном месте",
};

const ONESIGNAL_APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        {ONESIGNAL_APP_ID && (
          <>
            <Script
              id="onesignal-init"
              strategy="beforeInteractive"
              dangerouslySetInnerHTML={{
                __html: `
                  window.OneSignal = window.OneSignal || [];
                `,
              }}
            />
            <Script
              id="onesignal-sdk"
              src="https://cdn.onesignal.com/sdks/web/v15/OneSignalSDK.page.js"
              strategy="lazyOnload"
            />
            <Script
              id="onesignal-sdk-loader"
              strategy="lazyOnload"
              dangerouslySetInnerHTML={{
                __html: `
                  (function() {
                    // Wait for SDK script to load
                    const checkSDK = setInterval(function() {
                      if (typeof window !== 'undefined' && window.OneSignal && typeof window.OneSignal.push === 'function') {
                        clearInterval(checkSDK);
                        console.log("[Push] ✅ OneSignal SDK script detected");
                        
                        // After SDK loads, wait a bit and then try to initialize
                        setTimeout(() => {
                          const OneSignal = window.OneSignal;
                          if (OneSignal) {
                            console.log("[Push] OneSignal after script load:", typeof OneSignal, "is array:", Array.isArray(OneSignal));
                            // Try to initialize if it's still an array
                            if (Array.isArray(OneSignal)) {
                              console.log("[Push] OneSignal is still array after script load, pushing init...");
                              OneSignal.push(function() {
                                console.log("[Push] ✅ Inside OneSignal.push() after script load");
                                const OneSignalInstance = window.OneSignal;
                                if (OneSignalInstance && typeof OneSignalInstance.init === 'function') {
                                  OneSignalInstance.init({
                                    appId: "${ONESIGNAL_APP_ID}",
                                    allowLocalhostAsSecureOrigin: true,
                                    serviceWorkerPath: "/OneSignalSDKWorker.js",
                                    serviceWorkerUpdaterPath: "/OneSignalSDKUpdaterWorker.js"
                                  });
                                  console.log("[Push] ✅ OneSignal.init() called after script load");
                                }
                              });
                            }
                          }
                        }, 1000);
                      }
                    }, 100);
                    
                    // Timeout after 10 seconds
                    setTimeout(function() {
                      clearInterval(checkSDK);
                      console.warn("[Push] OneSignal SDK not detected after 10 seconds");
                    }, 10000);
                  })();
                `,
              }}
            />
            <Script
              id="onesignal-init-code"
              strategy="lazyOnload"
              dangerouslySetInnerHTML={{
                __html: `
                  (function() {
                    console.log("[Push] OneSignal init script loaded");
                    let attempts = 0;
                    const maxAttempts = 50; // 5 seconds max
                    
                    function initOneSignal() {
                      attempts++;
                      console.log("[Push] Init attempt", attempts, "OneSignal:", typeof window !== 'undefined' ? (window.OneSignal ? "exists" : "missing") : "window undefined");
                      
                      if (typeof window === 'undefined' || !window.OneSignal) {
                        if (attempts < maxAttempts) {
                          setTimeout(initOneSignal, 100);
                        } else {
                          console.error("[Push] OneSignal SDK not loaded after", maxAttempts, "attempts");
                        }
                        return;
                      }
                      
                      console.log("[Push] OneSignal found, checking if it's an array:", Array.isArray(window.OneSignal));
                      
                      try {
                        if (Array.isArray(window.OneSignal)) {
                          console.log("[Push] OneSignal is array, pushing init callback...");
                          window.OneSignal.push(function() {
                            console.log("[Push] ✅ Inside OneSignal.push() callback in init script");
                            const OneSignalInstance = window.OneSignal;
                            console.log("[Push] OneSignalInstance type:", typeof OneSignalInstance);
                            console.log("[Push] OneSignalInstance is array:", Array.isArray(OneSignalInstance));
                            
                            if (OneSignalInstance && typeof OneSignalInstance.init === 'function') {
                              console.log("[Push] Calling OneSignal.init()...");
                              OneSignalInstance.init({
                                appId: "${ONESIGNAL_APP_ID}",
                                allowLocalhostAsSecureOrigin: true,
                                serviceWorkerPath: "/OneSignalSDKWorker.js",
                                serviceWorkerUpdaterPath: "/OneSignalSDKUpdaterWorker.js"
                              });
                              console.log("[Push] ✅ OneSignal.init() called successfully");
                            } else {
                              console.warn("[Push] OneSignalInstance.init is not a function. OneSignalInstance:", OneSignalInstance);
                            }
                          });
                        } else {
                          console.log("[Push] OneSignal is not an array, trying direct init...");
                          if (window.OneSignal && typeof window.OneSignal.init === 'function') {
                            window.OneSignal.init({
                              appId: "${ONESIGNAL_APP_ID}",
                              allowLocalhostAsSecureOrigin: true,
                              serviceWorkerPath: "/OneSignalSDKWorker.js",
                              serviceWorkerUpdaterPath: "/OneSignalSDKUpdaterWorker.js"
                            });
                            console.log("[Push] ✅ OneSignal initialized directly");
                          }
                        }
                      } catch (error) {
                        console.error("[Push] Error initializing OneSignal:", error);
                      }
                    }
                    
                    // Wait for SDK to load
                    if (document.readyState === 'loading') {
                      document.addEventListener('DOMContentLoaded', function() {
                        setTimeout(initOneSignal, 500);
                      });
                    } else {
                      setTimeout(initOneSignal, 500);
                    }
                  })();
                `,
              }}
            />
          </>
        )}
      </head>
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
