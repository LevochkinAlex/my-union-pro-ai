"use client";

import Script from "next/script";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const MAIL_RU_COUNTER_ID = "3749973";
const YANDEX_METRIKA_ID = 107726457;
const VK_PIXEL_ID = process.env.NEXT_PUBLIC_VK_PIXEL_ID;

export function AnalyticsScripts() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const mailRuLoaded = useRef(false);

  // Top.Mail.Ru: подмена USER_ID на реальный id пользователя (синхронизация пользователей)
  useEffect(() => {
    if (status === "loading") return;
    const userId = session?.user?.id ?? "";
    const pid = typeof userId === "string" ? userId : String(userId);

    if (typeof window === "undefined") return;
    const w = window as Window & { _tmr?: unknown[] };
    w._tmr = w._tmr || [];
    w._tmr.push({
      id: MAIL_RU_COUNTER_ID,
      type: "pageView",
      start: Date.now(),
      pid,
    });

    if (mailRuLoaded.current) return;
    mailRuLoaded.current = true;
    const id = "tmr-code";
    if (document.getElementById(id)) return;
    const ts = document.createElement("script");
    ts.type = "text/javascript";
    ts.async = true;
    ts.id = id;
    ts.src = "https://top-fwz1.mail.ru/js/code.js";
    const f = () => {
      const s = document.getElementsByTagName("script")[0];
      if (s?.parentNode) s.parentNode.insertBefore(ts, s);
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", f, false);
    } else {
      f();
    }
  }, [status, session?.user?.id, pathname]);

  return (
    <>
      {/* Top.Mail.Ru noscript fallback */}
      <noscript>
        <div>
          <img
            src={`https://top-fwz1.mail.ru/counter?id=${MAIL_RU_COUNTER_ID};js=na`}
            style={{ position: "absolute", left: -9999 }}
            alt="Top.Mail.Ru"
          />
        </div>
      </noscript>

      {/* Yandex.Metrika */}
      <Script
        id="yandex-metrika"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
(function(m,e,t,r,i,k,a){
  m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
  m[i].l=1*new Date();
  for (var j = 0; j < document.scripts.length; j++) { if (document.scripts[j].src === r) { return; } }
  k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a);
})(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js?id=${YANDEX_METRIKA_ID}', 'ym');
ym(${YANDEX_METRIKA_ID}, 'init', { ssr: true, webvisor: true, clickmap: true, ecommerce: 'dataLayer', referrer: document.referrer, url: location.href, accurateTrackBounce: true, trackLinks: true });
          `.trim(),
        }}
      />
      <noscript>
        <div>
          <img src={`https://mc.yandex.ru/watch/${YANDEX_METRIKA_ID}`} style={{ position: "absolute", left: -9999 }} alt="" />
        </div>
      </noscript>

      {/* VK Pixel (ретаргетинг) — загружается только при заданном NEXT_PUBLIC_VK_PIXEL_ID */}
      {VK_PIXEL_ID ? (
        <>
          <div id="vk_api_transport" />
          <Script
            id="vk-pixel-init"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `
(function() {
  window.vkAsyncInit = function() {
    if (window.VK && window.VK.Retargeting) {
      window.VK.Retargeting.Init(${JSON.stringify(VK_PIXEL_ID)});
      window.VK.Retargeting.Hit();
    }
  };
  var el = document.createElement("script");
  el.type = "text/javascript";
  el.async = true;
  el.src = "https://vk.com/js/api/openapi.js?160";
  var wrap = document.getElementById("vk_api_transport");
  if (wrap) wrap.appendChild(el);
})();
              `.trim(),
            }}
          />
        </>
      ) : null}
    </>
  );
}
