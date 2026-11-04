// Regression for missing/stale weekly availability: no network, DB, or real users.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const actionPath = "src/app/admin/profile/actions.ts";
const actionJS = ts.transpileModule(fs.readFileSync(actionPath, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const ownerId = "00000000-0000-4000-8000-0000000000ab";

function fakeStore(initial = null, options = {}) {
  const state = { row: initial ? { ...initial } : null, calls: [] };
  const copy = value => JSON.parse(JSON.stringify(value));
  const result = kind => ({
    select(columns) {
      assert.match(columns, /weekly_hours/, "Write must return the stored schedule");
      return {
        async maybeSingle() {
          if (kind === "update") {
            if (!state.row || options.silentUpdate) return { data: null, error: null };
            if (options.staleUpdate) return { data: copy(state.row), error: null };
            state.row = { ...state.row, ...state.calls.at(-1).payload };
            return { data: copy(state.row), error: null };
          }
          if (options.silentInsert) return { data: null, error: null };
          if (options.insertError) return { data: null, error: { code: "23505" } };
          state.row = copy(state.calls.at(-1).payload);
          return { data: copy(state.row), error: null };
        },
      };
    },
  });
  state.db = {
    from(table) {
      assert.equal(table, "office_availability");
      return {
        update(payload) {
          assert.equal(Object.hasOwn(payload, "user_id"), false,
            "Restricted column user_id must never be in UPDATE");
          state.calls.push({ kind: "update", payload: copy(payload) });
          return {
            eq(key, value) {
              assert.equal(key, "user_id");
              assert.equal(value, ownerId, "Update must be scoped to the authenticated owner");
              return result("update");
            },
          };
        },
        insert(payload) {
          assert.equal(payload.user_id, ownerId, "Insert must use the authenticated owner's ID");
          state.calls.push({ kind: "insert", payload: copy(payload) });
          return result("insert");
        },
      };
    },
  };
  return state;
}

function action(state) {
  const mod = { exports: {} };
  const revalidated = [];
  const mocks = {
    "next/cache": { revalidatePath: path => revalidated.push(path) },
    "next/navigation": { redirect: url => {
      const error = new Error("mock-redirect");
      error.url = url;
      throw error;
    } },
    "@/lib/auth/session": { requireOwner: async () => ({ user: { id: ownerId }, supabase: state.db }) },
  };
  vm.runInNewContext(actionJS, {
    module: mod, exports: mod.exports,
    require(name) {
      assert.ok(Object.hasOwn(mocks, name), "Unexpected dependency " + name);
      return mocks[name];
    },
  }, { filename: actionPath });
  return { save: mod.exports.saveStaffAvailability, revalidated };
}

function form(overrides = {}) {
  const input = {
    timezone: "America/New_York", mon_enabled: "on",
    mon_start: "10:00", mon_end: "17:00",
    quiet_start: "18:00", quiet_end: "09:00",
    ...overrides,
  };
  return { get(key) { return input[key] ?? null; } };
}

async function saveAndStatus(state, fields) {
  const { save, revalidated } = action(state);
  let redirectUrl = null;
  try {
    await save(form(fields));
  } catch (error) {
    if (error.message !== "mock-redirect") throw error;
    redirectUrl = error.url;
  }
  assert.ok(redirectUrl, "The action must redirect with a visible status");
  assert.ok(revalidated.includes("/admin/profile"), "The profile must be revalidated");
  return new URL(redirectUrl, "https://test.invalid").searchParams.get("profile");
}

test("availability: a new owner gets a real INSERT and a verified saved status", async () => {
  const state = fakeStore();
  assert.equal(await saveAndStatus(state), "availability-saved");
  assert.deepEqual(state.calls.map(call => call.kind), ["update", "insert"]);
  assert.deepEqual(state.row.weekly_hours, { mon: ["10:00", "17:00"] });
  assert.equal(state.row.user_id, ownerId);
  assert.equal(state.row.timezone, "America/New_York");
});

test("availability: existing owner updates only granted columns and retains changes", async () => {
  const state = fakeStore({
    user_id: ownerId, timezone: "America/New_York",
    weekly_hours: { mon: ["09:00", "17:00"] },
    quiet_start: "18:00", quiet_end: "09:00",
  });
  assert.equal(await saveAndStatus(state, { mon_start: "11:30", quiet_start: "19:00" }),
    "availability-saved");
  assert.deepEqual(state.calls.map(call => call.kind), ["update"]);
  assert.deepEqual(state.row.weekly_hours, { mon: ["11:30", "17:00"] });
  assert.equal(state.row.quiet_start, "19:00");
});

test("availability: silent zero-row mutation is NEVER reported as saved", async () => {
  const state = fakeStore(null, { silentInsert: true });
  assert.equal(await saveAndStatus(state), "availability-failed");
  assert.equal(state.row, null);
});

test("availability: an unchanged returned schedule is NEVER reported as saved", async () => {
  const state = fakeStore({
    user_id: ownerId, timezone: "America/New_York",
    weekly_hours: { mon: ["09:00", "17:00"] },
    quiet_start: "18:00", quiet_end: "09:00",
  }, { staleUpdate: true });
  assert.equal(await saveAndStatus(state), "availability-failed");
  assert.deepEqual(state.row.weekly_hours, { mon: ["09:00", "17:00"] });
});

test("availability: bad hours are rejected without a write", async () => {
  const state = fakeStore();
  assert.equal(await saveAndStatus(state, { mon_start: "19:00", mon_end: "09:00" }),
    "availability-invalid");
  assert.equal(state.calls.length, 0);
});

test("availability UI distinguishes verified saves from defaults and failed writes", () => {
  const page = fs.readFileSync("src/app/admin/profile/page.tsx", "utf8");
  assert.match(page, /availability-saved/);
  assert.match(page, /availability-failed/);
  assert.match(page, /Aún no has guardado tu disponibilidad/);
});
