import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();
  redirect(user ? "/vehicles" : "/login");
}
