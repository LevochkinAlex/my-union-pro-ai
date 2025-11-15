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
            {/* Set config before SDK loads */}
            <Script
              id="onesignal-config"
              strategy="beforeInteractive"
              dangerouslySetInnerHTML={{
                __html: `
                  window.OneSignalAppId = "${ONESIGNAL_APP_ID}";
                `,
              }}
            />
            
            {/* Load OneSignal SDK v16 */}
            <Script
              id="onesignal-sdk"
              src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js"
              strategy="afterInteractive"
            />
            
            {/* Initialize OneSignal after SDK loads */}
            <Script
              id="onesignal-init-after"
              strategy="lazyOnload"
              dangerouslySetInnerHTML={{
                __html: `
                  (function() {
                    const waitForOS = setInterval(function() {
                      if (typeof window.OneSignal !== 'undefined' && typeof window.OneSignal.init === 'function') {
                        clearInterval(waitForOS);
                        console.log('[OneSignal] SDK ready, initializing...');
                        try {
                          window.OneSignal.init({
                            appId: window.OneSignalAppId,
                            allowLocalhostAsSecureOrigin: true,
                          });
                          console.log('[OneSignal] ✅ Initialized successfully');
                        } catch (error) {
                          console.error('[OneSignal] Init error:', error);
                        }
                      }
                    }, 100);
                    
                    // Timeout after 30 seconds
                    setTimeout(() => clearInterval(waitForOS), 30000);
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
