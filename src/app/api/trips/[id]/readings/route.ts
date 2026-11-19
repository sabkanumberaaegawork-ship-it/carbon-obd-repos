import { NextResponse } from "next/server";
import { apiError, parseReadings } from "@/lib/api";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getOwnedTrip, insertReadings } from "@/lib/trips";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return apiError("Unauthorized", 401);

  const { id } = await params;

  let body: { readings?: unknown };
  try {
    const json = await request.json();
    if (!json || typeof json !== "object") return apiError("Invalid JSON body");
    body = json as { readings?: unknown };
  } catch {
    return apiError("Invalid JSON body");
  }

  const parsed = parseReadings(body.readings);
  if (parsed.error) return apiError(parsed.error);
  const readings = parsed.readings;

  if (readings.length === 0) {
    return NextResponse.json({ saved: 0 });
  }

  const supabase = await createClient();
  const trip = await getOwnedTrip(supabase, id, user.id);
  if (!trip) return apiError("Trip not found.", 404);
  if (trip.status !== "in_progress") {
    return apiError("Trip has already ended.", 409);
  }

  try {
    await insertReadings(supabase, id, user.id, readings);
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Could not save readings.",
      500,
    );
  }

  return NextResponse.json({ saved: readings.length }, { status: 201 });
}
