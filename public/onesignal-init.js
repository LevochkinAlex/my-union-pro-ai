/**
 * OneSignal Initialization Script
 * Load BEFORE SDK to prepare initialization
 */
(function() {
  if (typeof window === 'undefined') return;
  
  const appId = window.OneSignalAppId || window.NEXT_PUBLIC_ONESIGNAL_APP_ID;
  
  if (!appId) {
    console.warn('[OneSignal] No app ID configured');
    return;
  }
  
  console.log('[OneSignal] Initializing with appId:', appId);
  
  // Create queue if needed
  if (!window.OneSignal) {
    window.OneSignal = [];
  }
  
  // Store config
  window.OneSignalConfig = {
    appId: appId,
    allowLocalhostAsSecureOrigin: true,
  };
  
  // Wait for SDK to load and initialize it
  let checkAttempts = 0;
  const maxChecks = 300; // 30 seconds
  
  const init = setInterval(function() {
    checkAttempts++;
    
    const OS = window.OneSignal;
    
    if (!OS) {
      if (checkAttempts >= maxChecks) {
        clearInterval(init);
        console.error('[OneSignal] ❌ SDK not loaded after 30 seconds');
      }
      return;
    }
    
    // Check if it's been initialized (no longer an array or has been converted)
    if (!Array.isArray(OS)) {
      if (OS.initialized === false) {
        // Not yet initialized, SDK loaded but not called init yet
        console.log('[OneSignal] SDK loaded, calling init...');
        try {
          OS.init(window.OneSignalConfig);
          console.log('[OneSignal] ✅ Init called successfully');
        } catch (error) {
          console.error('[OneSignal] Error calling init:', error);
        }
      } else {
        console.log('[OneSignal] ✅ SDK appears to be initialized already');
      }
      clearInterval(init);
      return;
    }
    
    // Still an array - SDK loading
    if (checkAttempts === 50) {
      // After 5 seconds, try via push if still array
      console.log('[OneSignal] SDK loading, trying via push...');
      if (typeof OS.push === 'function') {
        OS.push(() => {
          console.log('[OneSignal] Inside push callback');
          const instance = window.OneSignal;
          if (instance && typeof instance.init === 'function' && !instance.initialized) {
            try {
              instance.init(window.OneSignalConfig);
              console.log('[OneSignal] ✅ Init via push successful');
            } catch (error) {
              console.error('[OneSignal] Error in push callback:', error);
            }
          }
        });
      }
    }
    
    if (checkAttempts >= maxChecks) {
      clearInterval(init);
      console.error('[OneSignal] ❌ Failed to initialize after 30 seconds');
    }
  }, 100);
})();
