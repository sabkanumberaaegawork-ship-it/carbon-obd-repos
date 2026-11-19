import type { Metadata } from "next";
import { TripDetailClient } from "@/components/TripDetailClient";

export const metadata: Metadata = { title: "Trip detail" };

export default async function TripDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TripDetailClient id={id} />;
}
