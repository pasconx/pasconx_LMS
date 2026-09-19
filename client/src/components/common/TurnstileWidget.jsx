import React, { useEffect, useRef } from 'react';

/**
 * Cloudflare Turnstile CAPTCHA Widget
 * Frictionless, privacy-preserving bot defense.
 * Renders only when VITE_TURNSTILE_SITE_KEY is provided in the environment.
 */
export default function TurnstileWidget({ onVerify, onError, onExpire }) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;

    let isMounted = true;

    const renderWidget = () => {
      if (!window.turnstile || !containerRef.current || !isMounted) return;

      // Clean up previous widget if any
      if (widgetIdRef.current !== null) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch (e) {
          // ignore cleanup error
        }
      }

      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token) => {
          if (isMounted && onVerify) onVerify(token);
        },
        'error-callback': () => {
          if (isMounted && onError) onError();
        },
        'expired-callback': () => {
          if (isMounted && onExpire) onExpire();
        },
        theme: 'auto',
        size: 'normal'
      });
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      // Load script dynamically
      const scriptId = 'cf-turnstile-script';
      let script = document.getElementById(scriptId);
      if (!script) {
        script = document.createElement('script');
        script.id = scriptId;
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.onload = () => {
          if (isMounted) renderWidget();
        };
        document.head.appendChild(script);
      } else {
        const checkInterval = setInterval(() => {
          if (window.turnstile) {
            clearInterval(checkInterval);
            if (isMounted) renderWidget();
          }
        }, 100);
        return () => clearInterval(checkInterval);
      }
    }

    return () => {
      isMounted = false;
      if (widgetIdRef.current !== null && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch (e) {
          // ignore
        }
      }
    };
  }, [siteKey]);

  if (!siteKey) {
    return null;
  }

  return (
    <div className="flex justify-center my-3">
      <div ref={containerRef} />
    </div>
  );
}
