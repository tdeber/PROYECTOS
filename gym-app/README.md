# Gym de a dos

App web de entrenamiento para grupos chicos (hoy pensada para dos personas). Se instala en el celular como una app (PWA), funciona sin conexión y no tiene servidor: todo corre en el navegador.

> Estado: prototipo en uso. Los datos viven solo en cada dispositivo. Cada persona puede crear su cuenta con email, elegir un nick único, subir una foto y configurar su privacidad. La sincronización de los entrenos y los grupos todavía no están activos (ver [Hoja de ruta](#hoja-de-ruta)).

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

- Todo se guarda en el `localStorage` del navegador de cada dispositivo (clave `gymapp_proto_v1`). Los datos de entrenamiento no se envían a ningún servidor. Lo único que se guarda en Supabase hoy es el perfil: email, nick, nombre, foto de perfil (reducida) y ajustes de privacidad.
- **No se guarda ningún dato personal en este repositorio:** ni nombres, ni rutinas, ni entrenamientos, ni información de salud. El código solo trae el catálogo genérico de ejercicios.
- La app no usa analíticas ni cookies. Las tipografías están en `fonts/` y la librería de Supabase en `vendor/`, así que no se piden a ninguna CDN. El único servicio externo es el proyecto de Supabase propio, y solo cuando se inicia sesión.
- Desde un dispositivo nuevo la app siempre aparece vacía.

## Estructura

| Archivo | Para qué sirve |
| --- | --- |
| `index.html` | Toda la app: estilos, lógica y pantallas en un solo archivo. |
| `sw.js` | Service worker. Guarda la app en caché para que funcione sin conexión. Al cambiar los archivos hay que subir la versión (`gym-vN`). |
| `manifest.json` | Datos de instalación de la PWA. |
| `icons/` | Íconos de la app. |
| `config.js` | Dirección del proyecto de Supabase y clave pública (publishable). Es seguro que esté en el repositorio: los datos los protegen las reglas de la base. Nunca poner acá una clave secreta ni `service_role`. |
| `vendor/supabase.js` | Librería `@supabase/supabase-js` 2.45.4 (licencia MIT) incluida en el repositorio. |
| `supabase/` | Scripts SQL que se pegan en orden en el SQL Editor de Supabase: tablas y reglas de seguridad. `01-perfiles.sql` crea los perfiles. |
| `fonts/` | Tipografías Barlow y Barlow Condensed (licencia SIL OFL 1.1, ver `fonts/LICENSE-OFL.txt`). |

## Desarrollo

No hay dependencias ni paso de compilación. Para probarla en local:

```
python3 -m http.server 8000 -d gym-app
```

Y abrir `http://localhost:8000`. Los datos guardados tienen una versión (`S.v`) y se actualizan con migraciones al abrir la app. Al cambiar la forma de los datos hay que agregar una migración nueva.

## Cómo va a funcionar (decidido)

- **Una cuenta por persona**, cada una con su email y un **nick único** (se puede cambiar mientras esté libre).
- **Grupos por invitación:** quien crea un grupo es el único que invita, escribiendo el nick exacto. Se puede aceptar, rechazar o cancelar. Una persona puede estar en varios grupos y un grupo puede tener varias personas.
- **Si no se invita a nadie, la app se ve normal**, con los datos propios.
- **Privacidad global** por persona: seis interruptores (entrenos, estadísticas, plan, bloques en detalle, peso, fotos). Cada grupo ve solo lo habilitado. En la etapa de grupos esto lo aplica la base de datos, no solo la pantalla.

## Hoja de ruta

Hecho:

- **Etapa 1, perfiles:** cuenta con email y clave, nick único, nombre, foto de perfil y privacidad guardados en la tabla `perfiles`.

Pendiente, en este orden:

1. **Etapa 2, mis datos:** guardar y recuperar en Supabase los bloques, el plan, los entrenos, el peso y los ejercicios propios, con el celular como copia principal y envío automático cuando hay internet. Los datos viven en la cuenta de Supabase del proyecto y nunca en GitHub.
2. **Etapa 3, grupos:** crear grupos con nombre, invitar por nick, aceptar, rechazar, cancelar y sacar miembros. Pestaña Grupos con resumen, calendario, récords y el perfil de cada persona con sus estadísticas.
3. **Fotos de progreso** en el almacenamiento privado de Supabase.
4. **Recuperar la clave** por email y confirmación de email.
5. **App nativa** que reutilice esos mismos datos.
6. Un botón para borrar todos los datos del servidor, además del botón actual que borra los del dispositivo.

## Historial de cambios

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
