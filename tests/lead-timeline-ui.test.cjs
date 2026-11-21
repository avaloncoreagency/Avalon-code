const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const drawer = fs.readFileSync("src/components/crm/lead-timeline.tsx", "utf8");
const css = fs.readFileSync("src/components/crm/lead-timeline.module.css", "utf8");

test("lead drawer preserves history and attachments while reducing default visual noise", () => {
  assert.match(drawer, /timelineWindow\(entries \?\? \[\], historyFilter, showFullHistory, 8\)/);
  assert.match(drawer, /<details className=\{s\.composeSection\}>/);
  assert.match(drawer, /<details className=\{s\.attachmentsSection\}>/);
  assert.match(drawer, /history\.visible\.map\(e =>/);
  assert.match(drawer, /setShowFullHistory\(true\)/);
  assert.match(drawer, /setShowFullHistory\(false\)/);
  assert.match(drawer, /historyFilter === option\.key/);
  assert.match(drawer, /role="dialog" aria-modal="true"/);
  assert.match(drawer, /if \(e\.key === "Escape"\)/);
  assert.match(drawer, /getClientRects\(\)\.length > 0/, "closed-details controls cannot steal Tab focus");
  assert.match(drawer, /root\.style\.overflow = "hidden"/, "background stays still when detail is open");
  assert.match(css, /\.drawerHead \{[^}]*position:sticky/s);
  assert.match(css, /\.historySection \{/);
  assert.match(css, /\.historyFilters \{/);
  assert.match(css, /@media \(max-width:700px\)/);
});
