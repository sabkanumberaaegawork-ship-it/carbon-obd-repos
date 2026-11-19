import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminClient } from "@/components/AdminClient";
import { getCurrentProfile } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  const profile = await getCurrentProfile();
  if (!profile?.is_admin) redirect("/dashboard");
  return <AdminClient />;
}
