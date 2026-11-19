"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, Metric, PageHeader, Warning } from "@/components/Ui";
import { calculateEmissions } from "@/lib/emissions";
import { formatDateTime, formatDuration, formatNumber } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { Reading, TripWithVehicle } from "@/lib/types";

export function TripDetailClient({ id }: { id: string }) {
  const [trip, setTrip] = useState<TripWithVehicle | null>(null);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    void (async () => {
      const [tripResult, readingsResult] = await Promise.all([
        supabase
          .from("trips")
          .select("*, vehicles(name, plate, fuel_type)")
          .eq("id", id)
          .maybeSingle(),
        supabase
          .from("readings")
          .select("id, timestamp, maf, fuel_rate, speed, rpm")
          .eq("trip_id", id)
          .order("timestamp", { ascending: true })
          .limit(5000),
      ]);

      if (!active) return;
      if (tripResult.error) setError(tripResult.error.message);
      else if (!tripResult.data) setError("Trip not found.");
      else setTrip(tripResult.data as TripWithVehicle);

      if (readingsResult.error) setError(readingsResult.error.message);
      else setReadings((readingsResult.data ?? []) as Reading[]);
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [id]);

  const recalculated = useMemo(() => {
    if (!trip) return null;
    return calculateEmissions(readings, trip.vehicles?.fuel_type ?? "petrol", {
      maxIntervalSeconds: 5,
    });
  }, [readings, trip]);

  const chartData = useMemo(() => {
    const step = Math.max(1, Math.ceil(readings.length / 300));
    return readings
      .filter((_, index) => index % step === 0)
      .map((reading) => ({
        time: new Date(reading.timestamp).toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
        speed: reading.speed ?? 0,
        rpm: reading.rpm ?? 0,
        maf: reading.maf ?? 0,
      }));
  }, [readings]);

  if (loading) return <Card className="p-8 text-sm text-neutral-500">Loading trip…</Card>;

  if (error || !trip) {
    return (
      <>
        <PageHeader title="Trip detail" />
        <div className="rounded-lg border border-black bg-neutral-50 px-4 py-3 text-sm">
          {error ?? "Trip not found."}
        </div>
        <Link href="/dashboard" className="mt-4 inline-block text-sm underline">
          Back to dashboard
        </Link>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={`${trip.vehicles?.name ?? "Vehicle"} trip`}
        description={`${formatDateTime(trip.started_at)} · ${trip.vehicles?.plate ?? ""} · ${trip.source}`}
        action={
          <Link href="/dashboard" className="text-sm underline underline-offset-2">
            ← Back to dashboard
          </Link>
        }
      />

      {trip.reliability_warning && (
        <div className="mb-6">
          <Warning>{trip.reliability_warning}</Warning>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="CO₂" value={formatNumber(trip.co2_kg, 3)} unit="kg" />
        <Metric label="Fuel" value={formatNumber(trip.fuel_liters)} unit="L" />
        <Metric label="Distance" value={formatNumber(trip.distance_km, 3)} unit="km" />
        <Metric label="Intensity" value={formatNumber(trip.g_per_km, 0)} unit="g/km" />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Duration</p>
          <p className="mt-1 text-lg font-medium tabular-nums">
            {formatDuration(trip.duration_seconds)}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Readings</p>
          <p className="mt-1 text-lg font-medium tabular-nums">{readings.length}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Recalculated CO₂</p>
          <p className="mt-1 text-lg font-medium tabular-nums">
            {formatNumber(recalculated?.co2Kg, 3)} kg
          </p>
        </Card>
      </div>

      <Card className="mt-6 p-6">
        <h2 className="mb-5 text-lg font-medium">Speed, RPM and MAF</h2>
        {chartData.length === 0 ? (
          <p className="py-12 text-center text-sm text-neutral-500">No readings recorded.</p>
        ) : (
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                <CartesianGrid stroke="#e5e5e5" vertical={false} />
                <XAxis dataKey="time" tick={{ fill: "#666", fontSize: 11 }} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fill: "#666", fontSize: 11 }} width={42} />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fill: "#666", fontSize: 11 }}
                  width={42}
                />
                <Tooltip />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="speed"
                  name="Speed (km/h)"
                  stroke="#000000"
                  dot={false}
                  strokeWidth={2}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="rpm"
                  name="RPM"
                  stroke="#737373"
                  dot={false}
                  strokeWidth={1.5}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="maf"
                  name="MAF (g/s)"
                  stroke="#a3a3a3"
                  dot={false}
                  strokeWidth={1.5}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {readings.length > 0 && (
        <Card className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-5 py-3 font-medium">Time</th>
                <th className="px-5 py-3 text-right font-medium">Speed</th>
                <th className="px-5 py-3 text-right font-medium">RPM</th>
                <th className="px-5 py-3 text-right font-medium">MAF</th>
                <th className="px-5 py-3 text-right font-medium">Fuel rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {readings.slice(-50).reverse().map((reading) => (
                <tr key={reading.id ?? reading.timestamp}>
                  <td className="px-5 py-2.5 text-neutral-600">
                    {new Date(reading.timestamp).toLocaleTimeString()}
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums">
                    {formatNumber(reading.speed, 0)}
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums">
                    {formatNumber(reading.rpm, 0)}
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums">
                    {formatNumber(reading.maf, 1)}
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums">
                    {formatNumber(reading.fuel_rate, 2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
