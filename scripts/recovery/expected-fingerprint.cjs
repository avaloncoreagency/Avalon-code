#!/usr/bin/env node
// Build the EXPECTED fingerprint: apply every repo migration, in order, on an isolated in-memory PostgreSQL (PGlite)
// with the same Supabase stub the test suite uses, then run schema-fingerprint.sql. No network, no real data.
// Usage: NODE_PATH=./tests/qa/node_modules node scripts/recovery/expected-fingerprint.cjs > expected.json
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
(async () => {
  const db = new PGlite();
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.exec(`create schema if not exists storage;
    create table if not exists storage.buckets (id text primary key, name text not null, public boolean not null default false, file_size_limit bigint, allowed_mime_types text[]);
    create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text not null, owner uuid, unique (bucket_id, name));`);
  const files = fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort();
  for (const f of files) {
    try { await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8')); }
    catch (e) { console.error(`migration ${f} failed: ${e.message}`); process.exit(1); }
  }
  const { rows } = await db.query(fs.readFileSync('scripts/recovery/schema-fingerprint.sql', 'utf8'));
  process.stdout.write(JSON.stringify({ migrations: files, fingerprint: rows[0].fingerprint }, null, 1) + '\n');
  await db.close();
})();
