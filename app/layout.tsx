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
                    function initOneSignal() {
                      if (typeof window === 'undefined' || !window.OneSignal) {
                        setTimeout(initOneSignal, 100);
                        return;
                      }
                      
                      try {
                        window.OneSignal.push(function() {
                          const OneSignalInstance = window.OneSignal;
                          if (OneSignalInstance && typeof OneSignalInstance.init === 'function') {
                            OneSignalInstance.init({
                              appId: "${ONESIGNAL_APP_ID}",
                              allowLocalhostAsSecureOrigin: true,
                              serviceWorkerPath: "/OneSignalSDKWorker.js",
                              serviceWorkerUpdaterPath: "/OneSignalSDKUpdaterWorker.js"
                            });
                            console.log("[Push] OneSignal initialized successfully");
                          }
                        });
                      } catch (error) {
                        console.error("[Push] Error initializing OneSignal:", error);
                      }
                    }
                    
                    // Wait for SDK to load
                    if (document.readyState === 'loading') {
                      document.addEventListener('DOMContentLoaded', initOneSignal);
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
