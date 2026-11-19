import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";
import {
  getSupabaseAnonKey,
  getSupabaseUrl,
  hasSupabaseConfig,
} from "@/lib/env";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component. Middleware refreshes the session.
        }
      },
    },
  });
}

export async function getCurrentUser(): Promise<User | null> {
  if (!hasSupabaseConfig()) return null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user ?? null;
  } catch {
    return null;
  }
}

export async function getCurrentProfile() {
  if (!hasSupabaseConfig()) return null;
  const user = await getCurrentUser();
  if (!user) return null;

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("profiles")
      .select("id, email, is_admin, created_at")
      .eq("id", user.id)
      .maybeSingle();
    return data as
      | { id: string; email: string | null; is_admin: boolean; created_at: string }
      | null;
  } catch {
    return null;
  }
}
