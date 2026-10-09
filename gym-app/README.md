# Gym de a dos

App web de entrenamiento para grupos chicos (hoy pensada para dos personas). Se instala en el celular como una app (PWA), funciona sin conexión y no tiene servidor: todo corre en el navegador.

> Estado: en uso. Cada persona tiene su cuenta y sus datos se guardan en su celular y en la nube. Se pueden armar grupos por invitación para ver los entrenos de otras personas, según lo que cada una decida compartir.

## Qué hace

- **Registro inicial:** la primera vez pide los nombres de los dos integrantes y arranca vacía. Solo trae el catálogo de ejercicios.
- **Bloques:** cada persona arma sus bloques de entrenamiento (ejercicios, series, repeticiones y descanso). Las repeticiones pueden ser números, rangos (`10-12`), segundos (`30 s`) o minutos (`20 min`) para el cardio.
- **Plan semanal:** se asigna cada bloque a un día de la semana. La pestaña Semana muestra el plan y permite moverlo.
- **Entrenamiento en curso:** pantalla de series con kilos y repeticiones, temporizador de descanso con aviso sonoro y vibración, y resumen al terminar.
- **Progreso:** gráfico por ejercicio (peso máximo o 1RM estimado), entrenos por semana, récords, peso corporal y fotos de progreso.
- **Pareja:** muestra qué le toca a la otra persona y qué hizo, con calendario del mes.
- **Ejercicios:** catálogo con buscador y filtros. Se pueden agregar ejercicios propios.
- **Ejercicios fijos:** ejercicios que se suman al final de todos los entrenamientos de una persona.
- **Limpiar todo:** en el menú de perfil (la inicial arriba a la derecha) borra todos los datos del dispositivo y vuelve al registro.

## Cómo se usa

1. Abrir la página desde el navegador del celular. En iPhone: Compartir → Agregar a pantalla de inicio. En Android: menú → Instalar app.
2. Escribir los dos nombres y tocar Empezar.
3. En Bloques, crear los bloques de cada persona y, en Semana, asignarlos a los días.
4. En Hoy, tocar Empezar entrenamiento.

Cuando se publica una versión nueva, hay que cerrar la app por completo y volver a abrirla para que se actualice.

## Dónde se guardan los datos

- **En el celular:** todo se guarda en el `localStorage` del navegador (clave `gymapp_proto_v1`), así la app funciona sin conexión.
- **En la nube (Supabase):** si la persona crea una cuenta, sus bloques, plan, entrenos y peso se envían solos cuando hay internet (tabla `datos`), junto con su perfil: nick, nombre, foto reducida y ajustes de privacidad (tabla `perfiles`). Las fotos de progreso todavía quedan solo en el celular.
- **Nunca en GitHub:** este repositorio es público y no contiene datos personales. Solo trae el catálogo genérico de ejercicios, el código y la dirección y clave pública del proyecto de Supabase.
- **Privacidad entre personas:** cada persona elige qué ven los demás (entrenos, estadísticas, plan, bloques en detalle, peso, fotos). Lo decide la base de datos, no la pantalla: un miembro de un grupo nunca recibe lo que no se habilitó.
- **Al cerrar sesión** se borran los datos de ese celular (quedan guardados en la cuenta), para que nadie más los vea en un celular compartido.
- La app no usa analíticas ni cookies. Las tipografías están en `fonts/` y la librería de Supabase en `vendor/`, así que no se piden a ninguna CDN. Una política de seguridad de contenido limita las conexiones al proyecto de Supabase.

## Cómo funcionan las cuentas y los grupos

- **Una cuenta por persona**, con email y clave de 8 caracteres o más, y un **nick único** (se puede cambiar mientras esté libre).
- **Grupos con nombre.** Solo quien crea el grupo invita, escribiendo el nick exacto de la otra persona, puede cambiarle el nombre, sacar miembros y eliminarlo. La invitación se puede aceptar, rechazar o cancelar. Una persona puede estar en varios grupos (hasta 20 personas por grupo, 10 grupos creados por persona).
- **Si no se invita a nadie**, la app se ve y funciona igual que sin cuenta.
- En la pestaña **Grupos** se ve el resumen (quién entrenó hoy, la semana, el calendario y los récords) y el perfil de cada miembro con sus estadísticas, plan y bloques, y se pueden copiar sus bloques.

## Estructura

| Archivo | Para qué sirve |
| --- | --- |
| `index.html` | Toda la app: estilos, lógica y pantallas en un solo archivo. |
| `sw.js` | Service worker. Guarda la app en caché para que funcione sin conexión. Al cambiar los archivos hay que subir la versión (`gym-vN`). |
| `manifest.json` | Datos de instalación de la PWA. |
| `icons/` | Íconos de la app. |
| `config.js` | Dirección del proyecto de Supabase y clave pública (publishable). Es seguro que esté en el repositorio: los datos los protegen las reglas de la base. Nunca poner acá una clave secreta ni `service_role`. |
| `vendor/supabase.js` | Librería `@supabase/supabase-js` 2.45.4 (licencia MIT) incluida en el repositorio. |
| `supabase/` | Scripts SQL que se pegan en orden en el SQL Editor de Supabase: `01-perfiles.sql` (cuenta, nick, foto, privacidad) y `02-datos-y-grupos.sql` (datos por cuenta, grupos, invitaciones y la función que filtra lo que ve cada miembro). |
| `tests/` | Pruebas automáticas. `QA.md` es el informe de la última corrida. |
| `QA.md` | Informe de pruebas: qué se verificó, resultados y qué hay que probar a mano. |
| `fonts/` | Tipografías Barlow y Barlow Condensed (licencia SIL OFL 1.1, ver `fonts/LICENSE-OFL.txt`). |

## Desarrollo

No hay dependencias ni paso de compilación. Para probarla en local:

```
python3 -m http.server 8000 -d gym-app
```

Y abrir `http://localhost:8000`. Los datos guardados tienen una versión (`S.v`) y se actualizan con migraciones al abrir la app. Al cambiar la forma de los datos hay que agregar una migración nueva.

## Puesta en marcha en Supabase

1. Crear un proyecto en Supabase y copiar la dirección y la clave *publishable* en `config.js`. No usar nunca la clave secreta ni `service_role`.
2. En **SQL Editor**, pegar y ejecutar en orden `supabase/01-perfiles.sql` y `supabase/02-datos-y-grupos.sql`.
3. En **Authentication → Providers → Email**: dejar el proveedor prendido, mínimo de clave de 8, y la confirmación de email apagada hasta tener envío de correos propio.
4. En **Authentication → URL Configuration**: poner la dirección de la app como Site URL y en Redirect URLs (para "Olvidé mi clave").
5. Cuando las personas ya tengan su cuenta, apagar **Allow new users to sign up**.

## Hoja de ruta

Hecho: cuentas con nick único y perfil con foto, privacidad, sincronización de datos, grupos con invitaciones, vista de grupo y de cada persona, recuperar clave, política de seguridad y pruebas automáticas.

Pendiente:

1. **Fotos de progreso** en el almacenamiento privado de Supabase, y compartirlas según la privacidad.
2. **Envío de correos propio** (por ejemplo con un dominio propio y un servicio SMTP) para confirmar emails y que llegue "Olvidé mi clave" a cualquier persona.
3. **Notas por ejercicio, sugerencia de peso y calentamientos.**
4. **App nativa** que reutilice los mismos datos.
5. Un botón para borrar la cuenta y todos sus datos del servidor.

## Historial de cambios

### 2026-10-10
- Etapas 2 y 3: los datos de cada persona se sincronizan con su cuenta y se pueden armar grupos por invitación con nick, con vista de grupo y de cada miembro.
- La privacidad la aplica la base de datos. Cada persona elige qué comparte.
- Informe de pruebas (`QA.md`) con 116 pruebas automáticas y pruebas de mutación.
- Se saca el perfil local de "pareja": ahora la pareja es un grupo.

### 2026-10-09
- Etapa 1 de Supabase: cuenta con email y clave, nick único, nombre, foto de perfil y privacidad. Librería incluida en `vendor/`. Todavía no sincroniza entrenos.
- Sin datos personales en el código: se sacaron rutinas, nombres y planillas de ejemplo.
- Tipografías incluidas en la app: ya no se piden a Google.
- Se agregó este README.

### 2026-10-08
- La app arranca vacía y pide los nombres al registrarse. Se agregó el botón Limpiar todo.
- Se borraron los datos de ejemplo (entrenos, peso y fotos) de los dispositivos.
- Últimos entrenos muestra series y minutos en lugar de kilos de volumen.
- Se explica qué significa Esta semana.
- La duración estimada de los bloques de cardio ahora es correcta.
- Se arregló el scroll del entrenamiento en curso en el celular.

### Antes
- Prototipo inicial con bloques, plan semanal, progreso, vista de pareja y ejercicios fijos.
