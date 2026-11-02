const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const migration = fs.readFileSync('supabase/migrations/20261102_owner_memberships_proposed.sql', 'utf8');

test('membership migration binds identities to Supabase Auth UUIDs', () => {
  assert.match(migration, /user_id uuid primary key references auth\.users\(id\)/i);
  assert.match(migration, /role text not null check \(role in \('owner'\)\)/i);
});

test('membership migration enforces row-level security and UUID-scoped self-read', () => {
  assert.match(migration, /alter table public\.agency_memberships enable row level security/i);
  assert.match(migration, /for select to authenticated\s+using \(\(select auth\.uid\(\)\) = user_id\)/i);
});

test('membership migration does not grant owner access or client-side writes', () => {
  assert.doesNotMatch(migration, /insert into\s+(public\.)?agency_memberships/i);
  assert.doesNotMatch(migration, /create policy[^;]*for (insert|update|delete)/i);
  assert.match(migration, /revoke insert, update, delete on public\.agency_memberships from anon, authenticated/i);
  assert.match(migration, /revoke all on public\.agency_memberships from anon/i);
});
