export type FuelType = "petrol" | "diesel";
export type TripSource = "bluetooth" | "simulator";
export type TripStatus = "in_progress" | "completed";

export interface Profile {
  id: string;
  email: string | null;
  is_admin: boolean;
  created_at: string;
}

export interface Vehicle {
  id: string;
  user_id: string;
  name: string;
  plate: string;
  fuel_type: FuelType;
  created_at: string;
}

export interface Trip {
  id: string;
  user_id: string;
  vehicle_id: string;
  started_at: string;
  ended_at: string | null;
  status: TripStatus;
  source: TripSource;
  fuel_liters: number;
  co2_kg: number;
  distance_km: number;
  g_per_km: number;
  duration_seconds: number;
  reliability_warning: string | null;
  created_at: string;
}

export interface Reading {
  id?: string;
  trip_id?: string;
  user_id?: string;
  timestamp: string;
  maf: number | null;
  fuel_rate: number | null;
  speed: number | null;
  rpm: number | null;
}

export interface ReadingInput {
  timestamp: string;
  maf?: number | null;
  fuel_rate?: number | null;
  speed?: number | null;
  rpm?: number | null;
}

export interface ObdSnapshot {
  maf: number | null;
  fuel_rate: number | null;
  speed: number | null;
  rpm: number | null;
  supported: Record<"maf" | "fuelRate" | "speed" | "rpm", boolean>;
}

export interface VehicleSummary {
  name: string;
  plate: string;
  fuel_type: FuelType;
}

export interface TripWithVehicle extends Trip {
  vehicles: VehicleSummary | null;
}
