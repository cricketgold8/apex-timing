import { z } from "zod";

/**
 * Runtime schemas for upstream payloads. Anything that does not match is rejected at the boundary,
 * so components only ever see normalised domain types.
 */

const num = z.number().finite();
const nnum = num.nullable().optional();
const nstr = z.string().nullable().optional();

// ---------------------------------------------------------------------------------------------
// OpenF1 (https://openf1.org/docs)
// ---------------------------------------------------------------------------------------------

export const of1Driver = z.object({
  driver_number: z.number().int(),
  name_acronym: nstr,
  full_name: nstr,
  first_name: nstr,
  last_name: nstr,
  broadcast_name: nstr,
  team_name: nstr,
  team_colour: nstr,
  session_key: z.number().int(),
});

export const of1Lap = z.object({
  driver_number: z.number().int(),
  lap_number: z.number().int(),
  date_start: nstr,
  duration_sector_1: nnum,
  duration_sector_2: nnum,
  duration_sector_3: nnum,
  lap_duration: nnum,
  i1_speed: nnum,
  i2_speed: nnum,
  st_speed: nnum,
  is_pit_out_lap: z.boolean().nullable().optional(),
  segments_sector_1: z.array(z.number().nullable()).nullable().optional(),
  segments_sector_2: z.array(z.number().nullable()).nullable().optional(),
  segments_sector_3: z.array(z.number().nullable()).nullable().optional(),
});

const gapValue = z.union([num, z.string()]).nullable().optional();

export const of1Interval = z.object({
  date: z.string(),
  driver_number: z.number().int(),
  gap_to_leader: gapValue,
  interval: gapValue,
});

export const of1Position = z.object({
  date: z.string(),
  driver_number: z.number().int(),
  position: z.number().int(),
});

export const of1Stint = z.object({
  driver_number: z.number().int(),
  stint_number: z.number().int(),
  compound: nstr,
  lap_start: z.number().int().nullable().optional(),
  lap_end: z.number().int().nullable().optional(),
  tyre_age_at_start: z.number().int().nullable().optional(),
});

export const of1Pit = z.object({
  date: z.string(),
  driver_number: z.number().int(),
  lap_number: z.number().int().nullable().optional(),
  lane_duration: nnum,
  pit_duration: nnum,
  stop_duration: nnum,
});

export const of1RaceControl = z.object({
  date: z.string(),
  driver_number: z.number().int().nullable().optional(),
  lap_number: z.number().int().nullable().optional(),
  category: nstr,
  flag: nstr,
  scope: nstr,
  sector: z.number().int().nullable().optional(),
  message: z.string(),
  qualifying_phase: z.number().int().nullable().optional(),
});

export const of1Weather = z.object({
  date: z.string(),
  air_temperature: nnum,
  track_temperature: nnum,
  humidity: nnum,
  pressure: nnum,
  rainfall: z.union([z.boolean(), num]).nullable().optional(),
  wind_direction: nnum,
  wind_speed: nnum,
});

const durationOrPhases = z.union([num, z.array(num.nullable())]).nullable().optional();

export const of1SessionResult = z.object({
  driver_number: z.number().int(),
  position: z.number().int().nullable().optional(),
  number_of_laps: z.number().int().nullable().optional(),
  points: nnum,
  dnf: z.boolean().nullable().optional(),
  dns: z.boolean().nullable().optional(),
  dsq: z.boolean().nullable().optional(),
  duration: durationOrPhases,
  gap_to_leader: z.union([num, z.string(), z.array(z.union([num, z.string()]).nullable())]).nullable().optional(),
});

export const of1StartingGrid = z.object({
  driver_number: z.number().int(),
  position: z.number().int(),
  lap_duration: nnum,
});

export const of1CarData = z.object({
  date: z.string(),
  driver_number: z.number().int(),
  speed: nnum,
  throttle: nnum,
  brake: nnum,
  n_gear: nnum,
  rpm: nnum,
  drs: nnum,
});

export const of1Location = z.object({
  date: z.string(),
  driver_number: z.number().int(),
  x: num,
  y: num,
  z: nnum,
});

export const of1Token = z.object({
  access_token: z.string().min(1),
  expires_in: z.union([z.string(), num]),
  token_type: z.string().optional(),
});

export type OF1Driver = z.infer<typeof of1Driver>;
export type OF1Lap = z.infer<typeof of1Lap>;
export type OF1Interval = z.infer<typeof of1Interval>;
export type OF1Position = z.infer<typeof of1Position>;
export type OF1Stint = z.infer<typeof of1Stint>;
export type OF1Pit = z.infer<typeof of1Pit>;
export type OF1RaceControl = z.infer<typeof of1RaceControl>;
export type OF1Weather = z.infer<typeof of1Weather>;
export type OF1SessionResult = z.infer<typeof of1SessionResult>;
export type OF1StartingGrid = z.infer<typeof of1StartingGrid>;
export type OF1CarData = z.infer<typeof of1CarData>;
export type OF1Location = z.infer<typeof of1Location>;

// ---------------------------------------------------------------------------------------------
// Jolpica-F1 (Ergast-compatible, https://github.com/jolpica/jolpica-f1)
// ---------------------------------------------------------------------------------------------

const jDriver = z.object({
  driverId: z.string(),
  permanentNumber: z.string().optional(),
  code: z.string().optional(),
  givenName: z.string(),
  familyName: z.string(),
  nationality: z.string().optional(),
});

const jConstructor = z.object({
  constructorId: z.string(),
  name: z.string(),
});

const jResult = z.object({
  number: z.string(),
  position: z.string(),
  positionText: z.string(),
  points: z.string(),
  Driver: jDriver,
  Constructor: jConstructor,
  grid: z.string().optional(),
  laps: z.string().optional(),
  status: z.string(),
  Time: z.object({ millis: z.string().optional(), time: z.string() }).optional(),
  FastestLap: z
    .object({
      rank: z.string().optional(),
      lap: z.string().optional(),
      Time: z.object({ time: z.string() }).optional(),
    })
    .optional(),
});

const jQualifying = z.object({
  number: z.string(),
  position: z.string(),
  Driver: jDriver,
  Constructor: jConstructor,
  Q1: z.string().optional(),
  Q2: z.string().optional(),
  Q3: z.string().optional(),
});

const jRaceBase = z.object({
  season: z.string(),
  round: z.string(),
  raceName: z.string(),
  date: z.string(),
  time: z.string().optional(),
});

export const jolpicaResultsPage = z.object({
  MRData: z.object({
    total: z.string(),
    limit: z.string(),
    offset: z.string(),
    RaceTable: z.object({
      Races: z.array(
        jRaceBase.extend({
          Results: z.array(jResult).optional(),
          SprintResults: z.array(jResult).optional(),
          QualifyingResults: z.array(jQualifying).optional(),
        }),
      ),
    }),
  }),
});

const jDriverStanding = z.object({
  position: z.string().optional(),
  positionText: z.string(),
  points: z.string(),
  wins: z.string(),
  Driver: jDriver,
  Constructors: z.array(jConstructor),
});

const jConstructorStanding = z.object({
  position: z.string().optional(),
  positionText: z.string(),
  points: z.string(),
  wins: z.string(),
  Constructor: jConstructor,
});

export const jolpicaDriverStandings = z.object({
  MRData: z.object({
    StandingsTable: z.object({
      StandingsLists: z.array(z.object({ season: z.string(), round: z.string(), DriverStandings: z.array(jDriverStanding) })),
    }),
  }),
});

export const jolpicaConstructorStandings = z.object({
  MRData: z.object({
    StandingsTable: z.object({
      StandingsLists: z.array(z.object({ season: z.string(), round: z.string(), ConstructorStandings: z.array(jConstructorStanding) })),
    }),
  }),
});

export type JolpicaResult = z.infer<typeof jResult>;
export type JolpicaQualifying = z.infer<typeof jQualifying>;
export type JolpicaResultsPage = z.infer<typeof jolpicaResultsPage>;
export type JolpicaDriverStanding = z.infer<typeof jDriverStanding>;
export type JolpicaConstructorStanding = z.infer<typeof jConstructorStanding>;
