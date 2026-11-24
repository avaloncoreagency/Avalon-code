const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");

const page = readFileSync("src/app/admin/workspace/crm/messages/page.tsx", "utf8");
const actions = readFileSync("src/app/admin/workspace/crm/messages/actions.ts", "utf8");
const nav = readFileSync("src/components/crm/navigation.tsx", "utf8");

test("owner Messages is a real CRM destination, not an external or synthetic inbox", () => {
  assert.match(nav, /slug: "messages".*\/admin\/workspace\/crm\/messages/);
  assert.match(nav, /messages: \["Mensajes internos", "Internal messages"\]/);
  assert.match(page, /await requireOwner\(\)/);
  assert.match(page, /staff_private_messages/);
  assert.match(page, /staff_contacts/);
  assert.doesNotMatch(page, /service_role|SUPABASE_SERVICE_ROLE_KEY|createClient\(/);
});

test("owner messages reuse participant-only Staff RLS and never fetch a global private inbox", () => {
  assert.match(page, /sender_id\.eq\./);
  assert.match(page, /recipient_id\.eq\./);
  assert.match(page, /count: "exact"/);
  assert.match(page, /PAGE_SIZE = 50/);
  assert.match(page, /\.range\(page \* PAGE_SIZE,/);
  assert.match(page, /!ready \?/);
});

test("send and mark-read actions require an owner, validate identity and fail closed", () => {
  assert.match(actions, /export async function sendInternalMessage/);
  assert.match(actions, /export async function markInternalMessageRead/);
  assert.ok(actions.includes('import { ownerForAction } from "@/lib/os/actions";'));
  assert.equal((actions.match(/await ownerForAction\(\)/g) || []).length, 2);
  assert.match(actions, /recipient_id === userId/);
  assert.match(actions, /body\.length > 4000/);
  assert.match(actions, /\.eq\("recipient_id", userId\)\.is\("read_at", null\)/);
  assert.match(actions, /revalidatePath\(PATH\)/);
  assert.doesNotMatch(actions, /service_role|SUPABASE_SERVICE_ROLE_KEY|admin\.from|rpc\(/);
});
