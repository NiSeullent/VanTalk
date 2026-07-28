import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  || import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;

/** VanTalk requires Supabase for all data + storage. */
export const supabaseConfigured = Boolean(url && key);

if (!supabaseConfigured) {
  console.error('[vantalk] VITE_SUPABASE_URL / publishable key required — Firestore is disabled');
}

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url!, key!, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  : null;

/** Edge Function base that proxies to AWS Auth API Gateway. */
export function supabaseAwsProxyBase(): string {
  if (!url) return '';
  return `${url.replace(/\/$/, '')}/functions/v1/aws-proxy`;
}

export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error('supabase_required');
  return supabase;
}
