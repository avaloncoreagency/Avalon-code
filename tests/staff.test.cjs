const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = path => fs.readFileSync(path,"utf8");

test("Staff: My Profile persists display name, role title, working hours and time off", () => {
  const page = read("src/app/admin/profile/page.tsx");
  const actions = read("src/app/admin/profile/actions.ts");
  assert.match(page,/saveStaffProfile/);
  assert.match(page,/saveStaffAvailability/);
  assert.match(page,/MyProfilePhoto/);
  assert.match(page,/office_time_off/);
  assert.match(actions,/requireOwner\(\)/);
  assert.match(actions,/user_id: user.id/);
  assert.doesNotMatch(actions,/service_role|SERVICE_ROLE/);
});

test("Staff: global bell reads recipient-specific CRM notices and supports read receipts", () => {
  const bell = read("src/components/suite/chrome.tsx");
  const endpoint = read("src/app/admin/api/notifications/route.ts");
  const shell = read("src/components/suite/suite.tsx");
  assert.match(bell,/staffNotices\.map/);
  assert.match(bell,/window\.setInterval/);
  assert.match(endpoint,/eq\("recipient_id", session\.user\.id\)/);
  assert.match(endpoint,/is\("read_at", null\)/);
  assert.match(shell,/office_profiles/);
  assert.match(shell,/initialStaffNotices/);
});

test("Staff: notification SQL has owner-only availability, deduped calendar and message triggers", () => {
  const sql = read("supabase/migrations/20261103223000_staff_profiles_notifications.sql");
  assert.match(sql,/alter table public\.office_availability enable row level security/);
  assert.match(sql,/office_availability_write/);
  assert.match(sql,/crm_event_staff_alert/);
  assert.match(sql,/office_message_staff_alert/);
  assert.match(sql,/new\.version/);
  assert.match(sql,/crm_private\.notify/);
  assert.doesNotMatch(sql,/service_role|SERVICE_ROLE/i);
});
