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
            {/* OneSignal SDK v16 - Official recommended approach */}
            <Script
              id="onesignal-sdk"
              src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js"
              defer
              strategy="afterInteractive"
            />
            
            {/* OneSignal v16 Initialization using OneSignalDeferred */}
            <Script
              id="onesignal-init"
              strategy="afterInteractive"
              dangerouslySetInnerHTML={{
                __html: `
                  window.OneSignalDeferred = window.OneSignalDeferred || [];
                  
                  OneSignalDeferred.push(async function(OneSignal) {
                    console.log('[OneSignal] v16 Deferred initialization starting...');
                    try {
                      await OneSignal.init({
                        appId: "${ONESIGNAL_APP_ID}",
                        allowLocalhostAsSecureOrigin: true,
                        notifyButton: {
                          enable: true,
                        },
                      });
                      console.log('[OneSignal] ✅ v16 Initialized successfully');
                    } catch (error) {
                      console.error('[OneSignal] Initialization error:', error);
                    }
                  });
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
