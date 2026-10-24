import type { Metadata } from "next";
import { TelemetryView } from "@/components/telemetry/TelemetryView";

export const metadata: Metadata = { title: "Telemetry" };

export default function TelemetryPage() {
  return <TelemetryView />;
}
