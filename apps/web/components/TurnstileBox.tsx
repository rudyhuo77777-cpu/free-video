'use client';
import { useEffect, useRef } from 'react';

declare global { interface Window { turnstile?: { render: (el: HTMLElement, opts: any) => string; reset: (id?: string) => void; }; } }

export function TurnstileBox({ onToken, resetKey = 0 }: { onToken: (token: string) => void; resetKey?: number }) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const ref = useRef<HTMLDivElement | null>(null);
  const widgetId = useRef<string | null>(null);
  useEffect(() => {
    if (!siteKey || !ref.current) return;
    let cancelled = false;
    const render = () => {
      if (cancelled || !ref.current || !window.turnstile || ref.current.dataset.rendered) return;
      ref.current.dataset.rendered = '1';
      widgetId.current = window.turnstile.render(ref.current, {
        sitekey: siteKey,
        callback: (token: string) => onToken(token),
        'expired-callback': () => onToken(''),
        'error-callback': () => onToken('')
      });
    };
    const existing = document.querySelector<HTMLScriptElement>('script[data-auria-turnstile]');
    if (existing) { existing.addEventListener('load', render, { once: true }); render(); }
    else {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true; script.defer = true; script.dataset.auriaTurnstile = '1';
      script.addEventListener('load', render, { once: true }); document.head.appendChild(script);
    }
    return () => { cancelled = true; };
  }, [siteKey, onToken]);
  useEffect(() => {
    if (resetKey > 0 && widgetId.current && window.turnstile) {
      window.turnstile.reset(widgetId.current);
      onToken('');
    }
  }, [resetKey, onToken]);
  if (!siteKey) return null;
  return <div ref={ref} style={{ marginTop: 12, minHeight: 65 }} aria-label="Verifikasi anti-bot" />;
}
