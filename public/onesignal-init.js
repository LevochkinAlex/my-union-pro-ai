/**
 * OneSignal v16 Initialization Script
 * SDK v16 has stricter initialization requirements
 */
(function() {
  if (typeof window === 'undefined') return;
  
  const appId = window.OneSignalAppId || window.NEXT_PUBLIC_ONESIGNAL_APP_ID;
  
  if (!appId) {
    console.warn('[OneSignal] No app ID configured');
    return;
  }
  
  console.log('[OneSignal] v16 Initializing with appId:', appId);
  
  // OneSignal v16 needs to be configured BEFORE SDK loads
  // Set config on window object
  window.OneSignalConfig = {
    appId: appId,
    allowLocalhostAsSecureOrigin: true,
    // Don't set notifyButton here, let SDK handle it
  };
  
  console.log('[OneSignal] v16 Config ready, SDK will auto-initialize');
})();
