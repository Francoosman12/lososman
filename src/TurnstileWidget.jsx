import { useEffect, useRef, useState } from 'react';

let turnstileScriptPromise;

const loadTurnstile = () => {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!turnstileScriptPromise) {
    turnstileScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        if (window.turnstile) resolve(window.turnstile);
        else {
          turnstileScriptPromise = null;
          reject(new Error('No se pudo iniciar la verificación anti-bots.'));
        }
      };
      script.onerror = () => {
        turnstileScriptPromise = null;
        reject(new Error('No se pudo cargar la verificación anti-bots.'));
      };
      document.head.appendChild(script);
    });
  }
  return turnstileScriptPromise;
};

export default function TurnstileWidget({ siteKey, action, resetKey, onToken }) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const onTokenRef = useRef(onToken);
  const previousResetKey = useRef(resetKey);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    let cancelled = false;
    loadTurnstile().then((turnstile) => {
      if (cancelled || !containerRef.current) return;
      widgetIdRef.current = turnstile.render(containerRef.current, {
        sitekey: siteKey,
        action,
        callback: (token) => {
          setError('');
          onTokenRef.current(token);
        },
        'expired-callback': () => onTokenRef.current(''),
        'error-callback': () => {
          onTokenRef.current('');
          setError('No se pudo completar la verificación. Intentá nuevamente.');
        },
      });
    }).catch((loadError) => {
      if (!cancelled) setError(loadError.message || 'No se pudo cargar la verificación anti-bots.');
    });
    return () => {
      cancelled = true;
      if (widgetIdRef.current !== null && window.turnstile) window.turnstile.remove(widgetIdRef.current);
      widgetIdRef.current = null;
      onTokenRef.current('');
    };
  }, [action, attempt, siteKey]);

  useEffect(() => {
    if (previousResetKey.current === resetKey) return;
    previousResetKey.current = resetKey;
    if (widgetIdRef.current !== null && window.turnstile) window.turnstile.reset(widgetIdRef.current);
  }, [resetKey]);

  return <div className="storefront-turnstile"><div ref={containerRef} />{error && <><p role="alert">{error}</p><button type="button" onClick={() => { setError(''); onTokenRef.current(''); setAttempt((current) => current + 1); }}>Reintentar verificación</button></>}</div>;
}
