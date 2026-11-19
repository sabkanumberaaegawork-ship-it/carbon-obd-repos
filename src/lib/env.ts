const FALLBACK_URL = "http://127.0.0.1:54321";
const FALLBACK_KEY = "local-anon-key";

/**
 * Supabase values are public by design. The fallbacks keep `next build` working
 * before .env.local has been created; configure real values for runtime use.
 */
export function getSupabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_URL;
}

export function getSupabaseAnonKey(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_KEY;
}

export function hasSupabaseConfig(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
