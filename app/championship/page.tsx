import type { Metadata } from "next";
import { ChampionshipView } from "@/components/championship/ChampionshipView";

export const metadata: Metadata = { title: "Championship" };

export default function ChampionshipPage() {
  return <ChampionshipView />;
}
