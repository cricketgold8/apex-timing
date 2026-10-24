import type { TeamId } from "./teams-2026";

/**
 * 2026 race-driver line-up (22 drivers, 11 teams).
 *
 * Verified 2026-10-24 against two independent entry lists:
 *   - OpenF1 /v1/drivers for the 2026 United States GP (session 11390): numbers, codes, teams.
 *   - Jolpica-F1 /2026/drivers.json: given names, dates of birth, nationalities.
 * Both match the configuration below. Update this file (not the components) if the line-up changes.
 *
 * Results and standings never assume this list: they use the entrant recorded for each session,
 * so substitute appearances (see SUBSTITUTE_DRIVERS_2026) are attributed correctly.
 */

export interface DriverConfig {
  /** Stable internal id; equals the Jolpica driverId so results can be joined without name matching. */
  id: string;
  number: number;
  code: string;
  firstName: string;
  lastName: string;
  /** Name as commonly published by F1 (e.g. "Kimi Antonelli"). */
  displayName: string;
  /** Full legal name where it differs from the display name. */
  fullName: string;
  nationality: string;
  dateOfBirth: string;
  teamId: TeamId;
  role: "race" | "substitute";
}

export const DRIVERS_2026: DriverConfig[] = [
  { id: "norris", number: 1, code: "NOR", firstName: "Lando", lastName: "Norris", displayName: "Lando Norris", fullName: "Lando Norris", nationality: "British", dateOfBirth: "1999-11-13", teamId: "mclaren", role: "race" },
  { id: "piastri", number: 81, code: "PIA", firstName: "Oscar", lastName: "Piastri", displayName: "Oscar Piastri", fullName: "Oscar Piastri", nationality: "Australian", dateOfBirth: "2001-04-06", teamId: "mclaren", role: "race" },
  { id: "russell", number: 63, code: "RUS", firstName: "George", lastName: "Russell", displayName: "George Russell", fullName: "George Russell", nationality: "British", dateOfBirth: "1998-02-15", teamId: "mercedes", role: "race" },
  { id: "antonelli", number: 12, code: "ANT", firstName: "Kimi", lastName: "Antonelli", displayName: "Kimi Antonelli", fullName: "Andrea Kimi Antonelli", nationality: "Italian", dateOfBirth: "2006-08-25", teamId: "mercedes", role: "race" },
  { id: "leclerc", number: 16, code: "LEC", firstName: "Charles", lastName: "Leclerc", displayName: "Charles Leclerc", fullName: "Charles Leclerc", nationality: "Monegasque", dateOfBirth: "1997-10-16", teamId: "ferrari", role: "race" },
  { id: "hamilton", number: 44, code: "HAM", firstName: "Lewis", lastName: "Hamilton", displayName: "Lewis Hamilton", fullName: "Lewis Hamilton", nationality: "British", dateOfBirth: "1985-01-07", teamId: "ferrari", role: "race" },
  { id: "max_verstappen", number: 3, code: "VER", firstName: "Max", lastName: "Verstappen", displayName: "Max Verstappen", fullName: "Max Verstappen", nationality: "Dutch", dateOfBirth: "1997-09-30", teamId: "red_bull", role: "race" },
  { id: "hadjar", number: 6, code: "HAD", firstName: "Isack", lastName: "Hadjar", displayName: "Isack Hadjar", fullName: "Isack Hadjar", nationality: "French", dateOfBirth: "2004-09-28", teamId: "red_bull", role: "race" },
  { id: "lawson", number: 30, code: "LAW", firstName: "Liam", lastName: "Lawson", displayName: "Liam Lawson", fullName: "Liam Lawson", nationality: "New Zealander", dateOfBirth: "2002-02-11", teamId: "racing_bulls", role: "race" },
  { id: "arvid_lindblad", number: 41, code: "LIN", firstName: "Arvid", lastName: "Lindblad", displayName: "Arvid Lindblad", fullName: "Arvid Lindblad", nationality: "British", dateOfBirth: "2007-08-08", teamId: "racing_bulls", role: "race" },
  { id: "alonso", number: 14, code: "ALO", firstName: "Fernando", lastName: "Alonso", displayName: "Fernando Alonso", fullName: "Fernando Alonso", nationality: "Spanish", dateOfBirth: "1981-07-29", teamId: "aston_martin", role: "race" },
  { id: "stroll", number: 18, code: "STR", firstName: "Lance", lastName: "Stroll", displayName: "Lance Stroll", fullName: "Lance Stroll", nationality: "Canadian", dateOfBirth: "1998-10-29", teamId: "aston_martin", role: "race" },
  { id: "gasly", number: 10, code: "GAS", firstName: "Pierre", lastName: "Gasly", displayName: "Pierre Gasly", fullName: "Pierre Gasly", nationality: "French", dateOfBirth: "1996-02-07", teamId: "alpine", role: "race" },
  { id: "colapinto", number: 43, code: "COL", firstName: "Franco", lastName: "Colapinto", displayName: "Franco Colapinto", fullName: "Franco Colapinto", nationality: "Argentine", dateOfBirth: "2003-05-27", teamId: "alpine", role: "race" },
  { id: "ocon", number: 31, code: "OCO", firstName: "Esteban", lastName: "Ocon", displayName: "Esteban Ocon", fullName: "Esteban Ocon", nationality: "French", dateOfBirth: "1996-09-17", teamId: "haas", role: "race" },
  { id: "bearman", number: 87, code: "BEA", firstName: "Oliver", lastName: "Bearman", displayName: "Oliver Bearman", fullName: "Oliver Bearman", nationality: "British", dateOfBirth: "2005-05-08", teamId: "haas", role: "race" },
  { id: "hulkenberg", number: 27, code: "HUL", firstName: "Nico", lastName: "Hülkenberg", displayName: "Nico Hülkenberg", fullName: "Nico Hülkenberg", nationality: "German", dateOfBirth: "1987-08-19", teamId: "audi", role: "race" },
  { id: "bortoleto", number: 5, code: "BOR", firstName: "Gabriel", lastName: "Bortoleto", displayName: "Gabriel Bortoleto", fullName: "Gabriel Bortoleto", nationality: "Brazilian", dateOfBirth: "2004-10-14", teamId: "audi", role: "race" },
  { id: "albon", number: 23, code: "ALB", firstName: "Alexander", lastName: "Albon", displayName: "Alexander Albon", fullName: "Alexander Albon", nationality: "Thai", dateOfBirth: "1996-03-23", teamId: "williams", role: "race" },
  { id: "sainz", number: 55, code: "SAI", firstName: "Carlos", lastName: "Sainz", displayName: "Carlos Sainz", fullName: "Carlos Sainz", nationality: "Spanish", dateOfBirth: "1994-09-01", teamId: "williams", role: "race" },
  { id: "perez", number: 11, code: "PER", firstName: "Sergio", lastName: "Pérez", displayName: "Sergio Pérez", fullName: "Sergio Pérez", nationality: "Mexican", dateOfBirth: "1990-01-26", teamId: "cadillac", role: "race" },
  { id: "bottas", number: 77, code: "BOT", firstName: "Valtteri", lastName: "Bottas", displayName: "Valtteri Bottas", fullName: "Valtteri Bottas", nationality: "Finnish", dateOfBirth: "1989-08-28", teamId: "cadillac", role: "race" },
];

/**
 * Drivers who started 2026 championship sessions without being part of the regular line-up.
 * Source: Jolpica-F1 2026 results and OpenF1 session entries (Yuki Tsunoda, Racing Bulls, rounds 12–14).
 */
export const SUBSTITUTE_DRIVERS_2026: DriverConfig[] = [
  { id: "tsunoda", number: 22, code: "TSU", firstName: "Yuki", lastName: "Tsunoda", displayName: "Yuki Tsunoda", fullName: "Yuki Tsunoda", nationality: "Japanese", dateOfBirth: "2000-05-11", teamId: "racing_bulls", role: "substitute" },
];

export const ALL_DRIVERS_2026 = [...DRIVERS_2026, ...SUBSTITUTE_DRIVERS_2026];

const byNumber = new Map(ALL_DRIVERS_2026.map((d) => [d.number, d]));
const byId = new Map(ALL_DRIVERS_2026.map((d) => [d.id, d]));
const byCode = new Map(ALL_DRIVERS_2026.map((d) => [d.code, d]));

/** Race-grid driver for a car number. Substitutes are only returned when `includeSubstitutes` is set. */
export function driverByNumber(n: number, includeSubstitutes = true): DriverConfig | undefined {
  const d = byNumber.get(n);
  if (!d) return undefined;
  return includeSubstitutes || d.role === "race" ? d : undefined;
}

export function driverById(id: string): DriverConfig | undefined {
  return byId.get(id);
}

export function driverByCode(code: string): DriverConfig | undefined {
  return byCode.get(code.toUpperCase());
}

export function teammateOf(driver: DriverConfig): DriverConfig | undefined {
  return DRIVERS_2026.find((d) => d.teamId === driver.teamId && d.id !== driver.id);
}
