import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/timing/[resource]/route";
import { SEASON_2026, scheduleState } from "@/lib/config/season-2026";

/**
 * Route-level checks of the provider contract. None of these touch the network: every refusal happens before an
 * upstream request would be made.
 */
async function call(resource: string, query: string) {
  const res = await GET(new NextRequest(`http://localhost/api/timing/${resource}?${query}`), { params: Promise.resolve({ resource }) });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const upcoming = SEASON_2026.events.flatMap((e) => e.sessions).find((s) => scheduleState(s) === "upcoming");
const cancelled = SEASON_2026.events.flatMap((e) => e.sessions).find((s) => s.cancelled);

describe("timing API", () => {
  const saved = { u: process.env.OPENF1_USERNAME, p: process.env.OPENF1_PASSWORD };
  afterEach(() => {
    process.env.OPENF1_USERNAME = saved.u;
    process.env.OPENF1_PASSWORD = saved.p;
  });

  it("serves demo data labelled as DEMO", async () => {
    const { status, body } = await call("snapshot", "mode=demo&t=1200");
    expect(status).toBe(200);
    expect((body.provenance as { mode: string }).mode).toBe("DEMO");
    expect((body.data as { rows: unknown[] }).rows).toHaveLength(22);
  });

  it("refuses live data without credentials instead of substituting anything", async () => {
    delete process.env.OPENF1_USERNAME;
    delete process.env.OPENF1_PASSWORD;
    const session = upcoming ?? SEASON_2026.events[0]!.sessions[0]!;
    const { status, body } = await call("snapshot", `mode=live&session=${session.openf1SessionKey}`);
    expect(status).toBe(503);
    expect(body.code).toBe("CREDENTIALS_MISSING");
    expect(body).not.toHaveProperty("data");
  });

  it.skipIf(!upcoming)("does not serve an upcoming session as historical", async () => {
    const { status, body } = await call("snapshot", `mode=historical&session=${upcoming!.openf1SessionKey}`);
    expect(status).toBe(409);
    expect(body.code).toBe("NOT_PUBLISHED");
  });

  it.skipIf(!cancelled)("reports cancelled sessions as not found", async () => {
    const { status, body } = await call("snapshot", `mode=historical&session=${cancelled!.openf1SessionKey}`);
    expect(status).toBe(404);
    expect(String(body.error)).toMatch(/cancelled/);
  });

  it("validates parameters", async () => {
    expect((await call("snapshot", "mode=bogus")).status).toBe(400);
    expect((await call("nonsense", "mode=demo")).status).toBe(400);
    expect((await call("snapshot", "mode=historical&session=abc")).status).toBe(400);
    expect((await call("laps", "mode=historical&session=11388")).status).toBe(400);
    expect((await call("snapshot", "mode=historical&session=999999")).status).toBe(404);
  });
});
