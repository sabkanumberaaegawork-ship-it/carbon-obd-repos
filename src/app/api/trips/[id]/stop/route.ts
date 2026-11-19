import { NextResponse } from "next/server";
import { apiError, parseReadings } from "@/lib/api";
import { calculateEmissions } from "@/lib/emissions";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import {
  fetchAllReadings,
  getOwnedTrip,
  insertReadings,
} from "@/lib/trips";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return apiError("Unauthorized", 401);

  const { id } = await params;

  let body: { readings?: unknown } = {};
  try {
    const json = await request.json();
    if (json && typeof json === "object") {
      body = json as { readings?: unknown };
    }
  } catch {
    // An empty body is valid; the trip simply has no final buffered readings.
  }

  const parsed = parseReadings(body.readings ?? [], 500);
  if (parsed.error) return apiError(parsed.error);

  const supabase = await createClient();
  const trip = await getOwnedTrip(supabase, id, user.id);
  if (!trip) return apiError("Trip not found.", 404);

  if (trip.status === "completed") {
    return NextResponse.json({
      summary: {
        fuelLitres: trip.fuel_liters,
        co2Kg: trip.co2_kg,
        distanceKm: trip.distance_km,
        gPerKm: trip.g_per_km,
        warning: trip.reliability_warning,
      },
      alreadyCompleted: true,
    });
  }

  const fuelType = trip.vehicles?.fuel_type;
  if (!fuelType) return apiError("Vehicle fuel type is missing.", 500);

  try {
    if (parsed.readings.length > 0) {
      await insertReadings(supabase, id, user.id, parsed.readings);
    }

    const readings = await fetchAllReadings(supabase, id);
    const summary = calculateEmissions(readings, fuelType, {
      maxIntervalSeconds: 5,
    });
    const endedAt = new Date().toISOString();
    const durationSeconds = Math.max(
      0,
      Math.round((Date.parse(endedAt) - Date.parse(trip.started_at)) / 1000),
    );

    const { error } = await supabase
      .from("trips")
      .update({
        status: "completed",
        ended_at: endedAt,
        fuel_liters: summary.fuelLitres,
        co2_kg: summary.co2Kg,
        distance_km: summary.distanceKm,
        g_per_km: summary.gPerKm,
        duration_seconds: durationSeconds,
        reliability_warning: summary.warning,
      })
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) throw new Error(error.message);

    return NextResponse.json({
      summary,
      durationSeconds,
      readingCount: readings.length,
    });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Could not stop the trip.",
      500,
    );
  }
}
