import { NextResponse } from "next/server";
import type { FuelType, ReadingInput, TripSource } from "./types";

export function apiError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function isFuelType(value: unknown): value is FuelType {
  return value === "petrol" || value === "diesel";
}

export function isTripSource(value: unknown): value is TripSource {
  return value === "bluetooth" || value === "simulator";
}

export function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

export function asTimestamp(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const millis =
    typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(millis)) return null;
  return new Date(millis).toISOString();
}

export function parseReadings(
  value: unknown,
  max = 500,
): { readings: ReadingInput[]; error?: string } {
  if (!Array.isArray(value)) {
    return { readings: [], error: "readings must be an array." };
  }
  if (value.length > max) {
    return { readings: [], error: "Batch too large." };
  }

  const readings: ReadingInput[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      return { readings: [], error: "Invalid reading." };
    }
    const raw = item as Record<string, unknown>;
    const timestamp = asTimestamp(raw.timestamp);
    if (!timestamp) {
      return { readings: [], error: "Invalid reading timestamp." };
    }
    readings.push({
      timestamp,
      maf: asNullableNumber(raw.maf),
      fuel_rate: asNullableNumber(raw.fuel_rate),
      speed: asNullableNumber(raw.speed),
      rpm: asNullableNumber(raw.rpm),
    });
  }

  return { readings };
}
