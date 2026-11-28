// Test-only PostgREST-compatible bridge over an isolated PGlite database.
// Every request runs as the `authenticated` role with the caller's synthetic
// JWT subject, so the real RLS policies, column grants, triggers and RPCs of
// the migrations are what answer. Supports the subset supabase-js uses here:
// select with one-level embeds, filters, or(), order, range/limit, exact
// counts, insert, update and /rpc/<fn>. Never point this at a real database.
const { createServer } = require('node:http');

const IDENT = /^[a-z_][a-z0-9_]*$/;
const q = name => { if (!IDENT.test(name)) throw Object.assign(new Error(`bad identifier ${name}`), { code: 'PGRST100' }); return `"${name}"`; };

function splitTop(text, sep = ',') {
  const out = []; let depth = 0, quote = false, escaped = false, cur = '';
  for (const ch of text) {
    if (escaped) { cur += ch; escaped = false; continue; }
    if (quote && ch === '\\') { cur += ch; escaped = true; continue; }
    if (ch === '"') quote = !quote;
    if (!quote && ch === '(') depth++;
    if (!quote && ch === ')') depth--;
    if (!quote && depth === 0 && ch === sep) { out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out.map(s => s.trim()).filter(Boolean);
}

/** settings->operations->>client_lead_id → "settings"->'operations'->>'client_lead_id' */
function column(expr, alias) {
  const parts = expr.split(/(->>|->)/);
  let sql = `${alias}.${q(parts[0])}`;
  for (let i = 1; i < parts.length; i += 2) {
    if (!IDENT.test(parts[i + 1])) throw Object.assign(new Error('bad json path'), { code: 'PGRST100' });
    sql += `${parts[i]}'${parts[i + 1]}'`;
  }
  return sql;
}

const unquote = v => (v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1).replace(/\\([\\"])/g, '$1') : v);
// PGlite serializes parameters by inferred type; boolean columns need JS booleans.
const literal = v => (v === 'true' ? true : v === 'false' ? false : unquote(v));

function condition(col, raw, alias, param) {
  let negate = false, rest = raw;
  if (rest.startsWith('not.')) { negate = true; rest = rest.slice(4); }
  const dot = rest.indexOf('.');
  const op = rest.slice(0, dot), value = rest.slice(dot + 1);
  const c = column(col, alias);
  let sql;
  switch (op) {
    case 'eq': sql = `${c} = ${param(literal(value))}`; break;
    case 'neq': sql = `${c} <> ${param(literal(value))}`; break;
    case 'lt': sql = `${c} < ${param(unquote(value))}`; break;
    case 'lte': sql = `${c} <= ${param(unquote(value))}`; break;
    case 'gt': sql = `${c} > ${param(unquote(value))}`; break;
    case 'gte': sql = `${c} >= ${param(unquote(value))}`; break;
    case 'like': sql = `${c}::text like ${param(unquote(value).replace(/\*/g, '%'))}`; break;
    case 'ilike': sql = `${c}::text ilike ${param(unquote(value).replace(/\*/g, '%'))}`; break;
    case 'imatch': sql = `${c}::text ~* ${param(unquote(value))}`; break;
    case 'is': if (!['null', 'true', 'false'].includes(value)) throw Object.assign(new Error('bad is'), { code: 'PGRST100' }); sql = `${c} is ${value}`; break;
    case 'in': sql = `${c}::text = any(${param(splitTop(value.slice(1, -1)).map(unquote))}::text[])`; break;
    default: throw Object.assign(new Error(`operator ${op} not supported by test bridge`), { code: 'PGRST100' });
  }
  return negate ? `not (${sql})` : sql;
}

async function relation(db, from, to, hint = null) {
  const rows = (await db.query(`
    select c.conrelid::regclass::text src, c.confrelid::regclass::text dst,
      (select attname from pg_attribute where attrelid=c.conrelid and attnum=c.conkey[1]) src_col,
      (select attname from pg_attribute where attrelid=c.confrelid and attnum=c.confkey[1]) dst_col
    from pg_constraint c where c.contype='f' and array_length(c.conkey,1)=1 and ($1::text is null or c.conname=$1) and (
      (c.conrelid='public.${from}'::regclass and c.confrelid='public.${to}'::regclass) or
      (c.conrelid='public.${to}'::regclass and c.confrelid='public.${from}'::regclass))`, [hint])).rows;
  const m2o = rows.filter(r => r.src.replace('public.', '') === from);
  const o2m = rows.filter(r => r.src.replace('public.', '') === to);
  if (m2o.length === 1) return { kind: 'one', local: m2o[0].src_col, remote: m2o[0].dst_col };
  if (o2m.length === 1 && m2o.length === 0) return { kind: 'many', local: o2m[0].dst_col, remote: o2m[0].src_col };
  throw Object.assign(new Error(`ambiguous or missing relationship ${from}→${to}`), { code: 'PGRST200' });
}

const embedPattern = /^(?:([a-z_]+):)?([a-z_]+)(?:!([a-z_]+))?(?:!(inner))?\((.*)\)$/;

async function readEmbeds(db, table, url) {
  const embeds = new Map();
  for (const item of splitTop(url.searchParams.get('select') || '*')) {
    const match = item.match(embedPattern);
    if (!match) continue;
    const [, alias, tableName, hint, join] = match;
    const name = alias ?? tableName;
    const foreignKey = await relation(db, table, tableName, hint === 'inner' ? null : hint);
    embeds.set(name, { table: tableName, foreignKey, inner: hint === 'inner' || join === 'inner' });
  }
  return embeds;
}

function embeddedFrom(embed, name, parentAlias, url, param) {
  const { table, foreignKey } = embed;
  const conditions = [`e.${q(foreignKey.remote)} = ${parentAlias}.${q(foreignKey.local)}`];
  for (const [key, value] of url.searchParams) {
    if (key.startsWith(name + '.')) conditions.push(condition(key.slice(name.length + 1), value, 'e', param));
  }
  return `from public.${q(table)} e where ${conditions.join(' and ')}`;
}

async function selectList(db, table, select, alias, depth = 0, read = null) {
  const items = splitTop(select || '*');
  const parts = [];
  for (const item of items) {
    const embed = item.match(embedPattern);
    if (!embed) { parts.push(item === '*' ? `${alias}.*` : `${column(item, alias)} as ${q(item.split(/->>?/).pop())}`); continue; }
    if (depth > 0) throw Object.assign(new Error('nested embeds not supported'), { code: 'PGRST100' });
    const [, name, rel, hint, , cols] = embed;
    if (!cols) continue;
    const r = read?.embeds.get(name ?? rel)?.foreignKey ?? await relation(db, table, rel, hint === 'inner' ? null : hint);
    const inner = await selectList(db, rel, cols, 'e', depth + 1);
    const from = read
      ? embeddedFrom(read.embeds.get(name ?? rel), name ?? rel, alias, read.url, read.param)
      : `from public.${q(rel)} e where e.${q(r.remote)} = ${alias}.${q(r.local)}`;
    parts.push(r.kind === 'one'
      ? `(select to_jsonb(x) from (select ${inner} ${from}) x) as ${q(name ?? rel)}`
      : `coalesce((select jsonb_agg(to_jsonb(x)) from (select ${inner} ${from}) x), '[]'::jsonb) as ${q(name ?? rel)}`);
  }
  return parts.join(', ');
}

function filters(url, alias, param, embeds = new Map()) {
  const where = [];
  const predicate = (key, value) => {
    const embed = embeds.get(key);
    if (!embed) return condition(key, value, alias, param);
    if (value !== 'is.null' && value !== 'not.is.null') throw new Error('unsupported embed filter');
    return `${value === 'is.null' ? 'not ' : ''}exists (select 1 ${embeddedFrom(embed, key, alias, url, param)})`;
  };
  for (const [name, embed] of embeds) if (embed.inner) where.push(predicate(name, 'not.is.null'));
  for (const [key, value] of url.searchParams) {
    if (['select', 'order', 'limit', 'offset', 'columns', 'on_conflict'].includes(key)) continue;
    if (embeds.has(key.split('.')[0]) && key.includes('.')) continue;
    if (key === 'or') {
      where.push('(' + splitTop(value.slice(1, -1)).map(part => {
        const first = part.indexOf('.');
        return predicate(part.slice(0, first), part.slice(first + 1));
      }).join(' or ') + ')');
      continue;
    }
    where.push(predicate(key, value));
  }
  return where.length ? ` where ${where.join(' and ')}` : '';
}

function orderBy(url, alias) {
  const order = url.searchParams.get('order');
  if (!order) return '';
  return ' order by ' + order.split(',').map(o => {
    const [col, dir = 'asc', nulls] = o.split('.');
    return `${column(col, alias)} ${dir === 'desc' ? 'desc' : 'asc'}${nulls === 'nullsfirst' ? ' nulls first' : nulls === 'nullslast' ? ' nulls last' : ''}`;
  }).join(', ');
}

async function readPage(db, url, table, source, values, param, prefer) {
  const embeds = await readEmbeds(db, table, url);
  const where = filters(url, 't', param, embeds);
  const countValues = values.slice();
  const cols = await selectList(db, table, url.searchParams.get('select'), 't', 0, { embeds, url, param });
  const limit = url.searchParams.get('limit'), offset = url.searchParams.get('offset');
  const page = `${limit && /^\d+$/.test(limit) ? ` limit ${limit}` : ''}${offset && /^\d+$/.test(offset) ? ` offset ${offset}` : ''}`;
  const rows = (await db.query(`select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) v from (select ${cols} from ${source} t${where}${orderBy(url, 't')}${page}) r`, values)).rows[0].v;
  const headers = {};
  if (/count=exact/.test(prefer)) {
    const total = (await db.query(`select count(*)::int n from ${source} t${where}`, countValues)).rows[0].n;
    const start = Number(offset || 0);
    headers['content-range'] = `${rows.length ? `${start}-${start + rows.length - 1}` : '*'}/${total}`;
  }
  return { rows, headers };
}

function status(e) {
  if (e.code === '42501') return 403;
  if (e.code === '23505') return 409;
  if (e.code === '42P01' || e.code === '42883') return 404;
  return 400;
}

/**
 * startBridge(db, { users }) → { url, close }. `users` maps bearer token → user object.
 * Requests are serialized because PGlite is a single connection.
 */
async function startBridge(db, { users, log = () => {} }) {
  // Array columns (text[]) take native arrays like real PostgREST; json/jsonb take JSON text.
  const types = new Map();
  const colType = async (table, col) => {
    if (!types.has(table)) types.set(table, new Map((await db.query("select column_name, data_type from information_schema.columns where table_schema='public' and table_name=$1", [table])).rows.map(r => [r.column_name, r.data_type])));
    return types.get(table).get(col);
  };
  const value = async (table, col, v) => {
    // bytea arrives as PostgREST hex text ("\\x…"); PGlite wants bytes.
    if (typeof v === 'string' && v.startsWith('\\x') && (await colType(table, col)) === 'bytea') return Buffer.from(v.slice(2), 'hex');
    return v !== null && typeof v === 'object' && !(Array.isArray(v) && (await colType(table, col)) === 'ARRAY') ? JSON.stringify(v) : v;
  };
  let queue = Promise.resolve();
  const server = createServer((req, res) => {
    queue = queue.then(async () => {
      const url = new URL(req.url, 'http://bridge');
      const send = (code, body, headers = {}) => { res.writeHead(code, { 'Content-Type': 'application/json', ...headers }); res.end(body === undefined ? '' : JSON.stringify(body, (_k, v) => v instanceof Uint8Array ? '\\x' + Buffer.from(v).toString('hex') : v)); };
      const bearer = (req.headers.authorization || '').replace('Bearer ', '');
      const user = users.get(bearer);
      if (url.pathname === '/auth/v1/user') return user ? send(200, user) : send(401, { message: 'invalid synthetic token' });
      if (!url.pathname.startsWith('/rest/v1/')) return send(404, { message: 'not found' });
      // No bearer token = the PostgREST anon role (RLS and grants decide, exactly as in Supabase).
      // Like PostgREST, expose the token's claims (sub + aal) so MFA-aware policies see the session's assurance level.
      let aal = null; try { aal = JSON.parse(Buffer.from(bearer.split('.')[1] || '', 'base64url').toString()).aal ?? null; } catch { aal = null; }
      const claims = user ? JSON.stringify({ sub: user.id, role: 'authenticated', ...(aal === 'aal1' || aal === 'aal2' ? { aal } : {}) }) : '';
      const asRole = user ? `set request.jwt.claim.sub='${user.id}'; set request.jwt.claims='${claims}'; set role authenticated;` : `set request.jwt.claim.sub=''; set request.jwt.claims=''; set role anon;`;
      let raw = ''; for await (const chunk of req) raw += chunk;
      const body = raw ? JSON.parse(raw) : null;
      const values = []; const param = v => { values.push(v); return `$${values.length}`; };
      const prefer = String(req.headers.prefer || '');
      const wantsObject = String(req.headers.accept || '').includes('vnd.pgrst.object');
      await db.exec(`reset role; ${asRole}`);
      try {
        const path = url.pathname.slice('/rest/v1/'.length);
        if (path.startsWith('rpc/')) {
          const fn = path.slice(4);
          if (!IDENT.test(fn)) throw Object.assign(new Error('bad function'), { code: 'PGRST202' });
          await db.exec('reset role;');
          const meta = (await db.query(`select p.proretset, p.pronargs, p.proargnames, array(select format_type(t, null) from unnest(p.proargtypes::oid[]) t) types,
            (select c.relname from pg_class c where c.reltype=p.prorettype and c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v')) return_relation
            from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1`, [fn])).rows[0];
          await db.exec(asRole);
          if (!meta) return send(404, { code: 'PGRST202', message: `Could not find the function public.${fn}` });
          const args = (meta.proargnames || []).slice(0, meta.pronargs).map((name, i) => `${q(name)} => ${param(body?.[name] === undefined ? null : typeof body[name] === 'object' && body[name] !== null ? JSON.stringify(body[name]) : body[name])}::${meta.types[i]}`);
          const call = `public.${q(fn)}(${args.join(', ')})`;
          if (meta.proretset && meta.return_relation && url.searchParams.has('select')) {
            const { rows, headers } = await readPage(db, url, meta.return_relation, call, values, param, prefer);
            log('rpc', fn);
            return send(200, rows, headers);
          }
          const sql = meta.proretset ? `select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) v from ${call} t` : `select to_jsonb(${call}) v`;
          const v = (await db.query(sql, values)).rows[0].v;
          log('rpc', fn);
          return send(200, v);
        }
        const table = path;
        q(table);
        if (req.method === 'GET' || req.method === 'HEAD') {
          const { rows, headers } = await readPage(db, url, table, `public.${q(table)}`, values, param, prefer);
          if (wantsObject) return rows.length === 1 ? send(200, rows[0], headers) : send(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${rows.length} rows` });
          return send(200, rows, headers);
        }
        if (req.method === 'POST') {
          const list = Array.isArray(body) ? body : [body];
          const out = [];
          await db.exec('begin');
          try {
            for (const row of list) {
              const keys = Object.keys(row);
              // Upsert like PostgREST (Prefer: resolution=merge-duplicates + ?on_conflict=col): every payload column is SET.
              const conflict = url.searchParams.get('on_conflict');
              const upsert = conflict && /resolution=merge-duplicates/.test(prefer) ? ` on conflict (${q(conflict)}) do update set ${keys.map(k => `${q(k)} = excluded.${q(k)}`).join(', ')}` : '';
              const r = (await db.query(`insert into public.${q(table)} (${keys.map(q).join(', ')}) values (${keys.map((_, i) => `$${i + 1}`).join(', ')})${upsert} returning *`, await Promise.all(keys.map(k => value(table, k, row[k]))))).rows[0];
              out.push(r.id);
            }
            await db.exec('commit');
          } catch (e) { await db.exec('rollback'); throw e; }
          log('insert', table);
          if (!/return=representation/.test(prefer)) return send(201);
          const cols = await selectList(db, table, url.searchParams.get('select'), 't');
          const rows = (await db.query(`select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) v from (select ${cols} from public.${q(table)} t where t.id = any($1::uuid[])) r`, [out])).rows[0].v;
          return send(201, wantsObject ? rows[0] : rows);
        }
        if (req.method === 'PATCH') {
          const keys = Object.keys(body);
          const vals = await Promise.all(keys.map(k => value(table, k, body[k])));
          const sets = keys.map((k, i) => `${q(k)} = ${param(vals[i])}`);
          let where = filters(url, 't', param);
          // Emulate explicit PostgREST !inner membership using the actual FK and current RLS role.
          for (const item of splitTop(url.searchParams.get('select') || '*')) {
            const inner = item.match(/^([a-z_]+)!inner\(/);
            if (!inner) continue;
            const r = await relation(db, table, inner[1]);
            where += (where ? ' and ' : ' where ') + `exists(select 1 from public.${q(inner[1])} rel where rel.${q(r.remote)} = t.${q(r.local)})`;
          }
          await db.exec('begin');
          let ids;
          try {
            ids = (await db.query(`update public.${q(table)} t set ${sets.join(', ')}${where} returning t.id`, values)).rows.map(r => r.id);
            if (wantsObject && ids.length !== 1) {
              await db.exec('rollback');
              return send(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${ids.length} rows` });
            }
            await db.exec('commit');
          } catch (error) { await db.exec('rollback'); throw error; }
          log('update', table, ids.length);
          if (!/return=representation/.test(prefer)) return send(204);
          const cols = await selectList(db, table, url.searchParams.get('select'), 't');
          const rows = (await db.query(`select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) v from (select ${cols} from public.${q(table)} t where t.id = any($1::uuid[])) r`, [ids])).rows[0].v;
          if (wantsObject) return rows.length === 1 ? send(200, rows[0]) : send(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${rows.length} rows` });
          return send(200, rows);
        }
        return send(405, { message: 'method not supported by test bridge' });
      } catch (e) {
        log('error', e.code, e.message);
        return send(status(e), { code: e.code ?? 'XX000', message: e.message, details: e.detail ?? null, hint: e.hint ?? null });
      } finally {
        await db.exec('reset role;');
      }
    }).catch(e => { res.writeHead(500, { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify({ message: String(e.message) })); });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(r => server.close(r)) };
}

module.exports = { startBridge };
