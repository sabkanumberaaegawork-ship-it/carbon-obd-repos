"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Metric, PageHeader, Warning } from "@/components/Ui";
import { calculateEmissions, type EmissionsResult } from "@/lib/emissions";
import { formatDuration, formatNumber, requestJson } from "@/lib/format";
import { Elm327BluetoothClient } from "@/lib/obd";
import { TripSimulator } from "@/lib/simulator";
import { createClient } from "@/lib/supabase/client";
import type {
  FuelType,
  ObdSnapshot,
  ReadingInput,
  Trip,
  TripSource,
  Vehicle,
} from "@/lib/types";

const EMPTY_SNAPSHOT: ObdSnapshot = {
  maf: null,
  fuel_rate: null,
  speed: null,
  rpm: null,
  supported: { maf: false, fuelRate: false, speed: false, rpm: false },
};

interface StopResponse {
  summary: {
    fuelLitres: number;
    co2Kg: number;
    distanceKm: number;
    gPerKm: number;
    warning: string | null;
  };
  durationSeconds: number;
  readingCount: number;
  alreadyCompleted?: boolean;
}

export function LiveTripClient() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [simulator, setSimulator] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [live, setLive] = useState<ObdSnapshot>(EMPTY_SNAPSHOT);
  const [totals, setTotals] = useState<EmissionsResult | null>(null);
  const [summary, setSummary] = useState<StopResponse | null>(null);
  const [savedTripId, setSavedTripId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Idle");

  const obdRef = useRef<Elm327BluetoothClient | null>(null);
  const simulatorRef = useRef<TripSimulator | null>(null);
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const busyRef = useRef(false);
  const runningRef = useRef(false);
  const tripIdRef = useRef<string | null>(null);
  const fuelTypeRef = useRef<FuelType>("petrol");
  const sourceRef = useRef<TripSource>("bluetooth");
  const readingsRef = useRef<ReadingInput[]>([]);
  const pendingRef = useRef<ReadingInput[]>([]);
  const flushingRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    void (async () => {
      const { data, error: fetchError } = await supabase
        .from("vehicles")
        .select("*")
        .order("created_at", { ascending: false });
      if (!active) return;
      if (fetchError) setError(fetchError.message);
      const list = (data ?? []) as Vehicle[];
      setVehicles(list);
      if (list.length > 0) setVehicleId((current) => current || list[0].id);
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (tickTimerRef.current) clearInterval(tickTimerRef.current);
      obdRef.current?.disconnect();
    };
  }, []);

  const flush = useCallback(async () => {
    if (flushingRef.current) return flushingRef.current;
    const tripId = tripIdRef.current;
    if (!tripId || pendingRef.current.length === 0) return;

    const batch = pendingRef.current.splice(0);
    const promise = requestJson<{ saved: number }>(
      `/api/trips/${tripId}/readings`,
      {
        method: "POST",
        body: JSON.stringify({ readings: batch }),
      },
    )
      .then(() => undefined)
      .catch((caught) => {
        pendingRef.current = [...batch, ...pendingRef.current];
        throw caught;
      })
      .finally(() => {
        flushingRef.current = null;
      });

    flushingRef.current = promise;
    return promise;
  }, []);

  const tick = useCallback(async () => {
    if (!runningRef.current || busyRef.current) return;
    busyRef.current = true;

    try {
      let snapshot: ObdSnapshot;

      if (simulatorRef.current) {
        const reading = simulatorRef.current.next();
        snapshot = {
          maf: reading.maf ?? null,
          fuel_rate: reading.fuel_rate ?? null,
          speed: reading.speed ?? null,
          rpm: reading.rpm ?? null,
          supported: { maf: true, fuelRate: true, speed: true, rpm: true },
        };
      } else if (obdRef.current?.isConnected) {
        snapshot = await obdRef.current.readSnapshot();
      } else {
        throw new Error("OBD adapter is not connected.");
      }

      const reading: ReadingInput = {
        timestamp: new Date().toISOString(),
        maf: snapshot.maf,
        fuel_rate: snapshot.fuel_rate,
        speed: snapshot.speed,
        rpm: snapshot.rpm,
      };

      readingsRef.current.push(reading);
      pendingRef.current.push(reading);
      setLive(snapshot);
      setTotals(calculateEmissions(readingsRef.current, fuelTypeRef.current));
      setStatus(simulatorRef.current ? "Simulating readings" : "Reading OBD-II");

      if (pendingRef.current.length >= 5) {
        void flush().catch((caught) => {
          setError(caught instanceof Error ? caught.message : "Could not save readings.");
        });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read OBD data.");
    } finally {
      busyRef.current = false;
    }
  }, [flush]);

  async function connect() {
    setConnecting(true);
    setError(null);
    try {
      if (!obdRef.current) obdRef.current = new Elm327BluetoothClient();
      await obdRef.current.connect();
      setConnected(true);
      setStatus("OBD adapter connected");
    } catch (caught) {
      setConnected(false);
      setError(caught instanceof Error ? caught.message : "Could not connect.");
    } finally {
      setConnecting(false);
    }
  }

  function disconnect() {
    obdRef.current?.disconnect();
    obdRef.current = null;
    setConnected(false);
    setLive(EMPTY_SNAPSHOT);
    setStatus("OBD adapter disconnected");
  }

  async function startTrip() {
    setError(null);
    const vehicle = vehicles.find((item) => item.id === vehicleId);
    if (!vehicle) {
      setError("Add and select a vehicle first.");
      return;
    }
    if (!simulator && !connected) {
      setError("Connect an OBD adapter or turn on Simulator mode.");
      return;
    }

    const source: TripSource = simulator ? "simulator" : "bluetooth";
    try {
      const { trip } = await requestJson<{ trip: Trip }>("/api/trips", {
        method: "POST",
        body: JSON.stringify({ vehicleId: vehicle.id, source }),
      });

      tripIdRef.current = trip.id;
      fuelTypeRef.current = vehicle.fuel_type;
      sourceRef.current = source;
      readingsRef.current = [];
      pendingRef.current = [];
      simulatorRef.current = simulator ? new TripSimulator() : null;
      setSummary(null);
      setSavedTripId(null);
      setTotals(null);
      setLive(EMPTY_SNAPSHOT);
      runningRef.current = true;
      setRunning(true);
      setStatus(source === "simulator" ? "Simulator running" : "Trip running");

      void tick();
      tickTimerRef.current = setInterval(() => void tick(), 1000);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start trip.");
    }
  }

  async function stopTrip() {
    if (!runningRef.current || !tripIdRef.current) return;
    setStopping(true);
    runningRef.current = false;
    setStatus("Saving trip…");

    if (tickTimerRef.current) {
      clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }

    // Let an in-flight 1 Hz read finish before saving the final batch.
    for (let attempt = 0; attempt < 40 && busyRef.current; attempt += 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    }

    try {
      try {
        await flush();
      } catch {
        // Pending readings are restored by flush(), so the stop request retries them.
      }

      const finalReadings = pendingRef.current.splice(0);
      const completedTripId = tripIdRef.current;
      const response = await requestJson<StopResponse>(
        `/api/trips/${completedTripId}/stop`,
        {
          method: "POST",
          body: JSON.stringify({ readings: finalReadings }),
        },
      );
      setSummary(response);
      setSavedTripId(completedTripId);
      setStatus("Trip saved");
      setRunning(false);
      tripIdRef.current = null;
      simulatorRef.current = null;
    } catch (caught) {
      runningRef.current = true;
      setRunning(true);
      setError(caught instanceof Error ? caught.message : "Could not stop trip.");
    } finally {
      setStopping(false);
    }
  }

  const unsupported = Object.entries(live.supported)
    .filter(([, supported]) => !supported)
    .map(([key]) => key);

  return (
    <>
      <PageHeader
        title="Live Trip"
        description="Stream MAF, fuel rate, speed and RPM once a second, then save the trip to your dashboard."
      />

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <div className="rounded-xl border border-neutral-200 p-6">
            <h2 className="text-lg font-medium">Trip setup</h2>

            <label htmlFor="vehicle" className="mb-1.5 mt-5 block text-sm font-medium">
              Vehicle
            </label>
            <select
              id="vehicle"
              value={vehicleId}
              onChange={(event) => setVehicleId(event.target.value)}
              disabled={running}
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 outline-none focus:border-black disabled:opacity-50"
            >
              <option value="">Select a vehicle…</option>
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.name} · {vehicle.plate} · {vehicle.fuel_type}
                </option>
              ))}
            </select>
            {vehicles.length === 0 && (
              <p className="mt-2 text-xs text-neutral-500">
                <Link href="/vehicles" className="underline">
                  Add a vehicle
                </Link>{" "}
                before starting.
              </p>
            )}

            <label className="mt-5 flex cursor-pointer items-center justify-between rounded-lg border border-neutral-300 px-3 py-3">
              <span>
                <span className="block text-sm font-medium">Simulator mode</span>
                <span className="block text-xs text-neutral-500">
                  Fake readings, no adapter needed
                </span>
              </span>
              <input
                type="checkbox"
                checked={simulator}
                onChange={(event) => {
                  setSimulator(event.target.checked);
                  simulatorRef.current =
                    event.target.checked && !running ? new TripSimulator() : null;
                }}
                disabled={running}
                className="h-5 w-5 accent-black"
              />
            </label>

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {!simulator &&
                (connected ? (
                  <button
                    type="button"
                    onClick={disconnect}
                    disabled={running}
                    className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium hover:border-black disabled:opacity-50"
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={connect}
                    disabled={connecting || running}
                    className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium hover:border-black disabled:opacity-50"
                  >
                    {connecting ? "Connecting…" : "Connect"}
                  </button>
                ))}

              {!running ? (
                <button
                  type="button"
                  onClick={startTrip}
                  className="rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800"
                >
                  Start trip
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopTrip}
                  disabled={stopping}
                  className="rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
                >
                  {stopping ? "Saving…" : "Stop trip"}
                </button>
              )}
            </div>

            <div className="mt-5 border-t border-neutral-200 pt-4 text-sm">
              <p className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${
                    running ? "bg-black" : connected || simulator ? "bg-neutral-500" : "bg-neutral-300"
                  }`}
                />
                {status}
              </p>
              <p className="mt-2 text-xs text-neutral-500">
                Source: {simulator ? "Simulator" : connected ? "BLE ELM327" : "None"}
                {sourceRef.current && running ? ` · ${sourceRef.current}` : ""}
              </p>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-black bg-neutral-50 px-4 py-3 text-sm">
              {error}
            </div>
          )}

          {totals?.warning && <Warning>{totals.warning}</Warning>}
        </div>

        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Fuel used" value={formatNumber(totals?.fuelLitres)} unit="L" />
            <Metric label="CO₂" value={formatNumber(totals?.co2Kg, 3)} unit="kg" />
            <Metric label="Distance" value={formatNumber(totals?.distanceKm, 3)} unit="km" />
            <Metric label="Intensity" value={formatNumber(totals?.gPerKm, 0)} unit="g/km" />
          </div>

          <div className="rounded-xl border border-neutral-200 p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-medium">Live sensors</h2>
              <span className="text-xs text-neutral-500">1 Hz</span>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { label: "Speed", value: live.speed, unit: "km/h" },
                { label: "RPM", value: live.rpm, unit: "" },
                { label: "MAF", value: live.maf, unit: "g/s" },
                { label: "Fuel rate", value: live.fuel_rate, unit: "L/h" },
              ].map((sensor) => (
                <div key={sensor.label} className="rounded-lg bg-neutral-50 p-4">
                  <p className="text-xs text-neutral-500">{sensor.label}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">
                    {formatNumber(sensor.value, sensor.label === "RPM" ? 0 : 1)}
                    {sensor.unit && (
                      <span className="ml-1 text-xs font-normal text-neutral-500">
                        {sensor.unit}
                      </span>
                    )}
                  </p>
                </div>
              ))}
            </div>
            {(running || live.supported.maf) && (
              <p className="mt-4 text-xs text-neutral-500">
                {unsupported.length > 0
                  ? `Unsupported or missing PIDs skipped: ${unsupported.join(", ")}`
                  : "All four PIDs responding."}
              </p>
            )}
          </div>

          {summary && (
            <div className="rounded-xl border border-black bg-neutral-50 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-neutral-600">Trip saved</p>
                  <h2 className="mt-1 text-2xl font-semibold">
                    {formatNumber(summary.summary.co2Kg, 3)} kg CO₂
                  </h2>
                </div>
                <div className="flex gap-2 text-sm">
                  <Link
                    href={`/dashboard/trips/${savedTripId ?? ""}`}
                    className="rounded-lg bg-black px-4 py-2 text-white hover:bg-neutral-800"
                  >
                    View details
                  </Link>
                  <Link
                    href="/dashboard"
                    className="rounded-lg border border-neutral-300 px-4 py-2 hover:border-black"
                  >
                    Dashboard
                  </Link>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-4 border-t border-neutral-200 pt-4 text-sm sm:grid-cols-4">
                <p>Fuel: <strong>{formatNumber(summary.summary.fuelLitres)} L</strong></p>
                <p>Distance: <strong>{formatNumber(summary.summary.distanceKm, 3)} km</strong></p>
                <p>g/km: <strong>{formatNumber(summary.summary.gPerKm, 0)}</strong></p>
                <p>Duration: <strong>{formatDuration(summary.durationSeconds)}</strong></p>
              </div>
              {summary.summary.warning && <div className="mt-4"><Warning>{summary.summary.warning}</Warning></div>}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
