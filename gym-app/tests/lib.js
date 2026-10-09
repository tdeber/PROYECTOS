// Mini runner: ejecuta pruebas, imprime fallas y guarda los resultados para el informe QA.
const fs = require('fs'), path = require('path');
const donde = e => ((e && e.stack || '').split('\n').find(l => /\.test\.js/.test(l)) || '').trim().replace(/^.*[\\/]/, '');
module.exports = function suite(nombre) {
  const res = [];
  let seccion = '';
  return {
    seccion(s) { seccion = s; },
    async test(id, desc, fn) {
      const t0 = Date.now();
      try { await fn(); res.push({ id, seccion, desc, ok: true, ms: Date.now() - t0 }); }
      catch (e) {
        const msg = String(e && e.message || e).slice(0, 300);
        res.push({ id, seccion, desc, ok: false, error: msg, ms: Date.now() - t0 });
        console.log('FALLA', id, desc, '->', msg.slice(0, 160), '|', donde(e));
      }
    },
    assert(c, m) { if (!c) throw new Error(m || 'afirmacion falsa'); },
    async rechaza(p, patron, m) {
      try { await p; } catch (e) { if (!patron || new RegExp(patron, 'i').test(String(e.message || e))) return; throw new Error((m || 'error distinto al esperado') + ': ' + e.message); }
      throw new Error(m || 'se esperaba un error y no hubo ninguno');
    },
    cerrar() {
      const ok = res.filter(r => r.ok).length;
      fs.mkdirSync(path.join(__dirname, 'resultados'), { recursive: true });
      fs.writeFileSync(path.join(__dirname, 'resultados', nombre + '.json'), JSON.stringify({ suite: nombre, fecha: new Date().toISOString(), total: res.length, ok, fallas: res.length - ok, pruebas: res }, null, 1));
      console.log(`\n[${nombre}] ${ok} de ${res.length} pruebas correctas${res.length - ok ? ' (' + (res.length - ok) + ' fallas)' : ''}`);
      return res.length - ok;
    }
  };
};
