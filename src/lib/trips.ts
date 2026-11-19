import type { SupabaseClient } from "@supabase/supabase-js";
import type { FuelType, ReadingInput, Trip } from "./types";

type Client = SupabaseClient<any, "public", any>;

export interface OwnedTrip extends Trip {
  vehicles: { fuel_type: FuelType } | null;
}

export async function getOwnedTrip(
  supabase: Client,
  tripId: string,
  userId: string,
): Promise<OwnedTrip | null> {
  const { data, error } = await supabase
    .from("trips")
    .select("*, vehicles(fuel_type)")
    .eq("id", tripId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return data as OwnedTrip;
}

export async function fetchAllReadings(
  supabase: Client,
  tripId: string,
): Promise<ReadingInput[]> {
  const all: ReadingInput[] = [];
  const pageSize = 1000;
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("readings")
      .select("timestamp, maf, fuel_rate, speed, rpm")
      .eq("trip_id", tripId)
      .order("timestamp", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);
    const rows = (data ?? []) as ReadingInput[];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

export async function insertReadings(
  supabase: Client,
  tripId: string,
  userId: string,
  readings: ReadingInput[],
): Promise<void> {
  for (let i = 0; i < readings.length; i += 500) {
    const chunk = readings.slice(i, i + 500).map((reading) => ({
      trip_id: tripId,
      user_id: userId,
      timestamp: reading.timestamp,
      maf: reading.maf ?? null,
      fuel_rate: reading.fuel_rate ?? null,
      speed: reading.speed ?? null,
      rpm: reading.rpm ?? null,
    }));

    const { error } = await supabase.from("readings").insert(chunk);
    if (error) throw new Error(error.message);
  }
}
