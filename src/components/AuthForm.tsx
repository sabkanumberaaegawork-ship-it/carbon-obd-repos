"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { hasSupabaseConfig } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";

const CONFIG_ERROR =
  "Supabase is not configured. Copy .env.local.example to .env.local, add your project URL and anon key, then restart the dev server.";

export function AuthForm({ next = "/vehicles" }: { next?: string }) {
  const router = useRouter();
  const configured = hasSupabaseConfig();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!configured) {
      setError(CONFIG_ERROR);
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    try {
      if (mode === "signin") {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (authError) throw authError;
        router.push(next);
        router.refresh();
      } else {
        const { data, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/login` },
        });
        if (authError) throw authError;
        if (data.session) {
          router.push(next);
          router.refresh();
        } else {
          setMessage("Check your email to confirm your account, then sign in.");
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border-2 border-black text-xl font-bold">
            C
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">CarbonOBD</h1>
          <p className="mt-2 text-sm text-neutral-600">
            Fuel, CO₂ and distance from your car.
          </p>
        </div>

        <div className="mb-6 grid grid-cols-2 rounded-lg border border-neutral-300 p-1 text-sm">
          {(["signin", "signup"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setMode(value);
                setError(null);
                setMessage(null);
              }}
              className={`rounded-md py-2 font-medium transition ${
                mode === value ? "bg-black text-white" : "text-black hover:bg-neutral-100"
              }`}
            >
              {value === "signin" ? "Sign in" : "Sign up"}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 outline-none focus:border-black"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 outline-none focus:border-black"
              placeholder="At least 6 characters"
            />
          </div>

          {!configured && (
            <p className="rounded-lg border border-black bg-neutral-50 px-3 py-2 text-sm">
              {CONFIG_ERROR}
            </p>
          )}
          {error && (
            <p className="rounded-lg border border-black bg-neutral-50 px-3 py-2 text-sm">
              {error}
            </p>
          )}
          {message && (
            <p className="rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-black px-4 py-3 font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50"
          >
            {loading
              ? "Please wait…"
              : mode === "signin"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>
      </div>
    </main>
  );
}
