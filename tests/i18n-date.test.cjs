const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");

const mod = { exports: {} };
const compiled = ts.transpileModule(fs.readFileSync("src/lib/i18n.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(compiled, { module: mod, exports: mod.exports, Date, Intl, Number });
const { AVALON_TIME_ZONE, formatDate } = mod.exports;

test("shared date formatter is fixed to the agency timezone, independent of the viewer's timezone", () => {
  assert.equal(AVALON_TIME_ZONE, "America/New_York");
  const moment = new Date("2026-11-16T04:30:00Z"); // 11:30 PM on Nov 15 in Miami
  const expected = new Intl.DateTimeFormat("en-US", {
    timeZone: AVALON_TIME_ZONE, dateStyle: "medium", timeStyle: "short",
  }).format(moment);
  const asUtc = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC", dateStyle: "medium", timeStyle: "short",
  }).format(moment);
  assert.notEqual(expected, asUtc, "the server's UTC clock would display the wrong local day");
  assert.equal(formatDate("en", moment.toISOString(), true), expected);
  assert.equal(formatDate("en", moment, true), expected);
});

test("date-only strings preserve their intended calendar date in both languages", () => {
  for (const date of ["2026-01-01", "2026-07-14", "2026-11-16", "2026-12-31"]) {
    const noon = new Date(date + "T12:00:00Z");
    for (const [lang, locale] of [["es", "es-ES"], ["en", "en-US"]]) {
      const expected = new Intl.DateTimeFormat(locale, {
        timeZone: AVALON_TIME_ZONE, dateStyle: "medium",
      }).format(noon);
      assert.equal(formatDate(lang, date), expected, lang + " " + date);
    }
  }
});

test("DST transitions always use the correct Eastern offset", () => {
  for (const timestamp of [
    "2026-03-08T06:30:00Z",
    "2026-03-08T07:30:00Z",
    "2026-11-01T05:30:00Z",
    "2026-11-01T06:30:00Z",
  ]) {
    for (const [lang, locale] of [["es", "es-ES"], ["en", "en-US"]]) {
      const expected = new Intl.DateTimeFormat(locale, {
        timeZone: AVALON_TIME_ZONE, dateStyle: "medium", timeStyle: "short",
      }).format(new Date(timestamp));
      assert.equal(formatDate(lang, timestamp, true), expected);
    }
  }
});

test("unknown and invalid dates render an honest unavailable marker", () => {
  assert.equal(formatDate("es", null), "—");
  assert.equal(formatDate("en", undefined), "—");
  assert.equal(formatDate("es", "invalid"), "—");
});
