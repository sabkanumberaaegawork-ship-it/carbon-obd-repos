import { describe, expect, it } from "vitest";
import {
  calculateEmissions,
  DIESEL_FUEL_RATE_WARNING,
} from "./emissions";

const t0 = "2026-01-01T00:00:00.000Z";
const at = (seconds: number) =>
  new Date(Date.parse(t0) + seconds * 1000).toISOString();

describe("calculateEmissions", () => {
  it("uses fuel rate (PID 015E) in L/h when it is available", () => {
    const result = calculateEmissions(
      [
        { timestamp: t0 },
        {
          timestamp: at(3600),
          fuel_rate: 4,
          maf: 100,
          speed: 60,
          rpm: 2500,
        },
      ],
      "petrol",
    );

    expect(result.fuelLitres).toBeCloseTo(4, 6);
    expect(result.co2Kg).toBeCloseTo(9.24, 6);
    expect(result.distanceKm).toBeCloseTo(60, 6);
    expect(result.gPerKm).toBeCloseTo(154, 6);
    expect(result.warning).toBeNull();
  });

  it("falls back to petrol MAF / 14.7 / 745 when fuel rate is missing", () => {
    const result = calculateEmissions(
      [
        { timestamp: t0 },
        { timestamp: at(10), maf: 14.7, speed: 36 },
      ],
      "petrol",
    );

    const expectedLitres = 10 / 745;
    expect(result.fuelLitres).toBeCloseTo(expectedLitres, 6);
    expect(result.co2Kg).toBeCloseTo(expectedLitres * 2.31, 6);
    expect(result.distanceKm).toBeCloseTo(0.1, 6);
    expect(result.gPerKm).toBeCloseTo((expectedLitres * 2.31 * 1000) / 0.1, 4);
  });

  it("warns instead of inventing diesel CO2 when fuel rate is unsupported", () => {
    const result = calculateEmissions(
      [
        { timestamp: t0 },
        { timestamp: at(60), maf: 30, speed: 80 },
      ],
      "diesel",
    );

    expect(result.fuelLitres).toBe(0);
    expect(result.co2Kg).toBe(0);
    expect(result.distanceKm).toBeCloseTo(80 / 60, 6);
    expect(result.warning).toBe(DIESEL_FUEL_RATE_WARNING);
    expect(result.skippedFuelIntervals).toBe(1);
  });

  it("skips intervals where all fuel PIDs are unsupported", () => {
    const result = calculateEmissions(
      [
        { timestamp: t0 },
        { timestamp: at(1), maf: null, fuel_rate: null, speed: null },
        { timestamp: at(2), maf: null, fuel_rate: null, speed: 20 },
      ],
      "petrol",
    );

    expect(result.fuelLitres).toBe(0);
    expect(result.distanceKm).toBeCloseTo(20 / 3600, 6);
    expect(result.skippedFuelIntervals).toBe(2);
    expect(result.warning).toBeNull();
  });

  it("mixes fuel-rate, MAF and unsupported intervals", () => {
    const result = calculateEmissions(
      [
        { timestamp: t0 },
        { timestamp: at(3600), fuel_rate: 2, speed: 50 },
        { timestamp: at(3610), maf: 14.7, speed: 50 },
        { timestamp: at(3620), maf: null, fuel_rate: null, speed: 50 },
      ],
      "petrol",
    );

    expect(result.fuelSampleCount).toBe(2);
    expect(result.skippedFuelIntervals).toBe(1);
    expect(result.fuelLitres).toBeCloseTo(2 + 10 / 745, 6);
  });

  it("sorts readings by timestamp and can cap long gaps", () => {
    const result = calculateEmissions(
      [
        { timestamp: at(100), fuel_rate: 3.6, speed: 90 },
        { timestamp: t0 },
      ],
      "petrol",
      { maxIntervalSeconds: 10 },
    );

    expect(result.sampledSeconds).toBe(10);
    expect(result.fuelLitres).toBeCloseTo((3.6 * 10) / 3600, 6);
    expect(result.distanceKm).toBeCloseTo((90 * 10) / 3600, 6);
  });

  it("returns zero g/km when there is no distance", () => {
    const result = calculateEmissions(
      [{ timestamp: t0 }, { timestamp: at(1), fuel_rate: 1 }],
      "petrol",
    );

    expect(result.fuelLitres).toBeGreaterThan(0);
    expect(result.distanceKm).toBe(0);
    expect(result.gPerKm).toBe(0);
  });
});
