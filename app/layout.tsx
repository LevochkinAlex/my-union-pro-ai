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
                  window.OneSignalConfig = {
                    appId: "${ONESIGNAL_APP_ID}",
                    allowLocalhostAsSecureOrigin: true,
                  };
                `,
              }}
            />
            
            {/* Load OneSignal SDK v16 */}
            <Script
              id="onesignal-sdk"
              src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js"
              strategy="afterInteractive"
              dangerouslySetInnerHTML={{
                __html: `
                  // Initialize OneSignal after SDK loads
                  window.OneSignalSDKLoaded = true;
                  console.log('[OneSignal] v16 SDK loaded');
                  
                  if (window.OneSignal && typeof window.OneSignal.init === 'function') {
                    console.log('[OneSignal] Initializing OneSignal v16...');
                    try {
                      window.OneSignal.init(window.OneSignalConfig);
                      console.log('[OneSignal] ✅ v16 initialized successfully');
                    } catch (error) {
                      console.error('[OneSignal] Error during v16 init:', error);
                    }
                  }
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
