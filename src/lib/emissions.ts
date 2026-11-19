import type { FuelType } from "./types";

export const PETROL_CO2_KG_PER_LITRE = 2.31;
export const DIESEL_CO2_KG_PER_LITRE = 2.68;
export const PETROL_AFR = 14.7; // grams of air per gram of petrol
export const PETROL_DENSITY_G_PER_LITRE = 745;
export const DIESEL_FUEL_RATE_WARNING =
  "Diesel without fuel rate (PID 015E) is not reliable. CO₂ is under-reported.";

export interface EmissionReading {
  timestamp: string | number | Date;
  maf?: number | null;
  fuel_rate?: number | null;
  speed?: number | null;
  rpm?: number | null;
}

export interface EmissionsOptions {
  /** Cap a single interval, e.g. after a backgrounded tab. Default: no cap. */
  maxIntervalSeconds?: number;
}

export interface EmissionsResult {
  fuelLitres: number;
  co2Kg: number;
  distanceKm: number;
  gPerKm: number;
  sampledSeconds: number;
  fuelSampleCount: number;
  skippedFuelIntervals: number;
  warning: string | null;
}

function toMillis(value: string | number | Date): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return Date.parse(value);
}

function finite(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * The single source of truth for fuel, CO₂ and distance calculations.
 *
 * Readings are sorted by timestamp. For each consecutive pair, the interval
 * `dt` is the time between them and the later reading supplies the values.
 * A missing/unsupported PID is simply skipped for that interval.
 */
export function calculateEmissions(
  readings: EmissionReading[],
  fuelType: FuelType,
  options: EmissionsOptions = {},
): EmissionsResult {
  const maxDt = options.maxIntervalSeconds ?? Number.POSITIVE_INFINITY;
  const sorted = [...readings].sort(
    (a, b) => toMillis(a.timestamp) - toMillis(b.timestamp),
  );

  let fuelLitres = 0;
  let distanceKm = 0;
  let sampledSeconds = 0;
  let fuelSampleCount = 0;
  let skippedFuelIntervals = 0;
  let warning: string | null = null;

  for (let i = 1; i < sorted.length; i += 1) {
    const previous = sorted[i - 1];
    const current = sorted[i];
    const start = toMillis(previous.timestamp);
    const end = toMillis(current.timestamp);

    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;

    const rawDt = (end - start) / 1000;
    if (!Number.isFinite(rawDt) || rawDt <= 0) continue;

    const dt = Math.min(rawDt, maxDt);
    sampledSeconds += dt;

    const speed = finite(current.speed);
    if (speed !== null && speed >= 0) {
      distanceKm += (speed * dt) / 3600;
    }

    const fuelRate = finite(current.fuel_rate);
    let litresThisInterval: number | null = null;

    if (fuelRate !== null && fuelRate >= 0) {
      // PID 015E is already in litres/hour.
      litresThisInterval = (fuelRate * dt) / 3600;
    } else if (fuelType === "petrol") {
      const maf = finite(current.maf);
      if (maf !== null && maf >= 0) {
        const gramsPerSecond = maf / PETROL_AFR;
        litresThisInterval =
          (gramsPerSecond * dt) / PETROL_DENSITY_G_PER_LITRE;
      }
    }

    if (litresThisInterval !== null) {
      fuelLitres += litresThisInterval;
      fuelSampleCount += 1;
    } else {
      skippedFuelIntervals += 1;
      if (fuelType === "diesel") warning = DIESEL_FUEL_RATE_WARNING;
    }
  }

  const co2Factor =
    fuelType === "diesel"
      ? DIESEL_CO2_KG_PER_LITRE
      : PETROL_CO2_KG_PER_LITRE;
  const co2Kg = fuelLitres * co2Factor;
  const gPerKm = distanceKm > 0 ? (co2Kg * 1000) / distanceKm : 0;

  return {
    fuelLitres,
    co2Kg,
    distanceKm,
    gPerKm,
    sampledSeconds,
    fuelSampleCount,
    skippedFuelIntervals,
    warning,
  };
}
