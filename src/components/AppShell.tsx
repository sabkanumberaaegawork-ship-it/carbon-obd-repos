"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const LINKS = [
  { href: "/vehicles", label: "Vehicles" },
  { href: "/live", label: "Live Trip" },
  { href: "/dashboard", label: "Dashboard" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (!active || !data.user) return;
      setEmail(data.user.email ?? null);
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", data.user.id)
        .maybeSingle();
      if (active) setIsAdmin(Boolean(profile?.is_admin));
    })();

    return () => {
      active = false;
    };
  }, []);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-white text-black">
      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
          <Link href="/vehicles" className="flex items-center gap-2.5 font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-black text-sm">
              C
            </span>
            <span className="tracking-tight">CarbonOBD</span>
          </Link>

          <nav className="flex items-center gap-1 overflow-x-auto text-sm">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`whitespace-nowrap rounded-md px-3 py-2 transition ${
                  pathname.startsWith(link.href)
                    ? "bg-black text-white"
                    : "text-neutral-700 hover:bg-neutral-100"
                }`}
              >
                {link.label}
              </Link>
            ))}
            {isAdmin && (
              <Link
                href="/admin"
                className={`whitespace-nowrap rounded-md px-3 py-2 transition ${
                  pathname.startsWith("/admin")
                    ? "bg-black text-white"
                    : "text-neutral-700 hover:bg-neutral-100"
                }`}
              >
                Admin
              </Link>
            )}
          </nav>

          <div className="flex items-center gap-3">
            {email && (
              <span className="hidden max-w-40 truncate text-xs text-neutral-500 lg:block">
                {email}
              </span>
            )}
            <button
              type="button"
              onClick={signOut}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-700 transition hover:border-black hover:text-black"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
    </div>
  );
}
