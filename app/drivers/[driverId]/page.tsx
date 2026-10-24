import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ALL_DRIVERS_2026, driverById } from "@/lib/config/drivers-2026";
import { DriverProfile } from "@/components/drivers/DriverProfile";

export function generateStaticParams() {
  return ALL_DRIVERS_2026.map((d) => ({ driverId: d.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ driverId: string }> }): Promise<Metadata> {
  const { driverId } = await params;
  return { title: driverById(driverId)?.displayName ?? "Driver" };
}

export default async function DriverPage({ params }: { params: Promise<{ driverId: string }> }) {
  const { driverId } = await params;
  if (!driverById(driverId)) notFound();
  return <DriverProfile driverId={driverId} />;
}
