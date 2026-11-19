import type { ReadingInput } from "./types";

/** Realistic-enough 1 Hz readings so the whole app works without a vehicle. */
export class TripSimulator {
  private readonly startedAt = Date.now();

  next(): ReadingInput {
    const t = (Date.now() - this.startedAt) / 1000;
    const speed = Math.max(
      0,
      44 + 17 * Math.sin(t / 9) + 6 * Math.sin(t / 2.7) + (Math.random() - 0.5) * 1.5,
    );
    const rpm = 1250 + speed * 34 + 90 * Math.sin(t / 3) + Math.random() * 40;
    const maf = 2.8 + speed * 0.115 + Math.sin(t / 4) * 0.4 + (Math.random() - 0.5) * 0.2;
    const fuelRate = 0.75 + speed * 0.043 + Math.sin(t / 5) * 0.12;

    return {
      timestamp: new Date().toISOString(),
      maf: round(maf, 2),
      fuel_rate: round(fuelRate, 3),
      speed: round(speed, 1),
      rpm: round(rpm, 0),
    };
  }
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
