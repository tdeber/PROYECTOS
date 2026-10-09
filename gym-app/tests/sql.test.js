// QA de la base de datos: corre los mismos scripts SQL que se pegan en Supabase sobre un Postgres real.
const { crearBase, ejecutar, json, crearUsuario } = require('./backend');
const T = require('./lib')('base-de-datos');
const DOC = (extra = {}) => ({ mt: 1, ex: [{ id: 'e1', n: 'Press banca', g: 'Pecho', eq: 'Barra' }], user: Object.assign({
  blocks: [{ id: 'b1', code: 'A', name: 'Pecho', c: '#5b9dff', items: [{ ex: 'e1', sets: 4, reps: '8-10', rest: 90 }] }],
  plan: { 0: ['b1'], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] },
  logs: [{ id: 'l1', date: '2026-10-05', b: [{ code: 'A', name: 'Pecho', c: '#5b9dff' }], min: 55, entries: [{ ex: 'e1', sets: [{ kg: 60, reps: 10 }, { kg: 62.5, reps: 8 }] }] }],
  bw: [{ date: '2026-10-01', kg: 78.2 }], fixed: []
}, extra) });

(async () => {
  const db = await crearBase();
  const q = async (uid, sql, p) => json(await ejecutar(db, uid, sql, p));
  const A = await crearUsuario(db, 'a@x.com', 'ana_gym', 'Ana');
  const B = await crearUsuario(db, 'b@x.com', 'beto_fit', 'Beto');
  const C = await crearUsuario(db, 'c@x.com', 'cami_fit', 'Camila');
  const D = await crearUsuario(db, 'd@x.com', null);              // cuenta sin perfil todavia
  const { rechaza, assert, test } = T;
  const rpc = (uid, fn, args = []) => q(uid, `select * from public.${fn}(${args.map((_, i) => '$' + (i + 1)).join(',')})`, args);

  T.seccion('Acceso anonimo');
  await test('DB-01', 'Sin sesion no se puede leer perfiles', () => rechaza(q(null, 'select * from public.perfiles'), 'permission denied'));
  await test('DB-02', 'Sin sesion no se puede leer datos', () => rechaza(q(null, 'select * from public.datos'), 'permission denied'));
  await test('DB-03', 'Sin sesion no se puede leer grupos, miembros ni invitaciones', async () => {
    for (const t of ['grupos', 'miembros', 'invitaciones']) await rechaza(q(null, `select * from public.${t}`), 'permission denied', t);
  });
  await test('DB-04', 'Sin sesion no se puede ejecutar ninguna funcion', async () => {
    for (const f of ['mis_grupos()', 'mis_invitaciones()', `ver_datos('${A}')`, `nick_disponible('x')`, `crear_grupo('x')`]) await rechaza(q(null, `select * from public.${f}`), 'permission denied', f);
  });

  T.seccion('Perfiles');
  await test('DB-10', 'Cada persona ve solo su propio perfil', async () => {
    const r = await q(A, 'select nick from public.perfiles'); assert(r.length === 1 && r[0].nick === 'ana_gym', JSON.stringify(r));
  });
  await test('DB-11', 'No se puede crear un perfil a nombre de otra persona', () =>
    rechaza(q(D, "insert into public.perfiles (user_id,nick,nombre) values ($1,'intruso','X')", [A]), 'row-level security'));
  await test('DB-12', 'No se puede editar el perfil de otra persona (0 filas afectadas)', async () => {
    const r = await ejecutar(db, B, "update public.perfiles set nombre='hackeado' where user_id=$1", [A]);
    assert(r.affectedRows === 0, 'afecto ' + r.affectedRows);
    assert((await q(A, 'select nombre from public.perfiles'))[0].nombre === 'Ana');
  });
  await test('DB-13', 'El nick es unico sin importar mayusculas', () =>
    rechaza(q(D, "insert into public.perfiles (user_id,nick,nombre) values ($1,'BETO_FIT','Otra')", [D]), 'perfiles_nick_unico|duplicate|check'));
  await test('DB-14', 'El nick solo acepta minusculas, numeros y guion bajo (3 a 20)', async () => {
    for (const n of ['ab', 'tiene espacio', 'Mayus', 'con-guion', 'a'.repeat(21), 'ñandu'])
      await rechaza(q(D, "insert into public.perfiles (user_id,nick,nombre) values ($1,$2,'X')", [D, n]), 'check', n);
  });
  await test('DB-15', 'El nombre no puede estar vacio ni pasar de 24 caracteres', async () => {
    await rechaza(q(D, "insert into public.perfiles (user_id,nick,nombre) values ($1,'nuevo_ok','')", [D]), 'check');
    await rechaza(q(D, "insert into public.perfiles (user_id,nick,nombre) values ($1,'nuevo_ok',$2)", [D, 'x'.repeat(25)]), 'check');
  });
  await test('DB-16', 'La foto de perfil tiene tope de tamano', () =>
    rechaza(q(D, "insert into public.perfiles (user_id,nick,nombre,avatar) values ($1,'nuevo_ok','N',$2)", [D, 'a'.repeat(60001)]), 'check'));
  await test('DB-17', 'La privacidad debe ser un objeto chico', async () => {
    await rechaza(q(D, "insert into public.perfiles (user_id,nick,nombre,privacidad) values ($1,'nuevo_ok','N','[1,2]')", [D]), 'check');
    await rechaza(q(D, "insert into public.perfiles (user_id,nick,nombre,privacidad) values ($1,'nuevo_ok','N',$2)", [D, JSON.stringify({ x: 'y'.repeat(600) })]), 'check');
  });
  await test('DB-18', 'nick_disponible distingue libres, tomados y el propio', async () => {
    assert((await rpc(D, 'nick_disponible', ['libre_ya']))[0].nick_disponible === true);
    assert((await rpc(D, 'nick_disponible', ['Beto_Fit']))[0].nick_disponible === false);
    assert((await rpc(A, 'nick_disponible', ['ana_gym']))[0].nick_disponible === true, 'el propio nick cuenta como libre para uno mismo');
  });
  await test('DB-19', 'Al cambiar de nick el anterior queda libre', async () => {
    await q(C, "update public.perfiles set nick='camila99' where user_id=$1", [C]);
    assert((await rpc(D, 'nick_disponible', ['cami_fit']))[0].nick_disponible === true);
    await q(C, "update public.perfiles set nick='cami_fit' where user_id=$1", [C]);
  });
  await test('DB-20', 'No se puede cambiar a un nick tomado', () =>
    rechaza(q(C, "update public.perfiles set nick='beto_fit' where user_id=$1", [C]), 'duplicate|unique'));

  T.seccion('Datos propios');
  await test('DB-30', 'Cada persona guarda y lee sus datos', async () => {
    await q(A, 'insert into public.datos (user_id,data) values ($1,$2)', [A, JSON.stringify(DOC())]);
    await q(B, 'insert into public.datos (user_id,data) values ($1,$2)', [B, JSON.stringify(DOC({ logs: [], bw: [] }))]);
    assert((await q(A, 'select data from public.datos')).length === 1);
  });
  await test('DB-31', 'No se pueden leer los datos de otra persona', async () => {
    const r = await q(B, 'select user_id from public.datos where user_id=$1', [A]); assert(r.length === 0);
  });
  await test('DB-32', 'No se pueden escribir datos a nombre de otra persona', () =>
    rechaza(q(C, 'insert into public.datos (user_id,data) values ($1,$2)', [A, '{}']), 'row-level security'));
  await test('DB-33', 'No se pueden modificar los datos de otra persona', async () => {
    const r = await ejecutar(db, C, "update public.datos set data='{}' where user_id=$1", [A]); assert(r.affectedRows === 0);
  });
  await test('DB-34', 'Se puede actualizar el propio dato (upsert)', async () => {
    await q(A, 'insert into public.datos (user_id,data) values ($1,$2) on conflict (user_id) do update set data=excluded.data', [A, JSON.stringify(DOC({ bw: [{ date: '2026-10-08', kg: 77.9 }] }))]);
    assert((await q(A, 'select data from public.datos'))[0].data.user.bw[0].kg === 77.9);
  });
  await test('DB-35', 'Los datos tienen tope de tamano', () =>
    rechaza(q(C, 'insert into public.datos (user_id,data) values ($1,$2)', [C, JSON.stringify({ x: 'a'.repeat(4000001) })]), 'check|datos_tamano'));

  T.seccion('Acceso directo a grupos');
  await test('DB-40', 'Con sesion tampoco se pueden leer ni escribir las tablas de grupos directo', async () => {
    for (const t of ['grupos', 'miembros', 'invitaciones']) await rechaza(q(A, `select * from public.${t}`), 'permission denied', t);
    await rechaza(q(A, "insert into public.grupos (nombre,creador) values ('x',$1)", [A]), 'permission denied');
    await rechaza(q(A, 'insert into public.miembros (grupo_id,user_id) values (gen_random_uuid(),$1)', [A]), 'permission denied');
  });

  T.seccion('Grupos');
  let G;
  await test('DB-50', 'Crear un grupo: quien lo crea queda como miembro y creador', async () => {
    G = (await rpc(A, 'crear_grupo', ['Pareja']))[0].crear_grupo;
    const g = await rpc(A, 'mis_grupos'); assert(g.length === 1 && g[0].nombre === 'Pareja' && g[0].soy_creador === true && g[0].miembros === 1, JSON.stringify(g));
  });
  await test('DB-51', 'Hace falta tener perfil para crear un grupo', () => rechaza(rpc(D, 'crear_grupo', ['X']), 'sin_perfil'));
  await test('DB-52', 'El nombre del grupo no puede estar vacio ni pasar de 30', async () => {
    await rechaza(rpc(A, 'crear_grupo', ['   ']), 'nombre_invalido');
    await rechaza(rpc(A, 'crear_grupo', ['x'.repeat(31)]), 'nombre_invalido');
  });
  await test('DB-53', 'Maximo 10 grupos creados por persona', async () => {
    try {
      for (let i = 0; i < 10; i++) await rpc(C, 'crear_grupo', ['g' + i]);
      await rechaza(rpc(C, 'crear_grupo', ['uno mas']), 'demasiados_grupos');
    } finally { for (const g of (await rpc(C, 'mis_grupos'))) await rpc(C, 'eliminar_grupo', [g.id]); }
  });
  await test('DB-54', 'Quien no esta en un grupo no lo ve', async () => { assert((await rpc(B, 'mis_grupos')).length === 0); });
  await test('DB-55', 'Solo el creador puede renombrar el grupo', async () => {
    await rechaza(rpc(B, 'renombrar_grupo', [G, 'Hackeado']), 'no_creador');
    await rpc(A, 'renombrar_grupo', [G, 'Nosotros']); assert((await rpc(A, 'mis_grupos'))[0].nombre === 'Nosotros');
    await rpc(A, 'renombrar_grupo', [G, 'Pareja']);
  });

  T.seccion('Invitaciones');
  await test('DB-60', 'Solo el creador puede invitar', async () => {
    await rechaza(rpc(B, 'invitar', [G, 'cami_fit']), 'no_creador');
    await rechaza(rpc(C, 'invitar', [G, 'beto_fit']), 'no_creador');
  });
  await test('DB-61', 'Invitar a un nick que no existe', () => rechaza(rpc(A, 'invitar', [G, 'fantasma']), 'nick_no_existe'));
  await test('DB-62', 'No se puede invitar a uno mismo', () => rechaza(rpc(A, 'invitar', [G, 'ana_gym']), 'ya_miembro'));
  await test('DB-63', 'Invitar por nick funciona aunque cambien las mayusculas', async () => {
    await rpc(A, 'invitar', [G, '  Beto_FIT ']);
    const e = await rpc(A, 'invitaciones_enviadas', [G]); assert(e.length === 1 && e[0].nick === 'beto_fit', JSON.stringify(e));
  });
  await test('DB-64', 'No se puede invitar dos veces a la misma persona', () => rechaza(rpc(A, 'invitar', [G, 'beto_fit']), 'ya_invitado'));
  await test('DB-65', 'La invitacion la ve solo quien la recibe', async () => {
    const r = await rpc(B, 'mis_invitaciones'); assert(r.length === 1 && r[0].grupo === 'Pareja' && r[0].de_nick === 'ana_gym', JSON.stringify(r));
    assert((await rpc(C, 'mis_invitaciones')).length === 0 && (await rpc(A, 'mis_invitaciones')).length === 0);
  });
  await test('DB-66', 'Solo el creador ve las invitaciones enviadas', async () => {
    await rechaza(rpc(B, 'invitaciones_enviadas', [G]), 'no_creador');
  });
  await test('DB-67', 'Otra persona no puede aceptar ni rechazar una invitacion ajena', async () => {
    const inv = (await rpc(B, 'mis_invitaciones'))[0].id;
    await rechaza(rpc(C, 'responder_invitacion', [inv, true]), 'invitacion_invalida');
    await rechaza(rpc(A, 'responder_invitacion', [inv, true]), 'invitacion_invalida');
  });
  await test('DB-68', 'Cancelar: solo la puede cancelar quien envio', async () => {
    const inv = (await rpc(B, 'mis_invitaciones'))[0].id;
    await rechaza(rpc(B, 'cancelar_invitacion', [inv]), 'invitacion_invalida');
    await rpc(A, 'cancelar_invitacion', [inv]);
    assert((await rpc(B, 'mis_invitaciones')).length === 0, 'sigue visible');
    await rechaza(rpc(B, 'responder_invitacion', [inv, true]), 'invitacion_invalida', 'no se puede aceptar una cancelada');
  });
  await test('DB-69', 'Rechazar una invitacion', async () => {
    await rpc(A, 'invitar', [G, 'beto_fit']);
    const inv = (await rpc(B, 'mis_invitaciones'))[0].id;
    await rpc(B, 'responder_invitacion', [inv, false]);
    assert((await rpc(B, 'mis_grupos')).length === 0, 'no debe entrar');
    await rechaza(rpc(B, 'responder_invitacion', [inv, true]), 'invitacion_invalida', 'no se puede reutilizar');
  });
  await test('DB-70', 'Despues de rechazar, se puede volver a invitar', async () => { await rpc(A, 'invitar', [G, 'beto_fit']); });
  await test('DB-71', 'Aceptar la invitacion: entra al grupo', async () => {
    const inv = (await rpc(B, 'mis_invitaciones'))[0].id;
    await rpc(B, 'responder_invitacion', [inv, true]);
    const g = await rpc(B, 'mis_grupos'); assert(g.length === 1 && g[0].soy_creador === false && g[0].miembros === 2, JSON.stringify(g));
    assert((await rpc(B, 'mis_invitaciones')).length === 0);
  });
  await test('DB-72', 'No se puede invitar a quien ya es miembro', () => rechaza(rpc(A, 'invitar', [G, 'beto_fit']), 'ya_miembro'));
  await test('DB-73', 'Limite de 20 personas por grupo (miembros + invitaciones pendientes)', async () => {
    const g2 = (await rpc(A, 'crear_grupo', ['Grande']))[0].crear_grupo;
    for (let i = 0; i < 19; i++) { const u = await crearUsuario(db, `m${i}@x.com`, `miembro_${i}`); await rpc(A, 'invitar', [g2, `miembro_${i}`]); }
    const z = await crearUsuario(db, 'z@x.com', 'ultimo_z');
    await rechaza(rpc(A, 'invitar', [g2, 'ultimo_z']), 'grupo_lleno');
    await rpc(A, 'eliminar_grupo', [g2]);
  });

  T.seccion('Miembros');
  await test('DB-80', 'Un miembro ve la lista de miembros con nick, nombre y creador primero', async () => {
    const m = await rpc(B, 'miembros_de', [G]); assert(m.length === 2 && m[0].nick === 'ana_gym' && m[0].es_creador === true && m[1].nick === 'beto_fit', JSON.stringify(m));
    assert(!('email' in m[0]), 'no debe exponer el email');
  });
  await test('DB-81', 'Quien no es miembro no ve la lista', () => rechaza(rpc(C, 'miembros_de', [G]), 'sin_acceso'));
  await test('DB-82', 'Solo el creador puede quitar miembros', async () => {
    await rechaza(rpc(B, 'quitar_miembro', [G, A]), 'no_creador');
    await rechaza(rpc(C, 'quitar_miembro', [G, B]), 'no_creador');
  });
  await test('DB-83', 'El creador no puede sacarse a si mismo ni salir', async () => {
    await rechaza(rpc(A, 'quitar_miembro', [G, A]), 'creador_no_sale');
    await rechaza(rpc(A, 'salir_grupo', [G]), 'creador_no_sale');
  });
  await test('DB-84', 'Un miembro puede salir del grupo', async () => {
    await rpc(A, 'invitar', [G, 'cami_fit']); await rpc(C, 'responder_invitacion', [(await rpc(C, 'mis_invitaciones'))[0].id, true]);
    await rpc(C, 'salir_grupo', [G]); assert((await rpc(C, 'mis_grupos')).length === 0);
    await rechaza(rpc(C, 'salir_grupo', [G]), 'sin_acceso');
  });
  await test('DB-85', 'El creador puede sacar a un miembro', async () => {
    await rpc(A, 'invitar', [G, 'cami_fit']); await rpc(C, 'responder_invitacion', [(await rpc(C, 'mis_invitaciones'))[0].id, true]);
    await rpc(A, 'quitar_miembro', [G, C]); assert((await rpc(C, 'mis_grupos')).length === 0);
    await rechaza(rpc(C, 'miembros_de', [G]), 'sin_acceso');
  });

  T.seccion('Privacidad de lo que ven los demas');
  const setPriv = (uid, p) => q(uid, 'update public.perfiles set privacidad=$2 where user_id=$1', [uid, JSON.stringify(p)]);
  const TODO0 = { entrenos: false, stats: false, plan: false, bloques: false, peso: false, fotos: false };
  const ver = async (quien, de) => (await rpc(quien, 'ver_datos', [de]))[0].ver_datos;
  await test('DB-90', 'Quien no comparte grupo no puede ver datos', () => rechaza(rpc(C, 'ver_datos', [A]), 'sin_acceso'));
  await test('DB-91', 'Sin sesion no se puede ver_datos', () => rechaza(q(null, `select public.ver_datos('${A}')`), 'permission denied'));
  await test('DB-92', 'Con todo apagado el miembro no recibe nada de la persona', async () => {
    await setPriv(A, TODO0); const r = await ver(B, A);
    assert(!('logs' in r) && !('plan' in r) && !('blocks' in r) && !('bw' in r) && !('ex' in r), JSON.stringify(r).slice(0, 300));
    assert(r.permisos.entrenos === false && r.permisos.stats === false);
  });
  await test('DB-93', 'Solo "entrenos": ve fechas, bloques y cantidad de series, sin kilos ni repeticiones', async () => {
    await setPriv(A, { ...TODO0, entrenos: true }); const r = await ver(B, A);
    assert(r.logs.length === 1 && r.logs[0].date === '2026-10-05' && r.logs[0].n === 2 && r.logs[0].min === 55, JSON.stringify(r.logs));
    assert(!('entries' in r.logs[0]), 'no debe traer los kilos');
    assert(!JSON.stringify(r).includes('62.5') && !('plan' in r) && !('bw' in r));
  });
  await test('DB-94', '"estadisticas" entrega los entrenos completos y los nombres de ejercicios', async () => {
    await setPriv(A, { ...TODO0, stats: true }); const r = await ver(B, A);
    assert(r.logs[0].entries[0].sets[1].kg === 62.5 && r.ex[0].n === 'Press banca', JSON.stringify(r).slice(0, 300));
    assert(!('plan' in r) && !('blocks' in r) && !('bw' in r));
  });
  await test('DB-95', '"plan" muestra los dias y los nombres de bloques, sin ejercicios', async () => {
    await setPriv(A, { ...TODO0, plan: true }); const r = await ver(B, A);
    assert(r.plan['0'][0] === 'b1' && r.blocks[0].name === 'Pecho', JSON.stringify(r).slice(0, 300));
    assert(!('items' in r.blocks[0]) && !JSON.stringify(r).includes('8-10') && !('logs' in r));
  });
  await test('DB-96', '"bloques" muestra series, repeticiones y descansos', async () => {
    await setPriv(A, { ...TODO0, bloques: true }); const r = await ver(B, A);
    assert(r.blocks[0].items[0].reps === '8-10' && r.blocks[0].items[0].rest === 90 && r.ex[0].n === 'Press banca', JSON.stringify(r).slice(0, 300));
    assert(!('plan' in r), 'el plan es otro permiso');
  });
  await test('DB-97', '"peso" muestra el peso corporal y nada mas', async () => {
    await setPriv(A, { ...TODO0, peso: true }); const r = await ver(B, A);
    assert(r.bw[0].kg === 77.9 || r.bw[0].kg === 78.2, JSON.stringify(r.bw)); assert(!('logs' in r) && !('plan' in r));
  });
  await test('DB-98', 'Cada persona se ve completa a si misma, sin importar su privacidad', async () => {
    await setPriv(A, TODO0); const r = await ver(A, A);
    assert(r.logs[0].entries && r.plan && r.blocks[0].items && r.bw, JSON.stringify(r).slice(0, 200));
  });
  await test('DB-99', 'Cambiar la privacidad se nota enseguida', async () => {
    await setPriv(A, { ...TODO0, stats: true }); assert('logs' in await ver(B, A));
    await setPriv(A, TODO0); assert(!('logs' in await ver(B, A)));
  });
  await test('DB-100', 'Una persona sin datos cargados devuelve "vacio"', async () => {
    await rpc(A, 'invitar', [G, 'cami_fit']); await rpc(C, 'responder_invitacion', [(await rpc(C, 'mis_invitaciones'))[0].id, true]);
    const r = await ver(B, C); assert(r.vacio === true);
  });
  await test('DB-101', 'Datos mal formados no rompen la vista de los demas: se devuelven listas vacias', async () => {
    await q(C, 'insert into public.datos (user_id,data) values ($1,$2)', [C, JSON.stringify({ ex: 'x', user: { logs: 'no soy una lista', blocks: 5, plan: [1], bw: {} } })]);
    await setPriv(C, { ...TODO0, stats: true, bloques: true, plan: true, peso: true });
    const r = await ver(B, C);
    assert(Array.isArray(r.logs) && r.logs.length === 0 && Array.isArray(r.blocks) && r.blocks.length === 0 && Array.isArray(r.bw) && Array.isArray(r.ex) && typeof r.plan === 'object' && !Array.isArray(r.plan), JSON.stringify(r));
  });
  await test('DB-101b', 'Entrenos con forma rota dentro de la lista tampoco rompen nada (devuelve error controlado)', async () => {
    await q(C, 'update public.datos set data=$2 where user_id=$1', [C, JSON.stringify({ user: { logs: [{ id: 1, entries: [{ sets: 'roto' }] }] } })]);
    await setPriv(C, { ...TODO0, entrenos: true });
    const r = await ver(B, C); assert(r.error === true || (Array.isArray(r.logs)), JSON.stringify(r));
  });
  await test('DB-102', 'Un miembro no puede leer la tabla de datos de otro, aunque comparta grupo', async () => {
    assert((await q(B, 'select * from public.datos where user_id=$1', [A])).length === 0);
  });
  await test('DB-103', 'Al salir del grupo se pierde el acceso a los datos', async () => {
    await rpc(C, 'salir_grupo', [G]); await rechaza(rpc(C, 'ver_datos', [A]), 'sin_acceso'); await rechaza(rpc(C, 'ver_datos', [B]), 'sin_acceso');
  });
  await test('DB-104', 'Dos grupos distintos: se ve a quien comparte AL MENOS un grupo', async () => {
    const g2 = (await rpc(B, 'crear_grupo', ['Gym del barrio']))[0].crear_grupo;
    await rpc(B, 'invitar', [g2, 'cami_fit']); await rpc(C, 'responder_invitacion', [(await rpc(C, 'mis_invitaciones'))[0].id, true]);
    await setPriv(B, { ...TODO0, entrenos: true });
    assert('logs' in await ver(C, B), 'C ve a B por el grupo 2');
    await rechaza(rpc(C, 'ver_datos', [A]), 'sin_acceso', 'C sigue sin ver a A');
  });

  T.seccion('Borrado y limpieza');
  await test('DB-110', 'Eliminar un grupo: solo el creador, y se borran miembros e invitaciones', async () => {
    await rechaza(rpc(B, 'eliminar_grupo', [G]), 'no_creador');
    await rpc(A, 'invitar', [G, 'cami_fit']);
    await rpc(A, 'eliminar_grupo', [G]);
    const n = (await db.query('select (select count(*) from public.miembros where grupo_id=$1) m, (select count(*) from public.invitaciones where grupo_id=$1) i', [G])).rows[0];
    assert(Number(n.m) === 0 && Number(n.i) === 0, JSON.stringify(n));
  });
  await test('DB-111', 'Borrar una cuenta borra su perfil, datos, membresias e invitaciones', async () => {
    await db.query('delete from auth.users where id=$1', [B]);
    const n = (await db.query('select (select count(*) from public.perfiles where user_id=$1) p, (select count(*) from public.datos where user_id=$1) d, (select count(*) from public.miembros where user_id=$1) m', [B])).rows[0];
    assert(Number(n.p) + Number(n.d) + Number(n.m) === 0, JSON.stringify(n));
  });
  await test('DB-112', 'Los scripts se pueden correr de nuevo sin perder datos', async () => {
    const fs = require('fs'), path = require('path');
    const antes = (await db.query('select count(*) c from public.datos')).rows[0].c;
    await db.exec(fs.readFileSync(path.join(__dirname, '..', 'supabase', '02-datos-y-grupos.sql'), 'utf8'));
    assert((await db.query('select count(*) c from public.datos')).rows[0].c === antes);
  });

  process.exit(T.cerrar() ? 1 : 0);
})().catch(e => { console.log('EXCEPCION', e.stack); process.exit(2); });
