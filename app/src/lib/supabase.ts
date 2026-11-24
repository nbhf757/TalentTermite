import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Set in app/.env.local (dev) and in Netlify's environment (prod). The anon key is public by design; RLS protects data.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;
