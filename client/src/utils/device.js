/**
 * Desktop-only detection.
 * Blocks phones & tablets, including "Request desktop site" mode and iPadOS (which pretends to be a Mac).
 * NOTE: browser-side checks can never be 100% tamper-proof; the server also blocks mobile user-agents at login.
 */
const MOBILE_UA =
  /Android|iPhone|iPad|iPod|Mobile|Windows Phone|BlackBerry|BB10|Opera Mini|Opera Mobi|IEMobile|Tablet|Silk|Kindle|PlayBook|CriOS|FxiOS/i;

export function isMobileOrTablet() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;

  const ua = navigator.userAgent || '';
  if (MOBILE_UA.test(ua)) return true;

  // Chromium client hints
  if (navigator.userAgentData && navigator.userAgentData.mobile === true) return true;

  // iPadOS 13+ "desktop mode" reports as Mac but has multi-touch
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;

  // Touch-first device (no mouse / no hover) => phone or tablet even if UA says desktop
  const mm = window.matchMedia ? window.matchMedia.bind(window) : null;
  if (mm) {
    const coarsePrimary = mm('(pointer: coarse)').matches;
    const noHover = mm('(hover: none)').matches;
    const hasFinePointer = mm('(any-pointer: fine)').matches;
    if (coarsePrimary && noHover && !hasFinePointer) return true;
  }

  // Physical screen too small for a laptop/desktop (catches phones in "desktop site" mode)
  const sw = window.screen?.width || 0;
  const sh = window.screen?.height || 0;
  if (sw > 0 && sh > 0 && Math.min(sw, sh) < 600) return true;

  return false;
}

export function getClientInfo() {
  return {
    isMobile: isMobileOrTablet(),
    screenW: window.screen?.width || null,
    screenH: window.screen?.height || null,
    touchPoints: navigator.maxTouchPoints || 0
  };
}
