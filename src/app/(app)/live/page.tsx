import type { Metadata } from "next";
import { LiveTripClient } from "@/components/LiveTripClient";

export const metadata: Metadata = { title: "Live Trip" };

export default function LivePage() {
  return <LiveTripClient />;
}
