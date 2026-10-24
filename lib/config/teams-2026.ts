/**
 * 2026 constructors.
 *
 * Colours are the team colours published in the official timing feed, as relayed by OpenF1
 * `/v1/drivers` (field `team_colour`) for the 2026 United States GP weekend (retrieved 2026-10-24).
 * Team colours identify a car; they are never used to express timing states (sector colours live in
 * `lib/timing/status.ts`).
 */

export const TEAM_IDS = [
  "mclaren",
  "mercedes",
  "ferrari",
  "red_bull",
  "racing_bulls",
  "aston_martin",
  "alpine",
  "haas",
  "audi",
  "williams",
  "cadillac",
] as const;

export type TeamId = (typeof TEAM_IDS)[number];

export interface TeamConfig {
  id: TeamId;
  name: string;
  /** Hex colour without alpha, e.g. "#F47600". */
  colour: string;
  powerUnit: string;
  nationality: string;
  /** Identifiers used by external providers, so normalisation never relies on display names. */
  aliases: {
    jolpica: string;
    openf1: string[];
  };
}

export const TEAMS_2026: Record<TeamId, TeamConfig> = {
  mclaren: {
    id: "mclaren",
    name: "McLaren",
    colour: "#F47600",
    powerUnit: "Mercedes",
    nationality: "British",
    aliases: { jolpica: "mclaren", openf1: ["McLaren"] },
  },
  mercedes: {
    id: "mercedes",
    name: "Mercedes",
    colour: "#00D7B6",
    powerUnit: "Mercedes",
    nationality: "German",
    aliases: { jolpica: "mercedes", openf1: ["Mercedes"] },
  },
  ferrari: {
    id: "ferrari",
    name: "Ferrari",
    colour: "#ED1131",
    powerUnit: "Ferrari",
    nationality: "Italian",
    aliases: { jolpica: "ferrari", openf1: ["Ferrari"] },
  },
  red_bull: {
    id: "red_bull",
    name: "Red Bull Racing",
    colour: "#4781D7",
    powerUnit: "Red Bull Ford",
    nationality: "Austrian",
    aliases: { jolpica: "red_bull", openf1: ["Red Bull Racing"] },
  },
  racing_bulls: {
    id: "racing_bulls",
    name: "Racing Bulls",
    colour: "#6C98FF",
    powerUnit: "Red Bull Ford",
    nationality: "Italian",
    aliases: { jolpica: "rb", openf1: ["Racing Bulls", "RB"] },
  },
  aston_martin: {
    id: "aston_martin",
    name: "Aston Martin",
    colour: "#229971",
    powerUnit: "Honda",
    nationality: "British",
    aliases: { jolpica: "aston_martin", openf1: ["Aston Martin"] },
  },
  alpine: {
    id: "alpine",
    name: "Alpine",
    colour: "#00A1E8",
    powerUnit: "Mercedes",
    nationality: "French",
    aliases: { jolpica: "alpine", openf1: ["Alpine"] },
  },
  haas: {
    id: "haas",
    name: "Haas",
    colour: "#9C9FA2",
    powerUnit: "Ferrari",
    nationality: "American",
    aliases: { jolpica: "haas", openf1: ["Haas F1 Team", "Haas"] },
  },
  audi: {
    id: "audi",
    name: "Audi",
    colour: "#F50537",
    powerUnit: "Audi",
    nationality: "German",
    aliases: { jolpica: "audi", openf1: ["Audi"] },
  },
  williams: {
    id: "williams",
    name: "Williams",
    colour: "#1868DB",
    powerUnit: "Mercedes",
    nationality: "British",
    aliases: { jolpica: "williams", openf1: ["Williams"] },
  },
  cadillac: {
    id: "cadillac",
    name: "Cadillac",
    colour: "#909090",
    powerUnit: "Ferrari",
    nationality: "American",
    aliases: { jolpica: "cadillac", openf1: ["Cadillac"] },
  },
};

export const TEAM_LIST: TeamConfig[] = TEAM_IDS.map((id) => TEAMS_2026[id]);

export function teamByJolpicaId(constructorId: string): TeamConfig | undefined {
  return TEAM_LIST.find((t) => t.aliases.jolpica === constructorId);
}

export function teamByOpenF1Name(teamName: string | null | undefined): TeamConfig | undefined {
  if (!teamName) return undefined;
  const n = teamName.trim().toLowerCase();
  return TEAM_LIST.find((t) => t.aliases.openf1.some((a) => a.toLowerCase() === n));
}

export function isTeamId(value: string): value is TeamId {
  return (TEAM_IDS as readonly string[]).includes(value);
}
