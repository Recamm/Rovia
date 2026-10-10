import rovia from "./supabase-public.json";

type PublicEnvironment = {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_SUPABASE_ANON_KEY?: string;
};

// Public client configuration. Authorization remains in RLS.
// Custom projects must supply both overrides, never a mixed pair of projects.
export function resolveSupabaseConfig(env: PublicEnvironment) {
  const url = env.VITE_SUPABASE_URL?.trim();
  const key = (
    env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY
  )?.trim();
  if (url || key) return url && key ? { url, key } : null;
  return { url: rovia.url, key: rovia.publishableKey };
}
