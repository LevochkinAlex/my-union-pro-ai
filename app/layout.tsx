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
