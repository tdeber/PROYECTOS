# Gym de a dos

App web de entrenamiento para grupos chicos (hoy pensada para dos personas). Se instala en el celular como una app (PWA), funciona sin conexión y no tiene servidor: todo corre en el navegador.

> Estado: prototipo en uso. Los datos viven solo en cada dispositivo. La sincronización entre personas todavía no existe (ver [Hoja de ruta](#hoja-de-ruta)).

## Qué hace

- **Registro inicial:** la primera vez pide los nombres de los dos integrantes y arranca vacía. Solo trae el catálogo de ejercicios.
- **Bloques:** cada persona arma sus bloques de entrenamiento (ejercicios, series, repeticiones y descanso). Las repeticiones pueden ser números, rangos (`10-12`), segundos (`30 s`) o minutos (`20 min`) para el cardio.
- **Plan semanal:** se asigna cada bloque a un día de la semana. La pestaña Semana muestra el plan y permite moverlo.
- **Entrenamiento en curso:** pantalla de series con kilos y repeticiones, temporizador de descanso con aviso sonoro y vibración, y resumen al terminar.
- **Progreso:** gráfico por ejercicio (peso máximo o 1RM estimado), entrenos por semana, récords, peso corporal y fotos de progreso.
- **Pareja:** muestra qué le toca a la otra persona y qué hizo, con calendario del mes.
- **Ejercicios:** catálogo con buscador y filtros. Se pueden agregar ejercicios propios.
- **Ejercicios fijos:** ejercicios que se suman al final de todos los entrenamientos de una persona.
- **Guías de ejercicios:** pestaña Guías con 46 ejercicios explicados: fotos reales en dos posiciones, músculos, pasos, errores comunes, respiración, variantes, un aviso sobre la rodilla y un botón para buscar videos. Los ejercicios con varias máquinas o versiones (por ejemplo el curl femoral sentado, acostado o de pie) tienen un selector para cambiar las fotos y la nota de ajuste. Dentro del entrenamiento, el botón **?** de cada ejercicio abre una guía rápida sin perder las series ni el descanso. Los ejercicios sin guía figuran como "Sin guía todavía".
- **Limpiar todo:** en el menú de perfil (la inicial arriba a la derecha) borra todos los datos del dispositivo y vuelve al registro.

## Cómo se usa

1. Abrir la página desde el navegador del celular. En iPhone: Compartir → Agregar a pantalla de inicio. En Android: menú → Instalar app.
2. Escribir los dos nombres y tocar Empezar.
3. En Bloques, crear los bloques de cada persona y, en Semana, asignarlos a los días.
4. En Hoy, tocar Empezar entrenamiento.

Cuando se publica una versión nueva, hay que cerrar la app por completo y volver a abrirla para que se actualice.

## Dónde se guardan los datos

- Todo se guarda en el `localStorage` del navegador de cada dispositivo (clave `gymapp_proto_v1`). Nada se envía a ningún servidor.
- **No se guarda ningún dato personal en este repositorio:** ni nombres, ni rutinas, ni entrenamientos, ni información de salud. El código solo trae el catálogo genérico de ejercicios.
- La app no usa analíticas, cookies ni servicios de terceros. Las tipografías y las fotos de las guías están incluidas en la app, así que no se piden a ningún servidor. La única salida a internet es el botón "Ver videos", que abre una búsqueda de YouTube cuando se toca.
- Desde un dispositivo nuevo la app siempre aparece vacía.

## Estructura

| Archivo | Para qué sirve |
| --- | --- |
| `index.html` | Toda la app: estilos, lógica y pantallas en un solo archivo. |
| `sw.js` | Service worker. Guarda la app en caché para que funcione sin conexión. Al cambiar los archivos hay que subir la versión (`gym-vN`). |
| `manifest.json` | Datos de instalación de la PWA. |
| `icons/` | Íconos de la app. |
| `guides/` | Guías de ejercicios: `guides.json` con los textos (se indexa por el nombre del ejercicio del catálogo) y `img/` con las fotos (`<id>-0.jpg` inicio y `<id>-1.jpg` final). |
| `fonts/` | Tipografías Barlow y Barlow Condensed (licencia SIL OFL 1.1, ver `fonts/LICENSE-OFL.txt`). |

## Desarrollo

No hay dependencias ni paso de compilación. Para probarla en local:

```
python3 -m http.server 8000 -d gym-app
```

Y abrir `http://localhost:8000`. Para agregar una guía, sumá una entrada en `guides/guides.json` con el nombre exacto del ejercicio del catálogo y, si hay fotos, ponelas en `guides/img/`. Los datos guardados tienen una versión (`S.v`) y se actualizan con migraciones al abrir la app. Al cambiar la forma de los datos hay que agregar una migración nueva.

## Hoja de ruta

Ideas acordadas, todavía sin hacer:

1. **Cuentas con correo y contraseña** (Firebase Authentication).
2. **Vincular personas por invitación:** una persona crea el grupo y manda una invitación a las demás.
3. **Grupos de dos o más:** parejas, amigos o familia, no solo de a dos.
4. **Sincronización de todos los datos** entre los dispositivos del grupo (Firebase). Los datos se guardarían en la cuenta de Firebase del proyecto y nunca en GitHub.
5. **App nativa** que reutilice esos mismos datos.
6. Un botón para borrar todos los datos del servidor, además del botón actual que borra los del dispositivo.

## Créditos

- Fotos de las guías: [Free Exercise DB](https://github.com/yuhonas/free-exercise-db), base de ejercicios que se declara de dominio público (Unlicense). No se verificó el origen de cada foto. Las imágenes se redujeron de tamaño.
- Tipografías Barlow y Barlow Condensed, licencia SIL OFL 1.1.

## Historial de cambios

### Pendiente: guía de ejercicios
La guía de ejercicios está hecha y probada en esta rama (`claude/zen-ritchie-ssnxwl`), pero **no está publicada**. Quedó armada sobre la versión anterior de la app (sin cuentas) y no se pasó a la versión con cuentas y grupos que está en `main`.
- Qué trae: pestaña Guías con 46 ejercicios, ficha completa con fotos en dos posiciones, selector de versión o máquina y atajo **?** durante el entrenamiento, con el descanso visible.
- Qué hay que pasar a `main`: la carpeta `gym-app/guides/` (textos en `guides.json` y fotos en `img/`), las funciones de guías y la pestaña nueva de `index.html`, y la entrada `guides/guides.json` del service worker (`sw.js`).
- Al pasarla hay que revisar que encaje con las pestañas y los grupos de la versión nueva y volver a probarla.
- Las fotos vienen de Free Exercise DB (dominio público declarado, sin verificar el origen de cada foto).
- Hasta entonces no se toca ni se borra esta rama.

### Arreglos incluidos en esta rama
- Los campos de texto ya no se salen de su tarjeta y los filtros no se aplastan en listas largas.

### 2026-10-09
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
