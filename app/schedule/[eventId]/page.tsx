import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eventById, SEASON_2026 } from "@/lib/config/season-2026";
import { EventView } from "@/components/schedule/EventView";

export function generateStaticParams() {
  return SEASON_2026.events.map((e) => ({ eventId: e.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ eventId: string }> }): Promise<Metadata> {
  const { eventId } = await params;
  return { title: eventById(eventId)?.name ?? "Event" };
}

export default async function EventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = eventById(eventId);
  if (!event) notFound();
  return <EventView eventId={event.id} />;
}
