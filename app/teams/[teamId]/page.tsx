import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isTeamId, TEAM_IDS, TEAMS_2026 } from "@/lib/config/teams-2026";
import { TeamProfile } from "@/components/teams/TeamProfile";

export function generateStaticParams() {
  return TEAM_IDS.map((teamId) => ({ teamId }));
}

export async function generateMetadata({ params }: { params: Promise<{ teamId: string }> }): Promise<Metadata> {
  const { teamId } = await params;
  return { title: isTeamId(teamId) ? TEAMS_2026[teamId].name : "Team" };
}

export default async function TeamPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  if (!isTeamId(teamId)) notFound();
  return <TeamProfile teamId={teamId} />;
}
