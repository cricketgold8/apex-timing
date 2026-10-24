import { latestCompletedSession, nextSession, scheduleState, SEASON_2026 } from "@/lib/config/season-2026";
import { liveCredentialsConfigured } from "@/lib/server/openf1";
import { ok } from "@/lib/server/respond";

/** Provider capabilities and the schedule context the UI needs to pick a sensible default view. */
export async function GET() {
  const now = new Date();
  const inWindow = SEASON_2026.events.flatMap((e) => e.sessions.filter((s) => scheduleState(s, now) === "in-window").map((s) => ({ eventId: e.id, sessionKey: s.openf1SessionKey })));
  const latest = latestCompletedSession(now);
  const next = nextSession(now);
  return ok({
    now: now.toISOString(),
    providers: {
      live: { name: "OpenF1 (authenticated)", configured: liveCredentialsConfigured() },
      historical: { name: "OpenF1", configured: true },
      results: { name: "Jolpica-F1", configured: true },
      demo: { name: "Apex demo generator (synthetic)", configured: true },
    },
    sessionsInWindow: inWindow,
    latestCompleted: latest ? { eventId: latest.event.id, sessionKey: latest.session.openf1SessionKey, name: `${latest.event.name} — ${latest.session.name}` } : null,
    next: next ? { eventId: next.event.id, sessionKey: next.session.openf1SessionKey, name: `${next.event.name} — ${next.session.name}`, start: next.session.start } : null,
    calendarGeneratedAt: SEASON_2026.generatedAt,
  });
}
