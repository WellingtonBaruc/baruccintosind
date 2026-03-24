import { useEffect, useRef, useState } from 'react';

declare const __APP_VERSION__: string;

export function useVersionCheck(intervalMs = 60_000) {
  const [hasUpdate, setHasUpdate] = useState(false);
  const checkedRef = useRef(false);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        const remote = String(data.version || '');
        const local = String(typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '');
        if (remote && local && remote !== local && !checkedRef.current) {
          setHasUpdate(true);
        }
      } catch {
        // silently ignore fetch errors
      }
    };

    // First check after 5s, then every intervalMs
    const timeout = setTimeout(check, 5_000);
    const interval = setInterval(check, intervalMs);

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [intervalMs]);

  const reload = () => window.location.reload();

  return { hasUpdate, reload };
}

export function getAppVersion(): string {
  try {
    return typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
  } catch {
    return 'dev';
  }
}
