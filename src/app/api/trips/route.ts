import { NextResponse } from "next/server";
import { apiError, isTripSource } from "@/lib/api";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return apiError("Unauthorized", 401);

  let body: Record<string, unknown>;
  try {
    const json = await request.json();
    if (!json || typeof json !== "object") return apiError("Invalid JSON body");
    body = json as Record<string, unknown>;
  } catch {
    return apiError("Invalid JSON body");
  }

  const vehicleId = typeof body.vehicleId === "string" ? body.vehicleId : "";
  const source = body.source ?? "bluetooth";

  if (!vehicleId) return apiError("Choose a vehicle.");
  if (!isTripSource(source)) return apiError("Invalid trip source.");

  const supabase = await createClient();
  const { data: vehicle, error: vehicleError } = await supabase
    .from("vehicles")
    .select("id")
    .eq("id", vehicleId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (vehicleError) return apiError(vehicleError.message, 500);
  if (!vehicle) return apiError("Vehicle not found.", 404);

  const { data: trip, error } = await supabase
    .from("trips")
    .insert({
      user_id: user.id,
      vehicle_id: vehicleId,
      source,
      status: "in_progress",
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return apiError(error.message, 500);
  return NextResponse.json({ trip }, { status: 201 });
}
