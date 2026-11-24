// FieldRoutes customer portal link (app_settings.customer_portal.url). Card customers enter their card there.
import { useEffect, useState } from 'react';
import { supabase } from './supabase';

const KEY = 'talent.portalUrl.v1';
const cached = () => { try { return localStorage.getItem(KEY) || null; } catch { return null; } };

export function usePortalUrl(): string | null {
  const [url, setUrl] = useState<string | null>(cached);
  useEffect(() => {
    let live = true;
    supabase?.from('app_settings').select('value').eq('key', 'customer_portal').maybeSingle().then(({ data }) => {
      const u = (data?.value as { url?: string | null } | undefined)?.url;
      const v = typeof u === 'string' && /^https:\/\//.test(u) ? u : null;
      if (!live) return;
      setUrl(v);
      try { if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch { /* private mode */ }
    });
    return () => { live = false; };
  }, []);
  return url;
}

/** The portal's "Get Login Info" page, where a customer without a login gets a reset code by text. */
export const portalForgotUrl = (portal: string) => { try { return new URL('/forgotPassword', portal).toString(); } catch { return portal; } };
