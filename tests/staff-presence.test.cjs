const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const read = path => fs.readFileSync(path, "utf8");

const testModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(read("src/lib/office/presence.ts"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: testModule, exports: testModule.exports, Intl, Date, Array, Object });
const { staffPresence, zonedMoment } = testModule.exports;

const id = "person-a";
const ny = { user_id: id, timezone: "America/New_York", weekly_hours: { tue: ["09:00","17:00"] } };
const testMoment = new Date("2026-11-03T15:30:00Z"); // Tuesday 10:30 EST
const status = (h, leave = [], events = [], now = testMoment) => ({ ...staffPresence(id, h, leave, events, now) });
const meeting = {
  owner_id: "someone-else", attendee_ids: [id], starts_at: "2026-11-03T15:00:00Z",
  ends_at: "2026-11-03T16:00:00Z", status: "scheduled",
};

test("Green while inside working hours and no current meeting", () => {
  assert.deepEqual(status(ny), { state: "active", reason: "available" });
  assert.deepEqual(status({ ...ny, weekly_hours: { tue: ["11:00","17:00"] } }),
    { state: "inactive", reason: "out_of_hours" });
});

test("Yellow only for an in-progress calendar event owned by or attended by that member", () => {
  assert.deepEqual(status(ny, [], [meeting]), { state: "busy", reason: "calendar" });
  assert.deepEqual(status(ny, [], [{ ...meeting, attendee_ids: [], owner_id: id }]),
    { state: "busy", reason: "calendar" });
  assert.deepEqual(status(ny, [], [{ ...meeting, attendee_ids: ["another-person"] }]),
    { state: "active", reason: "available" });
  assert.deepEqual(status(ny, [], [{ ...meeting, status: "cancelled" }]),
    { state: "active", reason: "available" });
  assert.deepEqual(status(ny, [], [{ ...meeting, ends_at: "2026-11-03T15:30:00Z" }]),
    { state: "active", reason: "available" });
});

test("Red takes precedence on days off and outside working hours", () => {
  const leave = [{ user_id: id, starts_on: "2026-11-02", ends_on: "2026-11-04" }];
  assert.deepEqual(status(ny, leave, [meeting]), { state: "inactive", reason: "time_off" });
  assert.deepEqual(status({ ...ny, weekly_hours: {} }, [], [meeting]),
    { state: "inactive", reason: "out_of_hours" });
  assert.deepEqual(status(null, [], [meeting]), { state: "inactive", reason: "unconfigured" });
  assert.deepEqual(status({ ...ny, timezone: "Invalid/Zone" }),
    { state: "inactive", reason: "unavailable" });
});

test("Timezone conversion honors local calendar day and DST", () => {
  assert.deepEqual({ ...zonedMoment(new Date("2026-03-08T07:30:00Z"), "America/New_York") },
    { day: "sun", date: "2026-03-08", time: "03:30" });
  const afterDST = { user_id: id, timezone: "America/New_York", weekly_hours: { sun: ["03:00","04:00"] } };
  assert.equal(status(afterDST, [], [], new Date("2026-03-08T07:30:00Z")).state, "active");
  assert.equal(status(afterDST, [], [], new Date("2026-03-08T06:30:00Z")).state, "inactive");
  const pacific = { user_id: id, timezone: "America/Los_Angeles", weekly_hours: { tue: ["07:00","08:00"] } };
  assert.equal(status(pacific).state, "active"); // Tuesday 07:30 PST
});

test("Avatar, staff directory, header and floorplan reuse the same presence rules", () => {
  const avatar = read("src/components/office/presence-avatar.tsx");
  const office = read("src/components/office/office.tsx");
  const floor = read("src/components/office/iso-office.tsx");
  const header = read("src/components/suite/chrome.tsx");
  const endpoint = read("src/app/admin/api/staff-presence/route.ts");
  const directory = read("src/app/admin/workspace/crm/office/api/route.ts");
  assert.match(avatar, /data-presence=\{state\}/);
  assert.match(office, /PresenceAvatar/);
  assert.match(office, /presenceName/);
  assert.match(floor, /s\.lampBusy/);
  assert.match(floor, /s\.lampInactive/);
  assert.match(header, /initialPresence/);
  assert.match(header, /staff-presence/);
  assert.match(endpoint, /getOwnerSession\(\)/);
  assert.doesNotMatch(endpoint, /searchParams|service_role|request\.json/i);
  assert.match(directory, /staffPresence\(m\.user_id/);
  assert.doesNotMatch(floor, /recentMinutes <= 60/);
});
