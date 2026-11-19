import { NextResponse } from "next/server";
import { apiError, isFuelType } from "@/lib/api";
import { getCurrentUser, createClient } from "@/lib/supabase/server";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return apiError("Unauthorized", 401);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicles")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return apiError(error.message, 500);
  return NextResponse.json({ vehicles: data });
}

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

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const plate = typeof body.plate === "string" ? body.plate.trim() : "";
  const fuelType = body.fuel_type;

  if (!name || name.length > 80) return apiError("Enter a vehicle name.");
  if (!plate || plate.length > 30) return apiError("Enter a registration plate.");
  if (!isFuelType(fuelType)) return apiError("Choose petrol or diesel.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicles")
    .insert({
      user_id: user.id,
      name,
      plate,
      fuel_type: fuelType,
    })
    .select()
    .single();

  if (error) return apiError(error.message, 500);
  return NextResponse.json({ vehicle: data }, { status: 201 });
}
