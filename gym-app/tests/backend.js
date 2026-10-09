// Backend de pruebas: un Postgres real en memoria (PGlite) con los mismos scripts SQL que se
// pegan en Supabase, y un cliente falso de supabase-js que habla con ese Postgres.
const { PGlite } = require('@electric-sql/pglite');
const fs = require('fs'), path = require('path');
const SQL = f => fs.readFileSync(path.join(__dirname, '..', 'supabase', f), 'utf8');

// Lo minimo de Supabase que los scripts necesitan: roles, auth.users y auth.uid()
const BASE = `
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
`;

async function crearBase() {
  const db = new PGlite();
  await db.exec(BASE);
  await db.exec(SQL('01-perfiles.sql'));
  await db.exec(SQL('02-datos-y-grupos.sql'));
  return db;
}

// Ejecuta una consulta como un usuario con sesion (rol authenticated) o como anonimo (uid null)
async function ejecutar(db, uid, sql, params = []) {
  return db.transaction(async tx => {
    await tx.exec(uid ? 'set local role authenticated' : 'set local role anon');
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [uid || '']);
    return tx.query(sql, params);
  });
}
const json = r => JSON.parse(JSON.stringify(r.rows));

async function crearUsuario(db, email, nick, nombre, privacidad) {
  const u = (await db.query('insert into auth.users (email) values ($1) returning id', [email])).rows[0].id;
  if (nick) await db.query('insert into public.perfiles (user_id, nick, nombre, privacidad) values ($1,$2,$3,coalesce($4::jsonb, \'{"entrenos":true,"stats":true,"plan":true,"bloques":false,"peso":false,"fotos":false}\'::jsonb))', [u, nick, nombre || nick, privacidad ? JSON.stringify(privacidad) : null]);
  return u;
}

const ESCALARES = new Set(['crear_grupo', 'ver_datos', 'nick_disponible']);
const VACIAS = new Set(['renombrar_grupo', 'eliminar_grupo', 'invitar', 'responder_invitacion', 'cancelar_invitacion', 'quitar_miembro', 'salir_grupo']);
const ERR = e => ({ message: e.message, code: e.code });

// Cliente falso con la misma forma que usa la app (auth, from, rpc)
function clienteFalso(db, tabla) {
  tabla = tabla || { usuarios: [] };
  let sesion = null; const cbs = [];
  const uid = () => sesion && sesion.user.id;
  const run = async (sql, params) => { try { return { r: await ejecutar(db, uid(), sql, params) }; } catch (e) { return { error: ERR(e) }; } };
  const cliente = {
    auth: {
      getSession: async () => ({ data: { session: sesion } }),
      onAuthStateChange: f => { cbs.push(f); return { data: { subscription: {} } }; },
      signUp: async ({ email, password }) => {
        if (tabla.usuarios.find(u => u.email === email)) return { data: {}, error: { message: 'User already registered' } };
        const id = (await db.query('insert into auth.users (email) values ($1) returning id', [email])).rows[0].id;
        tabla.usuarios.push({ id, email, pw: password }); sesion = { user: { id, email } }; return { data: { session: sesion }, error: null };
      },
      signInWithPassword: async ({ email, password }) => {
        const u = tabla.usuarios.find(x => x.email === email && x.pw === password);
        if (!u) return { data: {}, error: { message: 'Invalid login credentials' } };
        sesion = { user: { id: u.id, email } }; return { data: { session: sesion }, error: null };
      },
      signOut: async () => { sesion = null; cbs.forEach(f => f('SIGNED_OUT', null)); return {}; },
      resetPasswordForEmail: async (email, o) => { tabla.resets = (tabla.resets || []).concat([[email, o && o.redirectTo]]); return { data: {}, error: null }; },
      updateUser: async ({ password }) => { if (!sesion) return { error: { message: 'no session' } }; tabla.usuarios.find(u => u.id === uid()).pw = password; return { data: {}, error: null }; }
    },
    rpc: async (fn, args = {}) => {
      const k = Object.keys(args);
      const sql = `select * from public.${fn}(${k.map((n, i) => `${n} => $${i + 1}`).join(', ')})`;
      const o = await run(sql, k.map(n => (args[n] !== null && typeof args[n] === 'object') ? JSON.stringify(args[n]) : args[n]));
      if (o.error) return { data: null, error: o.error };
      const rows = json(o.r);
      if (VACIAS.has(fn)) return { data: null, error: null };
      if (ESCALARES.has(fn)) return { data: rows[0][fn], error: null };
      return { data: rows, error: null };
    },
    from: t => {
      const cols = f => Object.keys(f);
      const val = v => (v !== null && typeof v === 'object') ? JSON.stringify(v) : v;
      return {
        select: c => ({ eq: (col, v) => ({ maybeSingle: async () => {
          const o = await run(`select ${c} from public.${t} where ${col} = $1`, [v]);
          return o.error ? { data: null, error: o.error } : { data: json(o.r)[0] || null, error: null };
        } }) }),
        insert: async row => {
          const k = cols(row);
          const o = await run(`insert into public.${t} (${k.join(',')}) values (${k.map((n, i) => `$${i + 1}`).join(',')})`, k.map(n => val(row[n])));
          return o.error ? { error: o.error } : { error: null };
        },
        upsert: async (row, opt) => {
          const k = cols(row), conf = (opt && opt.onConflict) || 'user_id';
          const o = await run(`insert into public.${t} (${k.join(',')}) values (${k.map((n, i) => `$${i + 1}`).join(',')}) on conflict (${conf}) do update set ${k.filter(n => n !== conf).map(n => `${n} = excluded.${n}`).join(', ')}`, k.map(n => val(row[n])));
          return o.error ? { error: o.error } : { error: null };
        },
        update: f => ({ eq: async (col, v) => {
          const k = cols(f);
          const o = await run(`update public.${t} set ${k.map((n, i) => `${n} = $${i + 1}`).join(', ')} where ${col} = $${k.length + 1}`, k.map(n => val(f[n])).concat([v]));
          return o.error ? { error: o.error } : { error: null };
        } })
      };
    }
  };
  cliente._emit = (ev, ses) => cbs.forEach(f => f(ev, ses));
  cliente._setSesion = s => { sesion = s; };
  return cliente;
}

module.exports = { crearBase, ejecutar, json, crearUsuario, clienteFalso };
