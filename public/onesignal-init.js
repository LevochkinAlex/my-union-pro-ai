/**
 * OneSignal v16 Initialization Script
 * SDK v16 has better initialization support
 */
(function() {
  if (typeof window === 'undefined') return;
  
  const appId = window.OneSignalAppId || window.NEXT_PUBLIC_ONESIGNAL_APP_ID;
  
  if (!appId) {
    console.warn('[OneSignal] No app ID configured');
    return;
  }
  
  console.log('[OneSignal] v16 Initializing with appId:', appId);
  
  // OneSignal v16 uses a different initialization approach
  // It will auto-initialize when the SDK loads if window.OneSignalConfig is present
  window.OneSignalConfig = {
    appId: appId,
    allowLocalhostAsSecureOrigin: true,
    notifyButton: {
      enable: true,
    },
  };
  
  console.log('[OneSignal] v16 Config set, waiting for SDK to load and initialize...');
  
  // For v16, SDK handles initialization automatically
  // We just need to wait for it to load
  let checkAttempts = 0;
  const maxChecks = 300; // 30 seconds
  
  const checkSDK = setInterval(function() {
    checkAttempts++;
    
    const OS = window.OneSignal;
    
    if (!OS) {
      if (checkAttempts >= maxChecks) {
        clearInterval(checkSDK);
        console.error('[OneSignal] ❌ SDK not loaded after 30 seconds');
      }
      return;
    }
    
    // In v16, check if initialized using the promise-based API
    if (OS && OS.Slidedown) {
      clearInterval(checkSDK);
      console.log('[OneSignal] ✅ v16 SDK loaded and ready');
      
      // v16 initialization is automatic, but we can verify it's ready
      if (typeof OS.init === 'function') {
        try {
          console.log('[OneSignal] Calling OneSignal.init() for v16...');
          OS.init(window.OneSignalConfig);
          console.log('[OneSignal] ✅ v16 OneSignal initialized');
        } catch (error) {
          console.warn('[OneSignal] init() threw error (might already be initialized):', error.message);
        }
      }
      
      return;
    }
    
    if (checkAttempts >= maxChecks) {
      clearInterval(checkSDK);
      console.error('[OneSignal] ❌ SDK not ready after 30 seconds');
    }
  }, 100);
})();
