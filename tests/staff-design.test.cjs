const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = file => fs.readFileSync(file, "utf8");

test("staff profile design keeps editable identity, availability and security actions", () => {
  const page = read("src/app/admin/profile/page.tsx");
  const styles = read("src/app/admin/profile/staff-profile.module.css");
  for (const flow of ["saveStaffProfile","saveStaffAvailability","addStaffTimeOff","deleteStaffTimeOff","MfaEnroll","removeTotpFactor"])
    assert.ok(page.includes(flow), flow);
  for (const part of ['id="staff-identity"','id="availability"','id="time-off"','href="#identity"'])
    assert.ok(page.includes(part), part);
  assert.match(styles, /\.mainGrid/);
  assert.match(styles, /\.dayRow/);
  assert.match(styles, /@media \(max-width: 700px\)/);
  assert.match(styles, /:focus-visible/);
});

test("staff bell keeps persistent personal notifications and readable actions", () => {
  const chrome = read("src/components/suite/chrome.tsx");
  const css = read("src/components/suite/suite.module.css");
  assert.match(chrome, /staffNotices\.map/);
  assert.match(chrome, /markNotice\(n\.id\)/);
  assert.match(chrome, /href="\/admin\/workspace\/crm\/notifications"/);
  assert.match(chrome, /alertCategory/);
  assert.match(css, /\.alertPopover/);
  assert.match(css, /\.alertRead:focus-visible/);
  assert.match(css, /\.alertEmptyState/);
});

test("staff availability is displayed as a card, not a raw unformatted string", () => {
  const office = read("src/components/office/office.tsx");
  const css = read("src/components/office/office.module.css");
  assert.match(office, /memberSchedule/);
  assert.match(office, /scheduleDays/);
  assert.match(css, /\.scheduleDay/);
  assert.doesNotMatch(office, /Sin fuente de presencia conectada/);
});
