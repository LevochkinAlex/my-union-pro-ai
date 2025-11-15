/**
 * OneSignal Initialization Script
 * Load this script BEFORE OneSignal SDK to prepare initialization
 */
(function() {
  if (typeof window === 'undefined') return;
  
  const appId = window.OneSignalAppId || window.NEXT_PUBLIC_ONESIGNAL_APP_ID;
  
  if (!appId) {
    console.warn('[OneSignal-Init] No app ID configured');
    return;
  }
  
  console.log('[OneSignal-Init] Configuration appId:', appId);
  
  // Create queue if doesn't exist
  if (!window.OneSignal) {
    window.OneSignal = [];
  }
  
  // Store config globally
  window.OneSignalConfig = {
    appId: appId,
    allowLocalhostAsSecureOrigin: true,
  };
  
  // Function to perform initialization
  const doInit = function(OneSignalInstance) {
    if (!OneSignalInstance) {
      console.warn('[OneSignal-Init] OneSignal instance is null');
      return false;
    }
    
    // Check if already initialized
    if (OneSignalInstance.initialized) {
      console.log('[OneSignal-Init] Already initialized');
      return true;
    }
    
    if (typeof OneSignalInstance.init !== 'function') {
      console.warn('[OneSignal-Init] OneSignal.init is not a function');
      return false;
    }
    
    try {
      console.log('[OneSignal-Init] Calling OneSignal.init...');
      OneSignalInstance.init(window.OneSignalConfig);
      console.log('[OneSignal-Init] ✅ OneSignal initialized');
      return true;
    } catch (error) {
      console.error('[OneSignal-Init] Error during init:', error);
      return false;
    }
  };
  
  // Wait for SDK to load
  let checkAttempts = 0;
  const maxChecks = 200; // 20 seconds with 100ms interval
  
  const checkAndInit = setInterval(function() {
    checkAttempts++;
    
    const OneSignal = window.OneSignal;
    
    if (!OneSignal) {
      if (checkAttempts >= maxChecks) {
        clearInterval(checkAndInit);
        console.error('[OneSignal-Init] ❌ OneSignal never loaded');
      }
      return;
    }
    
    // If SDK has loaded and transformed from array to object
    if (!Array.isArray(OneSignal)) {
      clearInterval(checkAndInit);
      console.log('[OneSignal-Init] SDK loaded (not array anymore)');
      doInit(OneSignal);
      return;
    }
    
    // If it's still array, try via push after SDK script loads (after ~2-3 seconds)
    if (Array.isArray(OneSignal) && checkAttempts > 30) {
      // Try push callback
      if (typeof OneSignal.push === 'function') {
        clearInterval(checkAndInit);
        console.log('[OneSignal-Init] Using push callback for init');
        
        OneSignal.push(function() {
          console.log('[OneSignal-Init] Push callback executed');
          doInit(window.OneSignal);
        });
        return;
      }
    }
    
    if (checkAttempts >= maxChecks) {
      clearInterval(checkAndInit);
      console.error('[OneSignal-Init] ❌ OneSignal SDK not ready after 20 seconds');
      console.log('[OneSignal-Init] OneSignal type:', typeof OneSignal);
      console.log('[OneSignal-Init] Is array:', Array.isArray(OneSignal));
    }
  }, 100);
})();
