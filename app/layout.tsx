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
            {/* Initialize OneSignal queue before SDK loads */}
            <Script
              id="onesignal-queue-init"
              strategy="beforeInteractive"
              dangerouslySetInnerHTML={{
                __html: `window.OneSignal = window.OneSignal || [];`,
              }}
            />
            
            {/* Load OneSignal SDK */}
            <Script
              id="onesignal-sdk"
              src="https://cdn.onesignal.com/sdks/web/v15/OneSignalSDK.page.js"
              strategy="lazyOnload"
            />
            
            {/* Initialize OneSignal after SDK loads */}
            <Script
              id="onesignal-init"
              strategy="lazyOnload"
              dangerouslySetInnerHTML={{
                __html: `
                  (function() {
                    console.log("[OneSignal] Init script loaded");
                    
                    // Wait for OneSignal to be available
                    const checkAndInit = setInterval(function() {
                      if (typeof window !== 'undefined' && window.OneSignal && typeof window.OneSignal.push === 'function') {
                        clearInterval(checkAndInit);
                        console.log("[OneSignal] ✅ SDK ready, initializing...");
                        
                        window.OneSignal.push(function() {
                          console.log("[OneSignal] Inside push callback");
                          try {
                            window.OneSignal.init({
                              appId: "${ONESIGNAL_APP_ID}",
                              allowLocalhostAsSecureOrigin: true,
                            });
                            console.log("[OneSignal] ✅ Initialization complete");
                          } catch (error) {
                            console.error("[OneSignal] Init error:", error);
                          }
                        });
                      }
                    }, 100);
                    
                    // Fallback: stop checking after 10 seconds
                    setTimeout(() => clearInterval(checkAndInit), 10000);
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
