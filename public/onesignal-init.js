/**
 * OneSignal Initialization Script
 * This runs as soon as the page loads
 */
(function() {
  // Ensure OneSignal queue exists
  if (typeof window === 'undefined') return;
  
  window.OneSignal = window.OneSignal || [];
  
  // Configuration
  const config = {
    appId: window.OneSignalAppId || window.NEXT_PUBLIC_ONESIGNAL_APP_ID,
    allowLocalhostAsSecureOrigin: true,
  };
  
  console.log('[OneSignal-Init] Configuration:', { appId: config.appId });
  
  if (!config.appId) {
    console.warn('[OneSignal-Init] No app ID configured');
    return;
  }
  
  // Wait for OneSignal SDK to load
  let attempts = 0;
  const maxAttempts = 100; // 10 seconds
  
  const checkAndInit = setInterval(function() {
    attempts++;
    
    // Check if OneSignal SDK is ready
    if (typeof window.OneSignal !== 'undefined' && typeof window.OneSignal.push === 'function') {
      clearInterval(checkAndInit);
      console.log('[OneSignal-Init] ✅ SDK loaded, initializing...');
      
      // Push init callback
      window.OneSignal.push(function() {
        console.log('[OneSignal-Init] Inside push callback');
        try {
          if (typeof window.OneSignal.init === 'function') {
            window.OneSignal.init(config);
            console.log('[OneSignal-Init] ✅ OneSignal initialized successfully');
          } else {
            console.warn('[OneSignal-Init] OneSignal.init is not a function');
            console.log('[OneSignal-Init] OneSignal methods:', Object.keys(window.OneSignal).slice(0, 10));
          }
        } catch (error) {
          console.error('[OneSignal-Init] Error during initialization:', error);
        }
      });
    } else if (attempts >= maxAttempts) {
      clearInterval(checkAndInit);
      console.error('[OneSignal-Init] ❌ OneSignal SDK not loaded after 10 seconds');
    }
  }, 100);
})();

