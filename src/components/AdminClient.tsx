"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, EmptyState, Metric, PageHeader } from "@/components/Ui";
import { dayKey, formatDateTime, formatNumber } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { Profile, TripWithVehicle, Vehicle } from "@/lib/types";

export function AdminClient() {
  const [trips, setTrips] = useState<TripWithVehicle[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    void (async () => {
      const [tripsResult, vehiclesResult, profilesResult] = await Promise.all([
        supabase
          .from("trips")
          .select("*, vehicles(name, plate, fuel_type)")
          .order("started_at", { ascending: false }),
        supabase.from("vehicles").select("id, name, plate, fuel_type, user_id"),
        supabase.from("profiles").select("id, email, is_admin, created_at"),
      ]);

      if (!active) return;
      const firstError =
        tripsResult.error ?? vehiclesResult.error ?? profilesResult.error;
      if (firstError) setError(firstError.message);
      else {
        setTrips((tripsResult.data ?? []) as TripWithVehicle[]);
        setVehicles((vehiclesResult.data ?? []) as Vehicle[]);
        setProfiles((profilesResult.data ?? []) as Profile[]);
      }
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, []);

  const profileById = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile])),
    [profiles],
  );

  const completed = useMemo(
    () => trips.filter((trip) => trip.status === "completed"),
    [trips],
  );

  const totals = useMemo(() => {
    const co2 = completed.reduce((sum, trip) => sum + (trip.co2_kg || 0), 0);
    return {
      co2,
      trips: completed.length,
      allTrips: trips.length,
      vehicles: vehicles.length,
      users: profiles.length,
    };
  }, [completed, profiles.length, trips.length, vehicles.length]);

  const chartData = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const trip of completed) {
      const key = dayKey(trip.started_at);
      byDay.set(key, (byDay.get(key) ?? 0) + (trip.co2_kg || 0));
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, co2]) => ({ day, co2: Number(co2.toFixed(4)) }));
  }, [completed]);

  const byVehicle = useMemo(() => {
    const map = new Map<string, { name: string; plate: string; trips: number; co2: number }>();
    for (const vehicle of vehicles) {
      map.set(vehicle.id, { name: vehicle.name, plate: vehicle.plate, trips: 0, co2: 0 });
    }
    for (const trip of completed) {
      const entry = map.get(trip.vehicle_id) ?? {
        name: trip.vehicles?.name ?? "Unknown",
        plate: trip.vehicles?.plate ?? "",
        trips: 0,
        co2: 0,
      };
      entry.trips += 1;
      entry.co2 += trip.co2_kg || 0;
      map.set(trip.vehicle_id, entry);
    }
    return [...map.entries()]
      .map(([id, entry]) => ({ id, ...entry }))
      .sort((a, b) => b.co2 - a.co2);
  }, [completed, vehicles]);

  if (loading) return <Card className="p-8 text-sm text-neutral-500">Loading admin data…</Card>;

  return (
    <>
      <PageHeader
        title="Admin"
        description="Fleet-wide CO₂ and trip totals across every user and vehicle."
      />

      {error && (
        <div className="mb-6 rounded-lg border border-black bg-neutral-50 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Total CO₂" value={formatNumber(totals.co2, 2)} unit="kg" />
        <Metric label="Completed trips" value={String(totals.trips)} />
        <Metric label="Vehicles" value={String(totals.vehicles)} />
        <Metric label="Users" value={String(totals.users)} />
      </div>

      <Card className="mt-6 p-6">
        <h2 className="mb-5 text-lg font-medium">CO₂ per day · all vehicles</h2>
        {chartData.length === 0 ? (
          <EmptyState title="No data yet" description="Completed trips will appear here." />
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                <CartesianGrid stroke="#e5e5e5" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: "#000", fontSize: 12 }} tickLine={false} />
                <YAxis width={48} tick={{ fill: "#666", fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(value) => [`${Number(value).toFixed(3)} kg`, "CO₂"]} />
                <Bar dataKey="co2" fill="#000000" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-4 text-lg font-medium">By vehicle</h2>
          <Card className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-neutral-200 text-xs uppercase text-neutral-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Vehicle</th>
                  <th className="px-5 py-3 text-right font-medium">Trips</th>
                  <th className="px-5 py-3 text-right font-medium">CO₂</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {byVehicle.map((vehicle) => (
                  <tr key={vehicle.id}>
                    <td className="px-5 py-3">
                      <span className="font-medium">{vehicle.name}</span>
                      <span className="ml-2 text-xs text-neutral-500">{vehicle.plate}</span>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">{vehicle.trips}</td>
                    <td className="px-5 py-3 text-right font-medium tabular-nums">
                      {formatNumber(vehicle.co2, 3)} kg
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>

        <div>
          <h2 className="mb-4 text-lg font-medium">Recent trips</h2>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="border-b border-neutral-200 text-xs uppercase text-neutral-500">
                <tr>
                  <th className="px-5 py-3 font-medium">User</th>
                  <th className="px-5 py-3 font-medium">Vehicle</th>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 text-right font-medium">CO₂</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {trips.slice(0, 20).map((trip) => (
                  <tr key={trip.id}>
                    <td className="px-5 py-3 text-neutral-600">
                      {profileById.get(trip.user_id)?.email ?? trip.user_id.slice(0, 8)}
                    </td>
                    <td className="px-5 py-3">{trip.vehicles?.name ?? "Unknown"}</td>
                    <td className="px-5 py-3 text-neutral-600">
                      {formatDateTime(trip.started_at)}
                    </td>
                    <td className="px-5 py-3 text-right font-medium tabular-nums">
                      {formatNumber(trip.co2_kg, 3)} kg
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <p className="mt-3 text-xs text-neutral-500">
            {totals.allTrips} trips total · individual trip details remain in each owner&apos;s{" "}
            <Link href="/dashboard" className="underline">
              dashboard
            </Link>
            .
          </p>
        </div>
      </div>
    </>
  );
}
