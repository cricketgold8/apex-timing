import type { Metadata } from "next";
import { ScheduleView } from "@/components/schedule/ScheduleView";

export const metadata: Metadata = { title: "Schedule" };

export default function SchedulePage() {
  return <ScheduleView />;
}
