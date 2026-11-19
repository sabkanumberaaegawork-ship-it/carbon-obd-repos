import type { Metadata } from "next";
import { VehiclesClient } from "@/components/VehiclesClient";

export const metadata: Metadata = { title: "Vehicles" };

export default function VehiclesPage() {
  return <VehiclesClient />;
}
