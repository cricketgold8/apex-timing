#!/usr/bin/env node
/**
 * Builds lib/config/season-2026.data.json from two independent public sources:
 *   - OpenF1 /v1/meetings and /v1/sessions (session keys, UTC times, gmt offsets, cancellations)
 *   - Jolpica-F1 /2026.json and /2026/circuits.json (championship round numbers, circuit names, coordinates)
 *
 * Events are matched by date: a Jolpica round belongs to the OpenF1 meeting whose date range contains the race date.
 * Anything that cannot be matched is reported and left without a round number rather than guessed.
 *
 * Usage: npm run sync:season
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SEASON = 2026;
const OPENF1 = process.env.OPENF1_BASE_URL ?? "https://api.openf1.org";
const JOLPICA = process.env.JOLPICA_BASE_URL ?? "https://api.jolpi.ca/ergast/f1";

/** IANA zones per OpenF1 circuit_key. Verified against each meeting's gmt_offset by tests/season.test.ts. */
const CIRCUIT_TIME_ZONES = {
  2: "Europe/London",
  4: "Europe/Budapest",
  7: "Europe/Brussels",
  9: "America/Chicago",
  10: "Australia/Melbourne",
  12: "Asia/Kuala_Lumpur",
  14: "America/Sao_Paulo",
  15: "Europe/Madrid",
  19: "Europe/Vienna",
  22: "Europe/Monaco",
  23: "America/Toronto",
  39: "Europe/Rome",
  46: "Asia/Tokyo",
  49: "Asia/Shanghai",
  55: "Europe/Amsterdam",
  61: "Asia/Singapore",
  63: "Asia/Bahrain",
  65: "America/Mexico_City",
  70: "Asia/Dubai",
  144: "Asia/Baku",
  149: "Asia/Riyadh",
  150: "Asia/Qatar",
  151: "America/New_York",
  152: "America/Los_Angeles",
  153: "Europe/Madrid",
};

const SESSION_TYPES = {
  "Practice 1": "PRACTICE",
  "Practice 2": "PRACTICE",
  "Practice 3": "PRACTICE",
  "Sprint Qualifying": "SPRINT_QUALIFYING",
  "Sprint Shootout": "SPRINT_QUALIFYING",
  Sprint: "SPRINT",
  Qualifying: "QUALIFYING",
  Race: "RACE",
  "Day 1": "TESTING",
  "Day 2": "TESTING",
  "Day 3": "TESTING",
};

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

const slug = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

async function main() {
  const [meetings, sessions, jSchedule, jCircuits] = await Promise.all([
    getJson(`${OPENF1}/v1/meetings?year=${SEASON}`),
    getJson(`${OPENF1}/v1/sessions?year=${SEASON}`),
    getJson(`${JOLPICA}/${SEASON}.json?limit=100`),
    getJson(`${JOLPICA}/${SEASON}/circuits.json?limit=100`),
  ]);

  const races = jSchedule.MRData.RaceTable.Races;
  const circuits = new Map(jCircuits.MRData.CircuitTable.Circuits.map((c) => [c.circuitId, c]));
  const warnings = [];

  const events = meetings
    .slice()
    .sort((a, b) => a.date_start.localeCompare(b.date_start))
    .map((m) => {
      const start = m.date_start.slice(0, 10);
      const end = m.date_end.slice(0, 10);
      const isTesting = /testing/i.test(m.meeting_name);
      const race = isTesting ? undefined : races.find((r) => r.date >= start && r.date <= end);
      if (!isTesting && !race && !m.is_cancelled) warnings.push(`No Jolpica round matched OpenF1 meeting ${m.meeting_key} (${m.meeting_name})`);
      const jc = race ? circuits.get(race.Circuit.circuitId) : undefined;
      const tz = CIRCUIT_TIME_ZONES[m.circuit_key];
      if (!tz) warnings.push(`No IANA time zone configured for circuit_key ${m.circuit_key} (${m.circuit_short_name})`);

      const evSessions = sessions
        .filter((s) => s.meeting_key === m.meeting_key)
        .sort((a, b) => a.date_start.localeCompare(b.date_start))
        .map((s) => {
          const type = SESSION_TYPES[s.session_name];
          if (!type) warnings.push(`Unknown session name "${s.session_name}" (session ${s.session_key})`);
          return {
            openf1SessionKey: s.session_key,
            name: s.session_name,
            type: type ?? "PRACTICE",
            start: new Date(s.date_start).toISOString(),
            end: new Date(s.date_end).toISOString(),
            cancelled: Boolean(s.is_cancelled),
          };
        });

      const hasSprint = evSessions.some((s) => s.type === "SPRINT");
      // F1's own event name (OpenF1), keeping a relocation suffix from the official title ("... IN MALAYSIA 2026").
      const relocated = /\bIN ([A-Z ]+) \d{4}$/.exec(m.meeting_official_name ?? "");
      const where = relocated?.[1];
      const name = where ? `${m.meeting_name} in ${where.charAt(0)}${where.slice(1).toLowerCase()}` : m.meeting_name;
      return {
        id: `${SEASON}-${isTesting ? `testing-${m.meeting_key}` : slug(name)}`,
        season: SEASON,
        round: race ? Number(race.round) : null,
        openf1MeetingKey: m.meeting_key,
        name,
        officialName: m.meeting_official_name,
        jolpicaRaceName: race?.raceName ?? null,
        status: m.is_cancelled ? "cancelled" : "scheduled",
        format: isTesting ? "testing" : hasSprint ? "sprint" : "standard",
        startDate: start,
        endDate: end,
        gmtOffset: m.gmt_offset,
        circuit: {
          id: jc?.circuitId ?? slug(m.circuit_short_name),
          openf1CircuitKey: m.circuit_key,
          name: jc?.circuitName ?? m.circuit_short_name,
          shortName: m.circuit_short_name,
          locality: jc?.Location.locality ?? m.location,
          // Jolpica's circuit country reflects where the track is (e.g. the relocated Bahrain GP at Sepang).
          country: jc?.Location.country ?? m.country_name,
          type: m.circuit_type ?? null,
          lat: jc ? Number(jc.Location.lat) : null,
          long: jc ? Number(jc.Location.long) : null,
          timeZone: tz ?? "UTC",
        },
        sessions: evSessions,
      };
    });

  const out = {
    season: SEASON,
    generatedAt: new Date().toISOString(),
    sources: [`${OPENF1}/v1/meetings?year=${SEASON}`, `${OPENF1}/v1/sessions?year=${SEASON}`, `${JOLPICA}/${SEASON}.json`, `${JOLPICA}/${SEASON}/circuits.json`],
    warnings,
    events,
  };

  const here = path.dirname(fileURLToPath(import.meta.url));
  const target = path.join(here, "..", "lib", "config", `season-${SEASON}.data.json`);
  await writeFile(target, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`Wrote ${events.length} events to ${path.relative(process.cwd(), target)}`);
  for (const w of warnings) console.warn(`warning: ${w}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
