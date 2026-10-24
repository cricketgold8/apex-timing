"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { eventById, scheduleState, SESSION_TYPE_LABEL } from "@/lib/config/season-2026";
import { useFeed } from "@/lib/client/feed";
import { useHydrated } from "@/lib/client/hooks";
import { useRemoteResource } from "@/lib/client/remote";
import { resolveTimeZone, useSettings } from "@/lib/client/settings";
import { formatDateTime, formatLapTime, zoneLabel } from "@/lib/timing/formatters";
import type { TrackGeometry } from "@/lib/timing/types";
import { TrackMap } from "@/components/track/TrackMap";
import { PageTitle } from "@/components/ui/DriverCell";
import { ProviderErrorMessage, StateMessage } from "@/components/ui/primitives";
import { SourceInfo } from "@/components/ui/Popover";

export function EventView({ eventId }: { eventId: string }) {
  const event = eventById(eventId)!;
  const { settings } = useSettings();
  const hydrated = useHydrated();
  const feed = useFeed();
  const router = useRouter();
  const outline = useRemoteResource<{ geometry: TrackGeometry | null; referenceLap: { driverNumber: number; lap: number; time: number | null } }>(`/api/circuit?circuitKey=${event.circuit.openf1CircuitKey}`, {
    scope: `circuit-${event.circuit.openf1CircuitKey}`,
  });
  const viewerTz = resolveTimeZone(settings.timeZone === "event" ? "viewer" : settings.timeZone, event.circuit.timeZone);

  return (
    <div className="flex flex-col gap-3">
      <Link href="/schedule" className="inline-flex w-fit items-center gap-1 text-[12px] text-fg-2 hover:text-fg">
        <ArrowLeft size={13} aria-hidden /> Schedule
      </Link>
      <PageTitle
        title={event.name}
        subtitle={
          <>
            {event.round ? `Round ${event.round}` : event.format === "testing" ? "Pre-season testing" : "Not a championship round"} · {event.format === "sprint" ? "Sprint weekend" : event.format === "standard" ? "Standard weekend" : "Testing"}
            {event.status === "cancelled" && <span className="ml-2 font-bold text-red">Cancelled</span>}
          </>
        }
        info={
          <p>
            {event.officialName}. Session times are stored in UTC and converted using the {event.circuit.timeZone} time zone, so daylight-saving changes are handled. Calendar from OpenF1, cross-checked with Jolpica-F1.
          </p>
        }
      />

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <section className="panel overflow-x-auto" aria-label="Sessions">
          <div className="panel-head">
            <span className="panel-title">Sessions</span>
          </div>
          <table className="data-table tnum">
            <thead>
              <tr>
                <th>Session</th>
                <th>Your time{hydrated ? ` (${zoneLabel(event.sessions[0]?.start ?? new Date().toISOString(), viewerTz)})` : ""}</th>
                <th>Event local ({hydrated ? zoneLabel(event.sessions[0]?.start ?? new Date().toISOString(), event.circuit.timeZone) : event.circuit.timeZone})</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {event.sessions.map((s) => {
                const st = hydrated ? scheduleState(s) : null;
                return (
                  <tr key={s.openf1SessionKey}>
                    <td>
                      <span className="font-semibold">{s.name}</span>
                      <span className="ml-2 text-[11px] text-fg-3">{SESSION_TYPE_LABEL[s.type]}</span>
                    </td>
                    <td>{hydrated ? formatDateTime(s.start, { timeZone: viewerTz, hour12: settings.hour12 }) : "—"}</td>
                    <td className="text-fg-2">{hydrated ? formatDateTime(s.start, { timeZone: event.circuit.timeZone, hour12: settings.hour12 }) : "—"}</td>
                    <td className={st === "cancelled" ? "text-red" : st === "in-window" ? "text-green" : "text-fg-2"}>{st === "in-window" ? "In scheduled window" : st ? st.charAt(0).toUpperCase() + st.slice(1) : ""}</td>
                    <td className="text-right">
                      {st === "completed" && !s.cancelled && (
                        <button
                          className="btn h-6"
                          onClick={() => {
                            feed.setSession(s.openf1SessionKey);
                            router.push("/timing");
                          }}
                        >
                          Timing
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className="panel" aria-label="Circuit">
          <div className="panel-head">
            <span className="panel-title">Circuit</span>
            <span className="text-[12.5px] text-fg-2">{event.circuit.name}</span>
            <span className="ml-auto" />
            <SourceInfo provenance={outline.provenance}>{outline.data?.geometry && <p className="mb-2">{outline.data.geometry.basis}.</p>}</SourceInfo>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 px-3 py-2 text-[12px] sm:grid-cols-4">
            <div>
              <dt className="label">Location</dt>
              <dd>
                {event.circuit.locality}, {event.circuit.country}
              </dd>
            </div>
            <div>
              <dt className="label">Type</dt>
              <dd>{event.circuit.type ?? "—"}</dd>
            </div>
            <div>
              <dt className="label">Time zone</dt>
              <dd>{event.circuit.timeZone}</dd>
            </div>
            <div>
              <dt className="label">Coordinates</dt>
              <dd className="tnum">{event.circuit.lat !== null && event.circuit.long !== null ? `${event.circuit.lat.toFixed(3)}, ${event.circuit.long.toFixed(3)}` : "—"}</dd>
            </div>
          </dl>
          <div className="px-2 pb-2">
            {outline.status === "error" && outline.error ? (
              <ProviderErrorMessage error={outline.error} onRetry={outline.reload} />
            ) : !outline.data ? (
              <StateMessage kind="loading" title="Tracing circuit from position data" />
            ) : outline.data.geometry ? (
              <>
                <TrackMap geometry={outline.data.geometry} cars={[]} selected={null} markerBasis="" height={320} />
                <p className="mt-1 text-[11px] text-fg-3">Reference lap: car {outline.data.referenceLap.driverNumber}, lap {outline.data.referenceLap.lap} ({formatLapTime(outline.data.referenceLap.time)}).</p>
              </>
            ) : (
              <StateMessage kind="empty" title="No outline available" />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
