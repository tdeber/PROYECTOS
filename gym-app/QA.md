# Informe de pruebas (QA)

Generado el 9 de octubre de 2026 a las 8:35 p. m.. **116 de 116 pruebas automáticas correctas.**

| Suite | Pruebas | Correctas | Fallas |
| --- | --: | --: | --: |
| Base de datos (Postgres real, scripts SQL de Supabase) | 67 | 67 | 0 |
| App completa (varios celulares simulados contra esa misma base) | 49 | 49 | 0 |

## Cómo se corre

```
cd gym-app/tests
npm install
npm run todo      # corre las dos suites y regenera este informe
```

Las pruebas no tocan tu proyecto de Supabase ni crean cuentas reales. La base es un Postgres de verdad que corre en memoria (PGlite) y ejecuta exactamente los mismos scripts de `supabase/`. La app corre en jsdom, con un "celular" por ventana, y habla con esa base a través de un cliente que imita a `supabase-js`.

## Base de datos (Postgres real, scripts SQL de Supabase)


### Acceso anonimo

| ID | Qué se verifica | Resultado |
| --- | --- | :-: |
| DB-01 | Sin sesion no se puede leer perfiles | OK |
| DB-02 | Sin sesion no se puede leer datos | OK |
| DB-03 | Sin sesion no se puede leer grupos, miembros ni invitaciones | OK |
| DB-04 | Sin sesion no se puede ejecutar ninguna funcion | OK |

### Perfiles

| ID | Qué se verifica | Resultado |
| --- | --- | :-: |
| DB-10 | Cada persona ve solo su propio perfil | OK |
| DB-11 | No se puede crear un perfil a nombre de otra persona | OK |
| DB-12 | No se puede editar el perfil de otra persona (0 filas afectadas) | OK |
| DB-13 | El nick es unico sin importar mayusculas | OK |
| DB-14 | El nick solo acepta minusculas, numeros y guion bajo (3 a 20) | OK |
| DB-15 | El nombre no puede estar vacio ni pasar de 24 caracteres | OK |
| DB-16 | La foto de perfil tiene tope de tamano | OK |
| DB-17 | La privacidad debe ser un objeto chico | OK |
| DB-18 | nick_disponible distingue libres, tomados y el propio | OK |
| DB-19 | Al cambiar de nick el anterior queda libre | OK |
| DB-20 | No se puede cambiar a un nick tomado | OK |

### Datos propios

| ID | Qué se verifica | Resultado |
| --- | --- | :-: |
| DB-30 | Cada persona guarda y lee sus datos | OK |
| DB-31 | No se pueden leer los datos de otra persona | OK |
| DB-32 | No se pueden escribir datos a nombre de otra persona | OK |
| DB-33 | No se pueden modificar los datos de otra persona | OK |
| DB-34 | Se puede actualizar el propio dato (upsert) | OK |
| DB-35 | Los datos tienen tope de tamano | OK |

### Acceso directo a grupos

| ID | Qué se verifica | Resultado |
| --- | --- | :-: |
| DB-40 | Con sesion tampoco se pueden leer ni escribir las tablas de grupos directo | OK |

### Grupos

| ID | Qué se verifica | Resultado |
| --- | --- | :-: |
| DB-50 | Crear un grupo: quien lo crea queda como miembro y creador | OK |
| DB-51 | Hace falta tener perfil para crear un grupo | OK |
| DB-52 | El nombre del grupo no puede estar vacio ni pasar de 30 | OK |
| DB-53 | Maximo 10 grupos creados por persona | OK |
| DB-54 | Quien no esta en un grupo no lo ve | OK |
| DB-55 | Solo el creador puede renombrar el grupo | OK |

### Invitaciones

| ID | Qué se verifica | Resultado |
| --- | --- | :-: |
| DB-60 | Solo el creador puede invitar | OK |
| DB-61 | Invitar a un nick que no existe | OK |
| DB-62 | No se puede invitar a uno mismo | OK |
| DB-63 | Invitar por nick funciona aunque cambien las mayusculas | OK |
| DB-64 | No se puede invitar dos veces a la misma persona | OK |
| DB-65 | La invitacion la ve solo quien la recibe | OK |
| DB-66 | Solo el creador ve las invitaciones enviadas | OK |
| DB-67 | Otra persona no puede aceptar ni rechazar una invitacion ajena | OK |
| DB-68 | Cancelar: solo la puede cancelar quien envio | OK |
| DB-69 | Rechazar una invitacion | OK |
| DB-70 | Despues de rechazar, se puede volver a invitar | OK |
| DB-71 | Aceptar la invitacion: entra al grupo | OK |
| DB-72 | No se puede invitar a quien ya es miembro | OK |
| DB-73 | Limite de 20 personas por grupo (miembros + invitaciones pendientes) | OK |

### Miembros

| ID | Qué se verifica | Resultado |
| --- | --- | :-: |
| DB-80 | Un miembro ve la lista de miembros con nick, nombre y creador primero | OK |
| DB-81 | Quien no es miembro no ve la lista | OK |
| DB-82 | Solo el creador puede quitar miembros | OK |
| DB-83 | El creador no puede sacarse a si mismo ni salir | OK |
| DB-84 | Un miembro puede salir del grupo | OK |
| DB-85 | El creador puede sacar a un miembro | OK |

### Privacidad de lo que ven los demas

| ID | Qué se verifica | Resultado |
| --- | --- | :-: |
| DB-90 | Quien no comparte grupo no puede ver datos | OK |
| DB-91 | Sin sesion no se puede ver_datos | OK |
| DB-92 | Con todo apagado el miembro no recibe nada de la persona | OK |
| DB-93 | Solo "entrenos": ve fechas, bloques y cantidad de series, sin kilos ni repeticiones | OK |
| DB-94 | "estadisticas" entrega los entrenos completos y los nombres de ejercicios | OK |
| DB-95 | "plan" muestra los dias y los nombres de bloques, sin ejercicios | OK |
| DB-96 | "bloques" muestra series, repeticiones y descansos | OK |
| DB-97 | "peso" muestra el peso corporal y nada mas | OK |
| DB-98 | Cada persona se ve completa a si misma, sin importar su privacidad | OK |
| DB-99 | Cambiar la privacidad se nota enseguida | OK |
| DB-100 | Una persona sin datos cargados devuelve "vacio" | OK |
| DB-101 | Datos mal formados no rompen la vista de los demas: se devuelven listas vacias | OK |
| DB-101b | Entrenos con forma rota dentro de la lista tampoco rompen nada (devuelve error controlado) | OK |
| DB-102 | Un miembro no puede leer la tabla de datos de otro, aunque comparta grupo | OK |
| DB-103 | Al salir del grupo se pierde el acceso a los datos | OK |
| DB-104 | Dos grupos distintos: se ve a quien comparte AL MENOS un grupo | OK |

### Borrado y limpieza

| ID | Qué se verifica | Resultado |
| --- | --- | :-: |
| DB-110 | Eliminar un grupo: solo el creador, y se borran miembros e invitaciones | OK |
| DB-111 | Borrar una cuenta borra su perfil, datos, membresias e invitaciones | OK |
| DB-112 | Los scripts se pueden correr de nuevo sin perder datos | OK |

## App completa (varios celulares simulados contra esa misma base)


### Registro y perfil

| ID | Qué se verifica | Resultado |
| --- | --- | :-: |
| AP-01 | La app arranca pidiendo el nombre (una sola persona) | OK |
| AP-02 | Formulario de cuenta en el perfil; clave corta y cuenta inexistente avisan | OK |
| AP-03 | Registrarse lleva a elegir nick y nombre; valida el nick en vivo contra la base | OK |
| AP-04 | Nick tomado (sin importar mayusculas) se avisa y no crea el perfil | OK |
| AP-05 | El perfil muestra nick y nombre; se pueden cambiar; el nick viejo queda libre | OK |
| AP-06 | Los 6 interruptores de privacidad se guardan en la nube y los atajos funcionan | OK |
| AP-07 | Recuperar clave: pide el mail, abre la pantalla de clave nueva y exige 8 caracteres | OK |
| AP-08 | Al confirmar el email, la persona entra sola | OK |

### Sincronizacion de datos

| ID | Qué se verifica | Resultado |
| --- | --- | :-: |
| AP-20 | Al crear la cuenta se suben los datos que ya habia en el celular | OK |
| AP-21 | El indicador de estado queda en "sincronizado" | OK |
| AP-22 | Un celular nuevo, al entrar con la cuenta, recupera todo | OK |
| AP-23 | Un cambio se envia solo, sin tocar nada (espera de 1,5 s) | OK |
| AP-24 | Un cambio hecho en otro celular llega al volver a abrir la app | OK |
| AP-25 | Si cambian los dos lados, se unen sin perder nada | OK |
| AP-26 | Sin internet la app sigue guardando y no dice "sincronizado"; al volver se envia | OK |
| AP-27 | Un entrenamiento terminado se sube a la nube | OK |
| AP-28 | Ids de ejercicios en conflicto no se mezclan: se remapean por nombre | OK |
| AP-29 | Cerrar sesion borra los datos del celular y otra cuenta no los ve | OK |
| AP-30 | Si hay cambios sin enviar, cerrar sesion pide confirmar antes de borrar | OK |
| AP-31 | Otra persona que entra en un celular con datos de alguien mas empieza de cero | OK |
| AP-32 | "Limpiar todo" tambien borra la nube y los datos no reaparecen | OK |

### Grupos e invitaciones

| ID | Qué se verifica | Resultado |
| --- | --- | :-: |
| AP-40 | Sin grupos, la pestaña Grupos explica que hacer y la app funciona normal | OK |
| AP-41 | Crear un grupo con nombre: queda en la lista y se abre en Ajustes | OK |
| AP-42 | Invitar: nick inexistente, a uno mismo y en blanco muestran el aviso correcto | OK |
| AP-43 | Invitar por nick (con @ y mayusculas) envia la invitacion | OK |
| AP-44 | Quien recibe la invitacion ve el aviso en Hoy y el punto rojo en la pestaña Grupos | OK |
| AP-45 | La invitacion muestra grupo y quien invita; rechazar y volver a invitar funciona | OK |
| AP-46 | El creador puede cancelar una invitacion pendiente | OK |
| AP-47 | Aceptar la invitacion: Beto entra al grupo | OK |
| AP-48 | Quien no creo el grupo no ve el formulario de invitar y puede salir | OK |
| AP-49 | Resumen del grupo: ambos aparecen con su estado de hoy | OK |

### Privacidad entre personas

| ID | Qué se verifica | Resultado |
| --- | --- | :-: |
| AP-50 | Con todo apagado se ve a Beto pero nada de sus datos (todo marcado como privado) | OK |
| AP-51 | Solo "entrenos": se ve que entreno pero no kilos ni plan | OK |
| AP-52 | Con "estadisticas": se ven graficos, racha y records de Beto | OK |
| AP-53 | Con "plan" se ven los dias y los nombres de bloques, pero no los ejercicios | OK |
| AP-54 | Con "bloques en detalle" se ven los ejercicios y se puede copiar un bloque | OK |
| AP-55 | Con "peso" se ve el peso corporal | OK |
| AP-56 | Cada uno se ve completo a si mismo en el grupo, aun con todo privado | OK |
| AP-57 | El calendario del grupo marca los dias y el detalle muestra solo lo permitido | OK |

### Administracion del grupo

| ID | Qué se verifica | Resultado |
| --- | --- | :-: |
| AP-60 | El creador saca a un miembro (con confirmacion) y el miembro pierde el acceso | OK |
| AP-61 | Renombrar el grupo | OK |
| AP-62 | Un miembro puede salir del grupo (con confirmacion) | OK |
| AP-63 | El creador elimina el grupo (con confirmacion) y desaparece para todos | OK |

### Seguridad de la interfaz

| ID | Qué se verifica | Resultado |
| --- | --- | :-: |
| AP-70 | Nombres, nicks y avatares maliciosos no ejecutan codigo ni rompen el estilo | OK |
| AP-71 | Los datos mal formados de otra persona no rompen la pantalla | OK |

### Regresion: funciones de siempre

| ID | Qué se verifica | Resultado |
| --- | --- | :-: |
| AP-80 | Sin nube configurada la app funciona igual (bloques, plan, entrenar, progreso) | OK |
| AP-81 | Datos viejos (v5, con perfil local de pareja) se migran sin perder los del usuario | OK |
| AP-82 | La app instalada sin conexion ni nube arranca (service worker y archivos propios) | OK |
| AP-83 | Sin errores de JavaScript en ningun celular durante toda la prueba | OK |

## Pruebas de mutación

Para comprobar que las pruebas de seguridad detectan errores reales, se rompió a propósito cada protección y se verificó que alguna prueba fallara. Todas fueron detectadas.

| Se rompió | Cómo | Pruebas que lo detectaron |
| --- | --- | --- |
| Foto de perfil sin validar | Se mostraba cualquier texto como imagen | AP-70 |
| Nombres sin escapar | Se insertaba el nombre del miembro sin esc() | AP-70 |
| Color de bloque sin validar | Se aceptaba cualquier texto como color | AP-70 |
| Cerrar sesión sin borrar | No se limpiaban los datos del celular | AP-29, AP-30 |
| Privacidad ignorada en la base | `ver_datos` entregaba estadísticas siempre | DB-92, DB-93, DB-95, DB-97, DB-99 |
| Acceso sin pertenecer al grupo | `ver_datos` no pedía compartir grupo | DB-90, DB-103, DB-104 |
| Invitar sin ser creador | `invitar` no verificaba al creador | DB-60, DB-63, DB-65 y 7 más |

## Lo que estas pruebas NO cubren

Estas cosas hay que verificarlas a mano en celulares reales y en tu proyecto real de Supabase:

- [ ] Instalar la app en un iPhone (Safari, Compartir, Agregar a pantalla de inicio) y en un Android (Chrome, Instalar app).
- [ ] Abrir la app sin conexión una vez instalada (service worker).
- [ ] Subir una foto de perfil desde la galería o la cámara (recorte y tamaño).
- [ ] Que suene y vibre el aviso de descanso (en iPhone la vibración no existe).
- [ ] Crear la cuenta real de cada persona y comprobar que la tabla `perfiles` y `datos` reciben las filas (Supabase, Table Editor).
- [ ] Probar una invitación real entre dos celulares y el cambio de privacidad en vivo.
- [ ] Mails de recuperación de clave y confirmación: dependen de configurar el envío de correos en Supabase (ver README).
- [ ] La política de seguridad de contenido en un navegador real (se verificó en Chrome local, no en cada celular).
