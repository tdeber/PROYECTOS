// Genera ../QA.md a partir de los resultados guardados en tests/resultados/*.json
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, 'resultados');
const suites = ['base-de-datos', 'app'].map(n => { try { return JSON.parse(fs.readFileSync(path.join(dir, n + '.json'), 'utf8')); } catch (e) { return null; } }).filter(Boolean);
const titulo = { 'base-de-datos': 'Base de datos (Postgres real, scripts SQL de Supabase)', app: 'App completa (varios celulares simulados contra esa misma base)' };
const fecha = new Date().toLocaleString('es-AR', { dateStyle: 'long', timeStyle: 'short' });
const tot = suites.reduce((a, s) => a + s.total, 0), ok = suites.reduce((a, s) => a + s.ok, 0);
let md = `# Informe de pruebas (QA)

Generado el ${fecha}. **${ok} de ${tot} pruebas automáticas correctas.**

| Suite | Pruebas | Correctas | Fallas |
| --- | --: | --: | --: |
${suites.map(s => `| ${titulo[s.suite]} | ${s.total} | ${s.ok} | ${s.fallas} |`).join('\n')}

## Cómo se corre

\`\`\`
cd gym-app/tests
npm install
npm run todo      # corre las dos suites y regenera este informe
\`\`\`

Las pruebas no tocan tu proyecto de Supabase ni crean cuentas reales. La base es un Postgres de verdad que corre en memoria (PGlite) y ejecuta exactamente los mismos scripts de \`supabase/\`. La app corre en jsdom, con un "celular" por ventana, y habla con esa base a través de un cliente que imita a \`supabase-js\`.

`;
for (const s of suites) {
  md += `## ${titulo[s.suite]}\n\n`;
  let sec = null;
  for (const p of s.pruebas) {
    if (p.seccion !== sec) { sec = p.seccion; md += `\n### ${sec}\n\n| ID | Qué se verifica | Resultado |\n| --- | --- | :-: |\n`; }
    md += `| ${p.id} | ${p.desc.replace(/\|/g, '/')} | ${p.ok ? 'OK' : 'FALLA: ' + String(p.error || '').replace(/\|/g, '/').slice(0, 120)} |\n`;
  }
  md += '\n';
}
md += `## Pruebas de mutación

Para comprobar que las pruebas de seguridad detectan errores reales, se rompió a propósito cada protección y se verificó que alguna prueba fallara. Todas fueron detectadas.

| Se rompió | Cómo | Pruebas que lo detectaron |
| --- | --- | --- |
| Foto de perfil sin validar | Se mostraba cualquier texto como imagen | AP-70 |
| Nombres sin escapar | Se insertaba el nombre del miembro sin esc() | AP-70 |
| Color de bloque sin validar | Se aceptaba cualquier texto como color | AP-70 |
| Cerrar sesión sin borrar | No se limpiaban los datos del celular | AP-29, AP-30 |
| Privacidad ignorada en la base | \`ver_datos\` entregaba estadísticas siempre | DB-92, DB-93, DB-95, DB-97, DB-99 |
| Acceso sin pertenecer al grupo | \`ver_datos\` no pedía compartir grupo | DB-90, DB-103, DB-104 |
| Invitar sin ser creador | \`invitar\` no verificaba al creador | DB-60, DB-63, DB-65 y 7 más |

## Lo que estas pruebas NO cubren

Estas cosas hay que verificarlas a mano en celulares reales y en tu proyecto real de Supabase:

- [ ] Instalar la app en un iPhone (Safari, Compartir, Agregar a pantalla de inicio) y en un Android (Chrome, Instalar app).
- [ ] Abrir la app sin conexión una vez instalada (service worker).
- [ ] Subir una foto de perfil desde la galería o la cámara (recorte y tamaño).
- [ ] Que suene y vibre el aviso de descanso (en iPhone la vibración no existe).
- [ ] Crear la cuenta real de cada persona y comprobar que la tabla \`perfiles\` y \`datos\` reciben las filas (Supabase, Table Editor).
- [ ] Probar una invitación real entre dos celulares y el cambio de privacidad en vivo.
- [ ] Mails de recuperación de clave y confirmación: dependen de configurar el envío de correos en Supabase (ver README).
- [ ] La política de seguridad de contenido en un navegador real (se verificó en Chrome local, no en cada celular).
`;
fs.writeFileSync(path.join(__dirname, '..', 'QA.md'), md);
console.log(`QA.md generado: ${ok} de ${tot} correctas`);
