// QA de la app completa: la pagina real corre en jsdom, cada "celular" es una ventana distinta,
// y todos hablan con el mismo Postgres real (los scripts SQL de Supabase) a traves de un cliente falso.
const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path');
const { crearBase, ejecutar, json, clienteFalso } = require('./backend');
const T = require('./lib')('app');
const { assert, test, rechaza } = T;
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/<link[^>]*>/g, '').replace(/<script src[^>]*><\/script>/g, '');
const KEY = 'gymapp_proto_v1';
const dormir = ms => new Promise(r => setTimeout(r, ms));
async function hasta(fn, ms = 4000, msg = 'condicion') { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch (e) {} await dormir(25); } throw new Error('tiempo agotado esperando: ' + msg); }

let db, tabla;
function celular(opts = {}) {
  const w = new JSDOM(SRC, { runScripts: 'dangerously', url: 'https://tdeber.github.io/PROYECTOS/gym-app/', pretendToBeVisual: true,
    beforeParse(w) {
      w.__errs = []; w.addEventListener('error', e => w.__errs.push(e.message)); w.navigator.vibrate = () => {}; w.fetch = () => Promise.reject(new Error('sin red'));
      if (opts.ls) w.localStorage.setItem(KEY, opts.ls);
      if (opts.nube !== false) { const cli = clienteFalso(db, tabla); w.__cli = cli; w.GYM_CFG = { url: 'http://x', key: 'k' }; w.supabase = { createClient: () => cli }; }
    } }).window;
  const d = w.document;
  w.$ = s => d.querySelector(s); w.$$ = s => [...d.querySelectorAll(s)];
  w.cl = s => { const e = w.$(s); if (!e) throw new Error('falta ' + s); e.click(); };
  w.st = () => JSON.parse(w.localStorage.getItem(KEY));
  w.typ = (sel, v) => { const el = typeof sel === 'string' ? w.$(sel) : sel; if (!el) throw new Error('falta ' + sel); el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
  w.txt = s => (w.$(s) || {}).textContent || '';
  w.toastTxt = () => w.txt('#toast');
  w.setup = (nombre = 'Ana') => { w.$('#su1').value = nombre; w.cl('[data-a=setup]'); };
  w.fullTxt = () => w.txt('#fl');
  w.cerrar = () => w.close();
  return w;
}
// Registro por la interfaz: crea la cuenta, elige nick y nombre
async function registrar(w, email, pw, nick, nombre) {
  w.cl('[data-a=user]'); w.typ('#em', email); w.$('#pw').value = pw; w.cl('[data-a=signup]');
  await hasta(() => w.$('#nick'), 3000, 'pantalla de alta');
  w.typ('#nick', nick); await hasta(() => w.txt('#nickst') === 'Disponible', 3000, 'nick disponible');
  w.$('#pnom').value = nombre; w.cl('[data-a=alta]');
  await hasta(() => !w.$('#fl .fh') || !w.$('#nick'), 3000, 'perfil creado'); await dormir(80);
}
const filaPerfil = async nick => (await db.query('select * from public.perfiles where nick=$1', [nick])).rows[0];
const datosDe = async uid => ((await db.query('select data from public.datos where user_id=$1', [uid])).rows[0] || {}).data;
const bloque = (id, code, name, ex) => ({ id, code, name, c: '#5b9dff', items: ex.map(n => ({ ex: n, sets: 3, reps: '10-12', rest: 60 })) });
const logDe = (id, date, bn, kg) => ({ id, date, b: [{ code: 'A', name: bn, c: '#5b9dff' }], min: 50, entries: [{ ex: 'e0', sets: [{ kg, reps: 10 }, { kg, reps: 8 }] }] });

(async () => {
  db = await crearBase(); tabla = { usuarios: [] };

  // ================= 1. REGISTRO Y PERFIL =================
  T.seccion('Registro y perfil');
  const ana = celular();
  await dormir(200);
  await test('AP-01', 'La app arranca pidiendo el nombre (una sola persona)', async () => {
    assert(ana.fullTxt().includes('Bienvenidos') && ana.$('#su1') && !ana.$('#su2'), ana.fullTxt().slice(0, 100));
    ana.setup('Ana'); assert(ana.st().setup === true && ana.st().u.t.name === 'Ana' && !ana.st().u.s);
  });
  // datos locales previos a la cuenta (lo que ya cargaron en el celular antes de que existiera la nube)
  ana.eval(`(()=>{const u=U();u.blocks.push(${JSON.stringify(bloque('tb1', 'A', 'Pecho', ['e0', 'e1']))});u.plan[0]=['tb1'];u.logs.push(${JSON.stringify(logDe('tl1', '2026-10-05', 'Pecho', 60))});u.bw.push({date:'2026-10-01',kg:78.2});save()})()`);
  await test('AP-02', 'Formulario de cuenta en el perfil; clave corta y cuenta inexistente avisan', async () => {
    ana.cl('[data-a=user]'); assert(ana.$('#em') && ana.$('#pw'));
    ana.typ('#em', 'ana@x.com'); ana.$('#pw').value = '123'; ana.cl('[data-a=signup]'); assert(ana.fullTxt().includes('al menos 8'));
    assert(ana.$('#em').value === 'ana@x.com', 'conserva el email');
    ana.$('#pw').value = 'claveSegura1'; ana.cl('[data-a=login]'); await hasta(() => ana.fullTxt().includes('incorrectos'), 2000, 'login incorrecto');
    ana.cl('[data-a=pclose]');
  });
  await test('AP-03', 'Registrarse lleva a elegir nick y nombre; valida el nick en vivo contra la base', async () => {
    ana.cl('[data-a=user]'); ana.typ('#em', 'ana@x.com'); ana.$('#pw').value = 'claveSegura1'; ana.cl('[data-a=signup]');
    await hasta(() => ana.$('#nick'), 3000, 'alta');
    ana.typ('#nick', 'AB'); assert(ana.txt('#nickst').includes('minúsculas'));
    ana.typ('#nick', 'Ana Gym'); assert(ana.txt('#nickst').includes('minúsculas'));
    ana.typ('#nick', 'ana_gym'); await hasta(() => ana.txt('#nickst') === 'Disponible', 3000, 'disponible');
    ana.$('#pnom').value = ''; ana.cl('[data-a=alta]'); assert(ana.toastTxt().includes('nombre'));
    ana.$('#pnom').value = 'Ana'; ana.cl('[data-a=alta]'); await hasta(() => filaPerfil('ana_gym'), 3000, 'fila perfil');
    const f = await filaPerfil('ana_gym'); assert(f.nombre === 'Ana' && f.privacidad.entrenos === true && f.privacidad.bloques === false && f.privacidad.peso === false);
  });
  await test('AP-04', 'Nick tomado (sin importar mayusculas) se avisa y no crea el perfil', async () => {
    const otro = celular(); await dormir(150); otro.setup('Otro'); otro.cl('[data-a=user]'); otro.typ('#em', 'otro@x.com'); otro.$('#pw').value = 'claveSegura1'; otro.cl('[data-a=signup]');
    await hasta(() => otro.$('#nick'), 3000, 'alta');
    otro.typ('#nick', 'Ana_GYM'); await hasta(() => otro.txt('#nickst').includes('tomado'), 3000, 'tomado');
    otro.$('#pnom').value = 'Otro'; otro.cl('[data-a=alta]'); await dormir(300);
    assert(otro.txt('#nickst').includes('tomado') && !(await filaPerfil('Ana_GYM')));
    otro.cl('[data-a=logout]'); await dormir(200); otro.cerrar();
  });
  await test('AP-05', 'El perfil muestra nick y nombre; se pueden cambiar; el nick viejo queda libre', async () => {
    await hasta(() => !ana.$('#fl .fh'), 3000, 'cerrar alta'); ana.cl('[data-a=user]');
    assert(ana.$('#nick').value === 'ana_gym' && ana.$('#pnom').value === 'Ana');
    ana.$('#pnom').value = 'Ana María'; ana.cl('[data-a=pnombre]'); await hasta(async () => (await filaPerfil('ana_gym')).nombre === 'Ana María', 3000, 'nombre');
    ana.typ('#nick', 'ana_g2'); await hasta(() => ana.txt('#nickst') === 'Disponible', 3000, 'libre'); ana.cl('[data-a=pnick]');
    await hasta(async () => !!(await filaPerfil('ana_g2')), 3000, 'nick cambiado'); assert(!(await filaPerfil('ana_gym')));
    ana.typ('#nick', 'ana_gym'); await hasta(() => ana.txt('#nickst') === 'Disponible', 3000, 'viejo libre'); ana.cl('[data-a=pnick]');
    await hasta(async () => !!(await filaPerfil('ana_gym')), 3000, 'volver');
  });
  await test('AP-06', 'Los 6 interruptores de privacidad se guardan en la nube y los atajos funcionan', async () => {
    ana.cl('[data-a=ppriv][data-k=bloques]'); await hasta(async () => (await filaPerfil('ana_gym')).privacidad.bloques === true, 3000, 'bloques');
    ana.cl('[data-a=ppreset][data-all="1"]'); await hasta(async () => Object.values((await filaPerfil('ana_gym')).privacidad).every(v => v === true), 3000, 'todo');
    ana.cl('[data-a=ppreset][data-all="0"]'); await hasta(async () => { const p = (await filaPerfil('ana_gym')).privacidad; return p.entrenos && !p.stats && !p.plan && !p.bloques && !p.peso && !p.fotos; }, 3000, 'basico');
    assert(!ana.$('[data-a=ppriv][data-k=stats]').classList.contains('on'));
  });
  await test('AP-07', 'Recuperar clave: pide el mail, abre la pantalla de clave nueva y exige 8 caracteres', async () => {
    const w = celular(); await dormir(150); w.setup('X'); w.cl('[data-a=user]');
    w.cl('[data-a=forgot]'); assert(w.fullTxt().includes('Escribí tu email'));
    w.typ('#em', 'ana@x.com'); w.cl('[data-a=forgot]'); await hasta(() => tabla.resets && tabla.resets.length, 2000, 'mail');
    assert(tabla.resets[0][1].includes('/gym-app/')); await hasta(() => w.fullTxt().includes('Si ese email tiene cuenta'), 2000, 'mensaje neutro');
    const u = tabla.usuarios.find(x => x.email === 'ana@x.com'); w.__cli._setSesion({ user: { id: u.id, email: u.email } }); w.__cli._emit('PASSWORD_RECOVERY', { user: { id: u.id, email: u.email } });
    assert(w.fullTxt().includes('Clave nueva') && w.$('#np1'));
    w.$('#np1').value = 'corta'; w.$('#np2').value = 'corta'; w.cl('[data-a=newpw]'); await dormir(60); assert(w.fullTxt().includes('al menos 8'));
    w.$('#np1').value = 'unaClave123'; w.$('#np2').value = 'otraClave456'; w.cl('[data-a=newpw]'); await dormir(60); assert(w.fullTxt().includes('no coinciden'));
    w.$('#np1').value = 'unaClave123'; w.$('#np2').value = 'unaClave123'; w.cl('[data-a=newpw]'); await hasta(() => !w.$('#np1'), 3000, 'clave guardada');
    assert(u.pw === 'unaClave123'); u.pw = 'claveSegura1'; w.cerrar();
  });
  await test('AP-08', 'Al confirmar el email, la persona entra sola', async () => {
    const w = celular(); await dormir(150); w.setup('X'); const u = tabla.usuarios.find(x => x.email === 'ana@x.com');
    w.__cli._setSesion({ user: { id: u.id, email: u.email } }); w.__cli._emit('SIGNED_IN', { user: { id: u.id, email: u.email } });
    await hasta(() => w.$('#hd .av i'), 3000, 'sesion'); w.cerrar();
  });

  // ================= 2. SINCRONIZACION (ETAPA 2) =================
  T.seccion('Sincronizacion de datos');
  const idAna = () => tabla.usuarios.find(u => u.email === 'ana@x.com').id;
  await test('AP-20', 'Al crear la cuenta se suben los datos que ya habia en el celular', async () => {
    await hasta(async () => (await datosDe(idAna())), 5000, 'datos subidos');
    const d = await datosDe(idAna());
    assert(d.user.blocks.some(b => b.id === 'tb1') && d.user.logs.some(l => l.id === 'tl1') && d.user.bw[0].kg === 78.2 && d.user.plan['0'][0] === 'tb1', JSON.stringify(d.user).slice(0, 200));
    assert(!('photos' in d.user) && !JSON.stringify(d).includes('"draft"'), 'no se suben fotos ni borradores');
  });
  await test('AP-21', 'El indicador de estado queda en "sincronizado"', async () => {
    await hasta(() => ana.eval('sync.state') === 'ok', 3000, 'ok'); assert(ana.eval('S.linkedUid') === idAna());
  });
  await test('AP-22', 'Un celular nuevo, al entrar con la cuenta, recupera todo', async () => {
    const w = celular(); await dormir(150); w.setup('Ana');
    w.cl('[data-a=user]'); w.typ('#em', 'ana@x.com'); w.$('#pw').value = 'claveSegura1'; w.cl('[data-a=login]');
    await hasta(() => w.eval('U().blocks.length') === 1 && w.eval('U().logs.length') === 1, 5000, 'datos recuperados');
    assert(w.eval('U().bw[0].kg') === 78.2 && w.eval('U().plan[0][0]') === 'tb1');
    w.cerrar();
  });
  await test('AP-23', 'Un cambio se envia solo, sin tocar nada (espera de 1,5 s)', async () => {
    ana.eval(`(()=>{U().bw.push({date:'2026-10-08',kg:77.9});save()})()`);
    assert(ana.eval('sync.state') === 'pending');
    await hasta(async () => (await datosDe(idAna())).user.bw.length === 2, 5000, 'subido solo');
  });
  const ana2 = celular(); await dormir(150); ana2.setup('Ana');
  ana2.cl('[data-a=user]'); ana2.typ('#em', 'ana@x.com'); ana2.$('#pw').value = 'claveSegura1'; ana2.cl('[data-a=login]');
  await hasta(() => ana2.eval('U().logs.length') === 1, 5000, 'segundo celular');
  await test('AP-24', 'Un cambio hecho en otro celular llega al volver a abrir la app', async () => {
    await hasta(() => ana2.eval('sync.state') === 'ok', 5000, 'ok2');
    ana.eval(`(()=>{U().logs.push(${JSON.stringify(logDe('tl2', '2026-10-06', 'Pecho', 62.5))});save()})()`); await ana.eval('syncNow()');
    ana2.document.dispatchEvent(new ana2.Event('visibilitychange')); await hasta(() => ana2.eval('U().logs.length') === 2, 5000, 'llego');
  });
  await test('AP-25', 'Si cambian los dos lados, se unen sin perder nada', async () => {
    ana.eval(`(()=>{U().logs.push(${JSON.stringify(logDe('tl3', '2026-10-07', 'Pecho', 65))});save()})()`);
    ana2.eval(`(()=>{U().logs.push(${JSON.stringify(logDe('tl4', '2026-10-07', 'Espalda', 50))});U().blocks.push(${JSON.stringify(bloque('tb2', 'B', 'Espalda', ['e10']))});save()})()`);
    await ana.eval('syncNow()'); await ana2.eval('syncNow()'); await ana.eval('syncNow()');
    const ids = w => w.eval('U().logs.map(l=>l.id).sort().join(",")');
    assert(ids(ana) === 'tl1,tl2,tl3,tl4' && ids(ana2) === 'tl1,tl2,tl3,tl4', ids(ana) + ' | ' + ids(ana2));
    assert(ana.eval('U().blocks.map(b=>b.id).sort().join(",")') === 'tb1,tb2');
  });
  await test('AP-26', 'Sin internet la app sigue guardando y no dice "sincronizado"; al volver se envia', async () => {
    tabla.offline = true; db.offline = true;
    const orig = ana.__cli.from; ana.__cli.from = () => { throw new Error('Failed to fetch'); };
    ana.eval(`(()=>{U().bw.push({date:'2026-10-09',kg:77.5});save()})()`); await ana.eval('syncNow()');
    assert(ana.eval('sync.state') !== 'ok' && ana.st().u.t.bw.some(b => b.kg === 77.5), 'estado ' + ana.eval('sync.state'));
    ana.__cli.from = orig; ana.dispatchEvent(new ana.Event('online'));
    await hasta(async () => (await datosDe(idAna())).user.bw.some(b => b.kg === 77.5), 5000, 'subio al volver');
  });
  await test('AP-27', 'Un entrenamiento terminado se sube a la nube', async () => {
    ana.eval(`(()=>{startWork(['tb1'],'t')})()`); ana.cl('[data-a=setdone]'); ana.cl('[data-a=finish]');
    await hasta(async () => (await datosDe(idAna())).user.logs.length === 5, 6000, 'log en la nube'); ana.cl('[data-a=closesum]');
  });
  await test('AP-28', 'Ids de ejercicios en conflicto no se mezclan: se remapean por nombre', async () => {
    const w = celular(); await dormir(150); w.setup('Mezcla');
    w.eval(`(()=>{S.ex.push({id:'e999',n:'Ejercicio Local',g:'Pecho',eq:'Barra'})})()`);
    const map = w.eval(`mergeEx([{id:'e999',n:'Ejercicio Remoto',g:'Pecho',eq:'Barra'},{id:'e0',n:'Press banca plano',g:'Pecho',eq:'Barra'}])`);
    assert(map.e999 && map.e999 !== 'e999', JSON.stringify(map));
    assert(w.eval(`S.ex.find(e=>e.id==='e999').n`) === 'Ejercicio Local' && w.eval(`S.ex.some(e=>e.n==='Ejercicio Remoto')`));
    w.cerrar();
  });
  await test('AP-29', 'Cerrar sesion borra los datos del celular y otra cuenta no los ve', async () => {
    const w = celular(); await dormir(150); w.setup('Ana');
    w.cl('[data-a=user]'); w.typ('#em', 'ana@x.com'); w.$('#pw').value = 'claveSegura1'; w.cl('[data-a=login]');
    await hasta(() => w.eval('U().logs.length') >= 4 && w.eval('sync.state') === 'ok', 6000, 'datos');
    w.cl('[data-a=logout]'); await hasta(() => w.eval('U().logs.length') === 0, 4000, 'borrado local');
    assert(w.eval('U().blocks.length') === 0 && w.eval('S.linkedUid') === null && !w.$('#hd .av i'));
    assert(!w.localStorage.getItem(KEY).includes('tl1'), 'no quedan rastros en el almacenamiento');
    w.cerrar();
  });
  await test('AP-30', 'Si hay cambios sin enviar, cerrar sesion pide confirmar antes de borrar', async () => {
    const w = celular(); await dormir(150); w.setup('Ana');
    w.cl('[data-a=user]'); w.typ('#em', 'ana@x.com'); w.$('#pw').value = 'claveSegura1'; w.cl('[data-a=login]');
    await hasta(() => w.eval('U().logs.length') >= 4 && w.eval('sync.state') === 'ok', 6000, 'datos');
    w.__cli.from = () => { throw new Error('Failed to fetch'); };
    w.eval(`(()=>{U().bw.push({date:'2026-10-10',kg:70});save()})()`);
    w.cl('[data-a=logout]'); await hasta(() => w.toastTxt().includes('sin enviar'), 4000, 'aviso'); assert(w.eval('U().logs.length') >= 4, 'no debe borrar todavia');
    w.cl('[data-a=logout]'); await hasta(() => w.eval('U().logs.length') === 0, 4000, 'segundo toque cierra'); w.cerrar();
  });
  await test('AP-31', 'Otra persona que entra en un celular con datos de alguien mas empieza de cero', async () => {
    const w = celular(); await dormir(150); w.setup('Ana');
    w.eval(`(()=>{S.linkedUid='uuid-de-otra-cuenta';U().logs.push(${JSON.stringify(logDe('ajeno1', '2026-01-01', 'Ajeno', 99))});U().blocks.push(${JSON.stringify(bloque('ajb', 'Z', 'Ajeno', ['e0']))});save()})()`);
    w.cl('[data-a=user]'); w.typ('#em', 'ana@x.com'); w.$('#pw').value = 'claveSegura1'; w.cl('[data-a=login]');
    await hasta(() => w.eval('sync.state') === 'ok', 6000, 'sync');
    assert(!w.eval('U().logs.some(l=>l.id==="ajeno1")') && !w.eval('U().blocks.some(b=>b.id==="ajb")'), 'datos ajenos filtrados');
    const d = await datosDe(idAna()); assert(!JSON.stringify(d).includes('ajeno1'), 'no se subieron a la cuenta equivocada'); w.cerrar();
  });
  await test('AP-32', '"Limpiar todo" tambien borra la nube y los datos no reaparecen', async () => {
    const w = celular(); await dormir(150); w.setup('Borrar');
    w.cl('[data-a=user]'); w.typ('#em', 'ana@x.com'); w.$('#pw').value = 'claveSegura1'; w.cl('[data-a=login]');
    await hasta(() => w.eval('U().logs.length') >= 4 && w.eval('sync.state') === 'ok', 6000, 'datos');
    w.cl('[data-a=wipe]'); w.cl('[data-a=wipe]'); await hasta(async () => ((await datosDe(idAna())).user.logs || []).length === 0, 5000, 'nube vacia');
    await w.eval('syncNow()'); assert(w.eval('U().logs.length') === 0, 'no reaparecen'); w.cerrar();
    // restaurar los datos de Ana para las siguientes pruebas
    await db.query('delete from public.datos where user_id=$1', [idAna()]);
    ana.eval(`(()=>{S.syncedMt=0;S.linkedUid=null;S.mt=Date.now()})()`); await ana.eval('syncNow()');
    await hasta(async () => ((await datosDe(idAna())).user.logs || []).length >= 4, 5000, 'restaurado');
  });

  // ================= 3. GRUPOS (ETAPA 3) =================
  T.seccion('Grupos e invitaciones');
  const beto = celular(); await dormir(150); beto.setup('Beto');
  beto.eval(`(()=>{const u=U();u.blocks.push(${JSON.stringify(bloque('ab1', 'R1', 'Rutina 1', ['e61', 'x_custom']))});u.plan[0]=['ab1'];u.plan[2]=['ab1'];u.logs.push(${JSON.stringify(logDe('al1', '2026-10-05', 'Rutina 1', 40))});u.bw.push({date:'2026-10-02',kg:61.4});S.ex.push({id:'x_custom',n:'Ejercicio de Beto',g:'Glúteo',eq:'Otro'});save()})()`);
  await registrar(beto, 'beto@x.com', 'claveSegura2', 'beto_fit', 'Beto');
  const idBeto = () => tabla.usuarios.find(u => u.email === 'beto@x.com').id;
  await hasta(async () => !!(await datosDe(idBeto())), 5000, 'datos de Beto');
  await test('AP-40', 'Sin grupos, la pestaña Grupos explica que hacer y la app funciona normal', async () => {
    const w = celular(); await dormir(150); w.setup('Sin cuenta'); w.cl('[data-a=tab][data-t=par]');
    assert(w.txt('#mn').includes('Entrar o crear cuenta') || w.txt('#mn').includes('Ver perfil')); w.cerrar();
    beto.cl('[data-a=tab][data-t=par]'); await hasta(() => beto.txt('#mn').includes('Todavía no estás en un grupo'), 4000, 'vacio');
  });
  let GID;
  await test('AP-41', 'Crear un grupo con nombre: queda en la lista y se abre en Ajustes', async () => {
    ana.cl('[data-a=tab][data-t=par]'); await hasta(() => ana.$('#gnom'), 3000, 'form'); ana.typ('#gnom', 'Pareja'); ana.cl('[data-a=gnew]');
    await hasta(() => ana.txt('#mn').includes('Invitar por nick'), 4000, 'ajustes');
    GID = ana.eval('ui.gv.gid'); assert(GID && ana.txt('#mn').includes('Pareja'));
  });
  await test('AP-42', 'Invitar: nick inexistente, a uno mismo y en blanco muestran el aviso correcto', async () => {
    ana.typ('#gin', ''); ana.cl('[data-a=ginvitar]'); assert(ana.txt('#mn').includes('Escribí un nick'));
    ana.typ('#gin', 'fantasma'); ana.cl('[data-a=ginvitar]'); await hasta(() => ana.txt('#mn').includes('No encontramos ese nick'), 3000, 'no existe');
    ana.typ('#gin', 'ana_gym'); ana.cl('[data-a=ginvitar]'); await hasta(() => ana.txt('#mn').includes('ya está en el grupo'), 3000, 'uno mismo');
  });
  await test('AP-43', 'Invitar por nick (con @ y mayusculas) envia la invitacion', async () => {
    ana.typ('#gin', '@Beto_FIT'); ana.cl('[data-a=ginvitar]'); await hasta(() => ana.txt('#mn').includes('pendiente'), 4000, 'enviada');
    assert(ana.txt('#mn').includes('@beto_fit'));
    ana.cl('[data-a=gseg][data-s=aju]'); ana.typ('#gin', 'beto_fit'); ana.cl('[data-a=ginvitar]'); await hasta(() => ana.txt('#mn').includes('Ya le enviaste'), 3000, 'duplicada');
  });
  await test('AP-44', 'Quien recibe la invitacion ve el aviso en Hoy y el punto rojo en la pestaña Grupos', async () => {
    beto.cl('[data-a=tab][data-t=hoy]'); beto.document.dispatchEvent(new beto.Event('visibilitychange')); await hasta(() => beto.$('#nv .bdg'), 4000, 'punto rojo');
    await hasta(() => beto.txt('#mn').includes('Tenés 1 invitación'), 3000, 'aviso en Hoy');
  });
  await test('AP-45', 'La invitacion muestra grupo y quien invita; rechazar y volver a invitar funciona', async () => {
    beto.cl('[data-a=tab][data-t=par]'); await hasta(() => beto.txt('#mn').includes('Te invitó Ana María'), 4000, 'invitacion'); assert(beto.txt('#mn').includes('@ana_gym'));
    beto.cl('[data-a=ginv][data-ok="0"]'); await hasta(() => !beto.txt('#mn').includes('Te invitó'), 4000, 'rechazada'); assert(!beto.$('#nv .bdg'));
    ana.cl('[data-a=gseg][data-s=aju]'); ana.typ('#gin', 'beto_fit'); ana.cl('[data-a=ginvitar]'); await hasta(() => ana.txt('#mn').includes('pendiente'), 4000, 'reinvitada');
  });
  await test('AP-46', 'El creador puede cancelar una invitacion pendiente', async () => {
    ana.cl('[data-a=gcancel]'); await hasta(() => !ana.txt('#mn').includes('Invitaciones enviadas'), 4000, 'cancelada');
    beto.cl('[data-a=grefresh]'); await hasta(() => !beto.txt('#mn').includes('Te invitó'), 4000, 'ya no la ve');
    ana.cl('[data-a=gseg][data-s=aju]'); ana.typ('#gin', 'beto_fit'); ana.cl('[data-a=ginvitar]'); await hasta(() => ana.txt('#mn').includes('pendiente'), 4000, 'otra vez');
  });
  await test('AP-47', 'Aceptar la invitacion: Beto entra al grupo', async () => {
    beto.cl('[data-a=grefresh]'); await hasta(() => beto.$('[data-a=ginv][data-ok="1"]'), 4000, 'ver invitacion');
    beto.cl('[data-a=ginv][data-ok="1"]'); await hasta(() => beto.$('[data-a=gopen]'), 4000, 'en el grupo'); assert(beto.txt('#mn').includes('Pareja') && beto.txt('#mn').includes('2 personas'));
  });
  await test('AP-48', 'Quien no creo el grupo no ve el formulario de invitar y puede salir', async () => {
    beto.cl('[data-a=gopen]'); await hasta(() => beto.$('[data-a=gseg]') && beto.eval('!!G.mem[ui.gv.gid]'), 4000, 'abrir'); beto.cl('[data-a=gseg][data-s=aju]');
    assert(!beto.$('#gin') && beto.txt('#mn').includes('Solo quien creó el grupo') && beto.$('[data-a=gsalir]') && !beto.$('[data-a=gdel]'), 'gin=' + !!beto.$('#gin') + ' gsalir=' + !!beto.$('[data-a=gsalir]') + ' gdel=' + !!beto.$('[data-a=gdel]') + ' | ' + beto.txt('#mn').slice(0, 160));
  });
  await test('AP-49', 'Resumen del grupo: ambos aparecen con su estado de hoy', async () => {
    ana.cl('[data-a=gseg][data-s=res]'); await ana.eval('loadGroup(ui.gv.gid)'); await hasta(() => ana.txt('#mn').includes('Beto'), 4000, 'miembros');
    assert(ana.txt('#mn').includes('Ana María (vos)') && ana.txt('#mn').includes('Beto'));
  });

  T.seccion('Privacidad entre personas');
  const privB = async p => { beto.cl('[data-a=user]'); const k = Object.keys(p); for (const key of k) { const on = beto.$(`[data-a=ppriv][data-k=${key}]`).classList.contains('on'); if (on !== p[key]) { beto.cl(`[data-a=ppriv][data-k=${key}]`); await dormir(120); } } await hasta(async () => { const f = (await filaPerfil('beto_fit')).privacidad; return k.every(x => f[x] === p[x]); }, 4000, 'privacidad de Beto'); beto.cl('[data-a=pclose]'); };
  const verBeto = async () => { await ana.eval('loadGroup(ui.gv.gid)'); ana.cl(`[data-a=gseg][data-s=mie]`); const btn = ana.$$('[data-a=gperson]').find(b => b.textContent.includes('Beto')); btn.click(); };
  await test('AP-50', 'Con todo apagado se ve a Beto pero nada de sus datos (todo marcado como privado)', async () => {
    await privB({ entrenos: false, stats: false, plan: false, bloques: false, peso: false });
    ana.cl('[data-a=gseg][data-s=res]'); await verBeto();
    assert(ana.txt('#mn').includes('@beto_fit') && ana.txt('#mn').includes('no comparte sus estadísticas'), ana.txt('#mn').slice(0, 200));
    ana.cl('[data-a=gpseg][data-s=plan]'); assert(ana.txt('#mn').includes('no comparte su plan'));
    ana.cl('[data-a=gpseg][data-s=blq]'); assert(ana.txt('#mn').includes('no comparte sus bloques'));
    assert(!ana.txt('#mn').includes('Rutina 1') && !ana.txt('#mn').includes('61,4'), 'no debe filtrar nada');
    const g = ana.eval('JSON.stringify(G.data)'); assert(!g.includes('Rutina 1') && !g.includes('61.4') && !g.includes('"kg"'), 'ni siquiera llega al celular de Ana: ' + g.slice(0, 150));
  });
  await test('AP-51', 'Solo "entrenos": se ve que entreno pero no kilos ni plan', async () => {
    await privB({ entrenos: true });
    await ana.eval('loadGroup(ui.gv.gid)'); ana.cl('[data-a=gpback]'); ana.cl('[data-a=gseg][data-s=res]');
    assert(ana.eval('G.data[Object.keys(G.data)[0]].logs.length') === 1 && !ana.eval('JSON.stringify(G.data).includes("entries\\":[{")'), 'sin detalle de series');
    ana.cl('[data-a=gseg][data-s=res]'); assert(ana.txt('#mn').includes('Beto'));
    await verBeto(); ana.cl('[data-a=gpseg][data-s=est]'); assert(ana.txt('#mn').includes('no comparte sus estadísticas'));
  });
  await test('AP-52', 'Con "estadisticas": se ven graficos, racha y records de Beto', async () => {
    await privB({ stats: true }); await ana.eval('loadGroup(ui.gv.gid)'); ana.cl('[data-a=gpback]'); await verBeto();
    assert(ana.$('svg[aria-label]') || ana.txt('#mn').includes('Récords'), 'estadisticas visibles');
    assert(ana.txt('#mn').includes('racha') && ana.$('select[data-in=gpe]'));
  });
  await test('AP-53', 'Con "plan" se ven los dias y los nombres de bloques, pero no los ejercicios', async () => {
    await privB({ plan: true, bloques: false }); await ana.eval('loadGroup(ui.gv.gid)'); ana.cl('[data-a=gpback]'); await verBeto(); ana.cl('[data-a=gpseg][data-s=plan]');
    assert(ana.txt('#mn').includes('Rutina 1') && ana.txt('#mn').includes('Lunes') && !ana.txt('#mn').includes('Ejercicio de Beto') && ana.txt('#mn').includes('no comparte el detalle'));
  });
  await test('AP-54', 'Con "bloques en detalle" se ven los ejercicios y se puede copiar un bloque', async () => {
    await privB({ bloques: true }); await ana.eval('loadGroup(ui.gv.gid)'); ana.cl('[data-a=gpback]'); await verBeto(); ana.cl('[data-a=gpseg][data-s=blq]');
    assert(ana.txt('#mn').includes('Ejercicio de Beto') && ana.txt('#mn').includes('3 × 10-12'));
    const antes = ana.eval('U().blocks.length'); ana.cl('[data-a=gcopy]');
    assert(ana.eval('U().blocks.length') === antes + 1, 'bloque copiado');
    const nb = ana.eval('U().blocks[U().blocks.length-1]'); assert(nb.name === 'Rutina 1' && nb.id.startsWith('t') && nb.items.length === 2);
    assert(ana.eval(`S.ex.some(e=>e.n==='Ejercicio de Beto')`) && ana.eval('U().blocks[U().blocks.length-1].items.every(i=>S.ex.some(e=>e.id===i.ex))'), 'el ejercicio que Ana no tenia se creo');
  });
  await test('AP-55', 'Con "peso" se ve el peso corporal', async () => {
    await privB({ peso: true, stats: true }); await ana.eval('loadGroup(ui.gv.gid)'); ana.cl('[data-a=gpback]'); await verBeto(); ana.cl('[data-a=gpseg][data-s=est]');
    assert(ana.txt('#mn').includes('Peso corporal') && ana.txt('#mn').includes('61,4'));
  });
  await test('AP-56', 'Cada uno se ve completo a si mismo en el grupo, aun con todo privado', async () => {
    ana.cl('[data-a=user]'); ana.cl('[data-a=ppreset][data-all="0"]'); await dormir(300); ana.cl('[data-a=pclose]');
    ana.cl('[data-a=gpback]'); ana.cl('[data-a=gseg][data-s=mie]'); ana.$$('[data-a=gperson]').find(b => b.textContent.includes('(vos)')).click();
    assert(ana.txt('#mn').includes('racha') && !ana.txt('#mn').includes('no comparte'));
  });
  await test('AP-57', 'El calendario del grupo marca los dias y el detalle muestra solo lo permitido', async () => {
    ana.cl('[data-a=gpback]'); ana.cl('[data-a=gseg][data-s=res]'); await ana.eval('loadGroup(ui.gv.gid)');
    ana.eval(`ui.cal={y:2026,m:9}`); ana.cl('[data-a=gseg][data-s=res]'); const dia = ana.$('[data-a=day][data-d="2026-10-05"]'); assert(dia && dia.querySelectorAll('.dots i').length >= 1, 'puntos del 5');
    dia.click(); assert(ana.txt('.sheet').includes('Rutina 1') || ana.txt('.sheet').includes('Pecho'), ana.txt('.sheet'));
    ana.cl('[data-a=sclose]');
  });

  T.seccion('Administracion del grupo');
  await test('AP-60', 'El creador saca a un miembro (con confirmacion) y el miembro pierde el acceso', async () => {
    ana.cl('[data-a=gseg][data-s=mie]'); ana.cl('[data-a=gquitar]'); assert(ana.txt('#mn').includes('Confirmar'), 'primer toque pide confirmar');
    ana.cl('[data-a=gquitar]'); await hasta(() => !ana.txt('#mn').includes('@beto_fit'), 4000, 'sacada');
    beto.cl('[data-a=grefresh]'); await hasta(() => beto.txt('#mn').includes('Todavía no estás en un grupo') || !beto.$('[data-a=gopen]'), 4000, 'beto sin grupo');
    const r = await beto.__cli.rpc('ver_datos', { p_user: (await filaPerfil('ana_gym')).user_id }); assert(r.error && /sin_acceso/.test(r.error.message), 'sin acceso a los datos de Ana');
  });
  await test('AP-61', 'Renombrar el grupo', async () => {
    ana.cl('[data-a=gseg][data-s=aju]'); ana.typ('#grn', 'Nosotros'); ana.cl('[data-a=grename]'); await hasta(() => ana.txt('#mn').includes('Nosotros'), 4000, 'renombrado');
  });
  await test('AP-62', 'Un miembro puede salir del grupo (con confirmacion)', async () => {
    ana.typ('#gin', 'beto_fit'); ana.cl('[data-a=ginvitar]'); await hasta(() => ana.txt('#mn').includes('pendiente'), 4000, 'reinvitada');
    beto.cl('[data-a=grefresh]'); await hasta(() => beto.$('[data-a=ginv][data-ok="1"]'), 4000, 'inv'); beto.cl('[data-a=ginv][data-ok="1"]'); await hasta(() => beto.$('[data-a=gopen]'), 4000, 'dentro');
    beto.cl('[data-a=gopen]'); await hasta(() => beto.$('[data-a=gseg]'), 3000, 'abrir'); beto.cl('[data-a=gseg][data-s=aju]'); beto.cl('[data-a=gsalir]'); assert(beto.txt('#mn').includes('Tocá de nuevo'));
    beto.cl('[data-a=gsalir]'); await hasta(() => beto.txt('#mn').includes('Todavía no estás en un grupo'), 4000, 'salio');
  });
  await test('AP-63', 'El creador elimina el grupo (con confirmacion) y desaparece para todos', async () => {
    ana.cl('[data-a=gseg][data-s=aju]'); ana.cl('[data-a=gdel]'); assert(ana.txt('#mn').includes('Tocá de nuevo'));
    ana.cl('[data-a=gdel]'); await hasta(() => ana.txt('#mn').includes('Todavía no estás en un grupo'), 4000, 'eliminado');
    assert(Number((await db.query('select count(*) c from public.grupos')).rows[0].c) === 0);
  });

  T.seccion('Seguridad de la interfaz');
  await test('AP-70', 'Nombres, nicks y avatares maliciosos no ejecutan codigo ni rompen el estilo', async () => {
    const g = (await ejecutar(db, idAna(), "select * from public.crear_grupo('<img src=x onerror=alert(1)>')")).rows[0].crear_grupo;
    await db.query("update public.perfiles set nombre='<b onclick=x>Beto</b>', avatar='x\" onerror=\"alert(1)' where nick='beto_fit'");
    await db.query("update public.perfiles set privacidad='{\"entrenos\":true,\"stats\":true,\"plan\":true,\"bloques\":true,\"peso\":true,\"fotos\":false}' where nick='beto_fit'");
    const malo = { mt: 1, ex: [{ id: 'q', n: '<script>alert(1)</script>', g: 'Pecho', eq: 'Barra' }], user: { blocks: [{ id: 'm1', code: '<i>', name: '<svg onload=alert(1)>', c: 'red;background:url(//x.test/p.png)', items: [{ ex: 'q', sets: '<u>', reps: '"><img src=y>', rest: 1 }] }], plan: { 0: ['m1'] }, logs: [{ id: 'z', date: '2026-10-05', b: [{ name: '<s>x</s>' }], min: 1, entries: [{ ex: 'q', sets: [{ kg: 10, reps: 5 }] }] }], bw: [], fixed: [] } };
    await db.query('update public.datos set data=$2 where user_id=$1', [(await filaPerfil('beto_fit')).user_id, JSON.stringify(malo)]);
    await ejecutar(db, idAna(), "select public.invitar($1,'beto_fit')", [g]);
    const w = celular(); await dormir(150); w.setup('Beto');
    w.cl('[data-a=user]'); w.typ('#em', 'beto@x.com'); w.$('#pw').value = 'claveSegura2'; w.cl('[data-a=login]');
    await hasta(() => w.$('#hd .av'), 4000, 'login'); await dormir(300);
    w.cl('[data-a=tab][data-t=par]'); await hasta(() => w.$('[data-a=ginv][data-ok="1"]'), 4000, 'invitacion maliciosa');
    assert(!w.$('#mn img') && !w.$('#mn [onerror]') && w.txt('#mn').includes('<img src=x onerror=alert(1)>'), 'se muestra como texto');
    assert(!w.$('#hd img'), 'avatar invalido no se renderiza');
    w.cl('[data-a=ginv][data-ok="1"]'); await hasta(() => w.$('[data-a=gopen]'), 4000, 'dentro'); w.cerrar();
    ana.cl('[data-a=tab][data-t=par]'); await hasta(() => ana.$$('[data-a=gopen]').length, 4000, 'lista'); ana.cl('[data-a=gopen]'); await hasta(() => ana.$('[data-a=gseg]'), 4000, 'grupo');
    await ana.eval('loadGroup(ui.gv.gid)'); ana.cl('[data-a=gseg][data-s=mie]'); ana.$$('[data-a=gperson]').find(b => b.textContent.includes('Beto')).click();
    for (const s of ['est', 'plan', 'blq']) { ana.cl(`[data-a=gpseg][data-s=${s}]`); const mn = ana.$('#mn'); const els = [...mn.querySelectorAll('*')];
      assert(!els.some(el => [...el.attributes].some(a => /^on/i.test(a.name))), s + ': hay un atributo de evento inyectado');
      assert(!mn.querySelector('script, img, u, iframe, object, b[onclick]') && els.filter(el => el.tagName.toLowerCase() === 'svg').every(el => el.getAttribute('aria-label') || el.getAttribute('aria-hidden')), s + ': elementos inyectados');
      assert(!/background:url|--c:red/.test(mn.innerHTML), 'estilo inyectado en ' + s); }
    assert(ana.eval('colSafe("red;background:url(//x)")') === '#5b9dff' && ana.eval('colSafe("#aabbcc")') === '#aabbcc');
    ana.cl('[data-a=gpseg][data-s=blq]'); ana.cl('[data-a=gcopy]');
    const nb = ana.eval('U().blocks[U().blocks.length-1]'); assert(nb.c === '#5b9dff' && nb.items[0].sets <= 10 && nb.items[0].sets >= 1, 'bloque copiado queda saneado: ' + JSON.stringify(nb).slice(0, 160));
  });
  await test('AP-71', 'Los datos mal formados de otra persona no rompen la pantalla', async () => {
    await db.query('update public.datos set data=$2 where user_id=$1', [(await filaPerfil('beto_fit')).user_id, JSON.stringify({ ex: 'x', user: { logs: 'roto', blocks: 5, plan: [1], bw: {} } })]);
    await ana.eval('loadGroup(ui.gv.gid)'); ana.cl('[data-a=gpback]'); ana.cl('[data-a=gseg][data-s=res]'); assert(ana.txt('#mn').includes('Beto'));
    ana.cl('[data-a=gseg][data-s=mie]'); ana.$$('[data-a=gperson]').find(b => b.textContent.includes('Beto')).click(); for (const s of ['est', 'plan', 'blq']) ana.cl(`[data-a=gpseg][data-s=${s}]`);
  });

  T.seccion('Regresion: funciones de siempre');
  await test('AP-80', 'Sin nube configurada la app funciona igual (bloques, plan, entrenar, progreso)', async () => {
    const w = celular({ nube: false }); await dormir(200); w.setup('Solo');
    w.cl('[data-a=tab][data-t=blo]'); w.cl('[data-a=newb]'); w.typ('#ename', 'Pecho'); w.typ('#ecode', 'a'); w.cl('[data-a=epick]'); w.$$('#exl .ex')[0].click(); w.$$('#exl .ex')[1].click(); w.cl('[data-a=pdone]'); w.cl('[data-a=esave]');
    assert(w.st().u.t.blocks.length === 1);
    w.cl('[data-a=tab][data-t=sem]'); const dia = (new Date().getDay() + 6) % 7; w.cl(`[data-a=addday][data-d="${dia}"]`); w.cl('[data-a=adddayb]');
    w.cl('[data-a=tab][data-t=hoy]'); w.cl('[data-a=start]'); w.cl('[data-a=setdone]'); assert(w.$('#rest').hidden === false, 'descanso arranca'); w.cl('[data-a=finish]'); assert(w.st().u.t.logs.length === 1);
    w.cl('[data-a=closesum]'); for (const t of ['pro', 'par', 'sem', 'blo']) { w.cl(`[data-a=tab][data-t=${t}]`); assert(w.txt('#mn').length > 20); }
    assert(w.__errs.length === 0, String(w.__errs)); w.cerrar();
  });
  await test('AP-81', 'Datos viejos (v5, con perfil local de pareja) se migran sin perder los del usuario', async () => {
    const mk = n => { const plan = {}; for (let i = 0; i < 7; i++) plan[i] = []; return { name: n, blocks: [], plan, logs: [], bw: [], photos: [], fixed: [] }; };
    const viejo = { v: 5, setup: true, me: 's', ex: [{ id: 'e0', n: 'Press banca plano', g: 'Pecho', eq: 'Barra' }], u: { t: mk('Ana'), s: mk('Beto') }, draft: null };
    viejo.u.s.logs.push(logDe('v1', '2026-10-01', 'Viejo', 50)); viejo.u.s.blocks.push(bloque('vb', 'A', 'Viejo', ['e0']));
    const w = celular({ nube: false, ls: JSON.stringify(viejo) }); await dormir(200);
    const S = w.st(); assert(S.v === 6 && S.me === 't' && !S.u.s && S.u.t.logs.length === 1 && S.u.t.blocks.length === 1 && S.u.t.name === 'Beto', JSON.stringify(S.u).slice(0, 200)); w.cerrar();
  });
  await test('AP-82', 'La app instalada sin conexion ni nube arranca (service worker y archivos propios)', async () => {
    const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
    assert(/origin!==self\.location\.origin/.test(sw.replace(/\s/g, '')) || /new URL\(e\.request\.url\)\.origin/.test(sw), 'solo cachea archivos propios');
    assert(/vendor\/supabase\.js/.test(sw) && /config\.js/.test(sw), 'cachea la libreria y la configuracion');
  });
  await test('AP-83', 'Sin errores de JavaScript en ningun celular durante toda la prueba', async () => {
    for (const [n, w] of [['ana', ana], ['ana2', ana2], ['beto', beto]]) assert(w.__errs.length === 0, n + ': ' + w.__errs.join(' | '));
  });

  process.exit(T.cerrar() ? 1 : 0);
})().catch(e => { console.log('EXCEPCION', e.stack); process.exit(2); });
