"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { requestJson } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { FuelType, Vehicle } from "@/lib/types";
import { Badge, Card, EmptyState, PageHeader } from "@/components/Ui";

export function VehiclesClient() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [plate, setPlate] = useState("");
  const [fuelType, setFuelType] = useState<FuelType>("petrol");

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data, error: fetchError } = await supabase
      .from("vehicles")
      .select("*")
      .order("created_at", { ascending: false });

    if (fetchError) setError(fetchError.message);
    else setVehicles((data ?? []) as Vehicle[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addVehicle(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await requestJson<{ vehicle: Vehicle }>("/api/vehicles", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          plate: plate.trim(),
          fuel_type: fuelType,
        }),
      });
      setName("");
      setPlate("");
      setFuelType("petrol");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add vehicle.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Vehicles"
        description="Add the cars you want to track. Fuel type decides the CO₂ conversion."
        action={
          <Link
            href="/live"
            className="rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Start a trip →
          </Link>
        }
      />

      {error && (
        <div className="mb-6 rounded-lg border border-black bg-neutral-50 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card className="p-6">
          <h2 className="text-lg font-medium">Add vehicle</h2>
          <form onSubmit={addVehicle} className="mt-5 space-y-4">
            <div>
              <label htmlFor="name" className="mb-1.5 block text-sm font-medium">
                Name
              </label>
              <input
                id="name"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Daily driver"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 outline-none focus:border-black"
              />
            </div>
            <div>
              <label htmlFor="plate" className="mb-1.5 block text-sm font-medium">
                Registration plate
              </label>
              <input
                id="plate"
                required
                value={plate}
                onChange={(event) => setPlate(event.target.value)}
                placeholder="AB12 CDE"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 outline-none focus:border-black"
              />
            </div>
            <div>
              <span className="mb-1.5 block text-sm font-medium">Fuel type</span>
              <div className="grid grid-cols-2 gap-2">
                {(["petrol", "diesel"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setFuelType(type)}
                    className={`rounded-lg border px-3 py-2.5 text-sm capitalize transition ${
                      fuelType === type
                        ? "border-black bg-black text-white"
                        : "border-neutral-300 hover:border-black"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {saving ? "Adding…" : "Add vehicle"}
            </button>
          </form>
        </Card>

        <div>
          <h2 className="mb-4 text-sm font-medium text-neutral-600">
            Your vehicles ({vehicles.length})
          </h2>
          {loading ? (
            <Card className="p-6 text-sm text-neutral-500">Loading…</Card>
          ) : vehicles.length === 0 ? (
            <EmptyState
              title="No vehicles yet"
              description="Add your first vehicle to start recording trips and CO₂."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {vehicles.map((vehicle) => (
                <Card key={vehicle.id} className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-medium">{vehicle.name}</h3>
                      <p className="mt-0.5 font-mono text-sm text-neutral-600">
                        {vehicle.plate}
                      </p>
                    </div>
                    <Badge>{vehicle.fuel_type}</Badge>
                  </div>
                  <p className="mt-5 text-xs text-neutral-400">
                    Added {new Date(vehicle.created_at).toLocaleDateString()}
                  </p>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
