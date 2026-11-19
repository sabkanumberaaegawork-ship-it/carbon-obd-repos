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
import { Card, EmptyState, Metric, PageHeader, Warning } from "@/components/Ui";
import { dayKey, formatDateTime, formatDuration, formatNumber } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { TripWithVehicle } from "@/lib/types";

export function DashboardClient() {
  const [trips, setTrips] = useState<TripWithVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    void (async () => {
      const { data, error: fetchError } = await supabase
        .from("trips")
        .select("*, vehicles(name, plate, fuel_type)")
        .order("started_at", { ascending: false });
      if (!active) return;
      if (fetchError) setError(fetchError.message);
      else setTrips((data ?? []) as TripWithVehicle[]);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const completed = useMemo(
    () => trips.filter((trip) => trip.status === "completed"),
    [trips],
  );

  const totals = useMemo(() => {
    const co2 = completed.reduce((sum, trip) => sum + (trip.co2_kg || 0), 0);
    const distance = completed.reduce((sum, trip) => sum + (trip.distance_km || 0), 0);
    return {
      co2,
      distance,
      trips: completed.length,
      gPerKm: distance > 0 ? (co2 * 1000) / distance : 0,
    };
  }, [completed]);

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

  if (loading) return <Card className="p-8 text-sm text-neutral-500">Loading dashboard…</Card>;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Every completed trip, its CO₂ and its intensity per kilometre."
        action={
          <Link
            href="/live"
            className="rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800"
          >
            New trip
          </Link>
        }
      />

      {error && (
        <div className="mb-6 rounded-lg border border-black bg-neutral-50 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Total CO₂" value={formatNumber(totals.co2, 2)} unit="kg" />
        <Metric label="Trips" value={String(totals.trips)} />
        <Metric label="Distance" value={formatNumber(totals.distance, 1)} unit="km" />
        <Metric label="Average" value={formatNumber(totals.gPerKm, 0)} unit="g/km" />
      </div>

      <Card className="mt-6 p-6">
        <h2 className="mb-5 text-lg font-medium">CO₂ per day</h2>
        {chartData.length === 0 ? (
          <p className="py-12 text-center text-sm text-neutral-500">No completed trips yet.</p>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                <CartesianGrid stroke="#e5e5e5" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: "#000", fontSize: 12 }} tickLine={false} />
                <YAxis
                  tick={{ fill: "#666", fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                />
                <Tooltip
                  cursor={{ fill: "#f5f5f5" }}
                  formatter={(value) => [`${Number(value).toFixed(3)} kg`, "CO₂"]}
                />
                <Bar dataKey="co2" fill="#000000" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <div className="mt-8">
        <h2 className="mb-4 text-lg font-medium">Trips</h2>
        {trips.length === 0 ? (
          <EmptyState
            title="No trips recorded"
            description="Start a live trip to see it appear here."
            action={
              <Link
                href="/live"
                className="inline-block rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white"
              >
                Start a trip
              </Link>
            }
          />
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Vehicle</th>
                  <th className="px-5 py-3 font-medium">Started</th>
                  <th className="px-5 py-3 font-medium">Duration</th>
                  <th className="px-5 py-3 text-right font-medium">Distance</th>
                  <th className="px-5 py-3 text-right font-medium">CO₂</th>
                  <th className="px-5 py-3 text-right font-medium">g/km</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {trips.map((trip) => (
                  <tr key={trip.id} className="hover:bg-neutral-50">
                    <td className="px-5 py-3">
                      <span className="font-medium">{trip.vehicles?.name ?? "Unknown"}</span>
                      <span className="ml-2 text-xs text-neutral-500">
                        {trip.vehicles?.plate ?? ""}
                      </span>
                      {trip.status === "in_progress" && (
                        <span className="ml-2 rounded-full border border-neutral-300 px-2 py-0.5 text-xs">
                          live
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-neutral-600">
                      {formatDateTime(trip.started_at)}
                    </td>
                    <td className="px-5 py-3 tabular-nums text-neutral-600">
                      {formatDuration(trip.duration_seconds)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {formatNumber(trip.distance_km, 2)} km
                    </td>
                    <td className="px-5 py-3 text-right font-medium tabular-nums">
                      {formatNumber(trip.co2_kg, 3)} kg
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {formatNumber(trip.g_per_km, 0)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/dashboard/trips/${trip.id}`}
                        className="text-sm underline underline-offset-2"
                      >
                        Details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {completed.some((trip) => trip.reliability_warning) && (
          <div className="mt-4">
            <Warning>
              Some trips are missing fuel-rate data. Their CO₂ figures are estimates or
              under-reported.
            </Warning>
          </div>
        )}
      </div>
    </>
  );
}
