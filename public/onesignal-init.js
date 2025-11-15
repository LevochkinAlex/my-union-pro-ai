/**
 * OneSignal Initialization Script
 * Loads immediately before the SDK, initializes when SDK is ready
 */
(function() {
  if (typeof window === 'undefined') return;
  
  const appId = window.OneSignalAppId || window.NEXT_PUBLIC_ONESIGNAL_APP_ID;
  
  if (!appId) {
    console.warn('[OneSignal-Init] No app ID configured');
    return;
  }
  
  console.log('[OneSignal-Init] Configuration appId:', appId);
  
  // Store config for SDK to use
  window.OneSignalConfig = {
    appId: appId,
    allowLocalhostAsSecureOrigin: true,
  };
  
  // Initialize OneSignal queue
  window.OneSignal = window.OneSignal || [];
  
  // Poll for OneSignal SDK initialization
  let attempts = 0;
  const maxAttempts = 150; // 15 seconds
  const pollInterval = 100;
  
  const initWhenReady = setInterval(function() {
    attempts++;
    
    // Check if OneSignal SDK is loaded
    const OneSignal = window.OneSignal;
    
    // If it's no longer an array, SDK might be loaded
    if (OneSignal && !Array.isArray(OneSignal) && typeof OneSignal.initialized !== 'undefined') {
      clearInterval(initWhenReady);
      console.log('[OneSignal-Init] ✅ SDK loaded');
      // SDK is already initialized, no need to do anything
      return;
    }
    
    // If it has push function, SDK is ready for queue
    if (OneSignal && typeof OneSignal.push === 'function' && attempts > 20) { // Wait for SDK to fully load
      clearInterval(initWhenReady);
      console.log('[OneSignal-Init] ✅ SDK ready, pushing init callback');
      
      // Push the initialization
      OneSignal.push(function() {
        console.log('[OneSignal-Init] Inside push callback');
        const instance = window.OneSignal;
        
        if (!instance) {
          console.warn('[OneSignal-Init] OneSignal instance unavailable');
          return;
        }
        
        if (typeof instance.init !== 'function') {
          console.warn('[OneSignal-Init] OneSignal.init is not a function');
          console.log('[OneSignal-Init] Available methods:', Object.keys(instance).slice(0, 10));
          return;
        }
        
        try {
          console.log('[OneSignal-Init] Calling OneSignal.init...');
          instance.init(window.OneSignalConfig);
          console.log('[OneSignal-Init] ✅ OneSignal.init() successful');
        } catch (error) {
          console.error('[OneSignal-Init] Error calling init:', error);
        }
      });
      return;
    }
    
    if (attempts >= maxAttempts) {
      clearInterval(initWhenReady);
      console.error('[OneSignal-Init] ❌ OneSignal SDK not initialized after 15 seconds');
      console.log('[OneSignal-Init] window.OneSignal type:', typeof window.OneSignal);
      console.log('[OneSignal-Init] window.OneSignal is array:', Array.isArray(window.OneSignal));
    }
  }, pollInterval);
})();
