import type { Metadata } from "next";
import { Suspense } from "react";
import { LiveTimingView } from "@/components/timing/LiveTimingView";

export const metadata: Metadata = { title: "Live Timing" };

export default function TimingPage() {
  return (
    <Suspense>
      <LiveTimingView />
    </Suspense>
  );
}
