# TRAZZA — Frontend de demostración (`Trazza_Demo.html`)

## 1. Qué es la demo y qué no es

`/home/claude/Trazza_Demo.html` es una sola página HTML autocontenida: no tiene paso de build, no importa ningún framework ni librería de JavaScript, y su única dependencia externa es Google Fonts (las tres familias tipográficas se cargan por `<link>` desde `fonts.googleapis.com`; todo lo demás —CSS, marcado y lógica— vive en ese único archivo, en un bloque `<style>` y un bloque `<script>`). Es, en sentido estricto, el "shell" de interfaz de Trazza: la cáscara visual y de interacción del producto, pensada para mostrarse a un comprador (una minera, en este caso) sin que exista todavía una base de datos real detrás.

Los datos que se ven —transportistas, RUC, placas, nombres de conductores, porcentajes de cumplimiento— son enteramente ficticios. El propio archivo lo declara dos veces: en el comentario del bloque de datos ("DATOS DE DEMOSTRACIÓN — 100% FICTICIOS. Ninguna razón social, RUC, placa o nombre corresponde a una entidad real") y en el pie de la página, donde se lee textualmente: "Datos ficticios. Ninguna cifra, placa, RUC, razón social ni nombre de conductor en esta demo corresponde a una empresa o persona real. [...] **[FICTICIO]**". No hay ningún dato de ninguna empresa ni de ningún cliente real mezclado en este archivo.

Tampoco está conectada a Firebase. No hay un solo `<script>` que cargue el SDK de Firebase, no hay `firebase.initializeApp(...)`, y el arreglo `TRANSPORTISTAS` que aparece al inicio del bloque `<script>` es una constante de JavaScript escrita a mano, no el resultado de una consulta a Firestore. Los botones "Habilitar transportista" y "Solicitar documento" del cajón de detalle, y el botón de exportar el padrón a Excel de la paleta de comandos, solo disparan un aviso visual (la función `avisar()`, que muestra el `<div id="toast">`) — el propio pie de la tarjeta de detalle lo advierte con el texto "Demo · sin efectos reales". En síntesis: esto es la interfaz sin el motor detrás; el motor (`trazza.config.js`, `trazza-auth.js`, `trazza-db.js`, `firestore.rules`) existe en esta misma carpeta pero todavía no está cableado a esta página.

## 2. La decisión de diseño central: no hay panel lateral

La demo deliberadamente no tiene un `sidebar` ni un menú de navegación vertical. Esto fue un pedido explícito del usuario, no un accidente ni una limitación de espacio: el comentario que abre el bloque `<style>` lo deja escrito como principio de diseño ("No hay panel lateral. La navegación vive en el buscador de comandos (⌘K) y en el propio contenido"). Toda la superficie de navegación que normalmente ocuparía un panel lateral se reparte en cuatro piezas concretas de la interfaz:

- **La barra superior** (`.topbar`), fija en la parte de arriba de la pantalla (`position:sticky`), que contiene la marca, el conmutador de espacio de trabajo (`.wschip`, el botón `#btnWs` que hoy muestra "Minera Sur S.A.A." con un selector `▾`, aunque en esta demo solo hay un comprador cargado) y, a la derecha, la campana de avisos (`#btnAvisos`) y el avatar de sesión.
- **La paleta de comandos**, activada con `⌘K` o `Ctrl+K` (capturado en el listener de `keydown` sobre `ev.metaKey || ev.ctrlKey`) o haciendo clic en la barra de búsqueda `#btnBuscar`. Es un modal (`#palVelo` / `.pal`) con un campo de texto que busca, en este orden, transportistas por nombre/RUC/sigla/sede, unidades por placa, conductores por nombre, y acciones por su etiqueta; cada resultado se agrupa visualmente (`.pal-gr`) bajo "Transportistas", "Unidades", "Conductores" o "Acciones". Sin texto escrito, la paleta muestra por defecto las seis acciones predefinidas (invitar transportista, filtrar por bloqueados, por vencer, habilitados, exportar el padrón, cambiar de comprador) más los tres primeros transportistas, a modo de accesos directos. Se navega con las flechas arriba/abajo y se ejecuta con Enter; Escape la cierra.
- **El filtro de flujo** (`.flujo`, los botones `.fbtn` con `data-f="todos|bl|pv|ok|rv"`), una barra corta de pestañas sobre la grilla de tarjetas de transportista que permite acotar la vista a bloqueados, por vencer, habilitados o en revisión, cada uno con su contador.
- **El cajón lateral de detalle** (`.cajon`), que no es un menú sino una superficie de contenido: se desliza desde la derecha (`transform:translateX(103%)` → `translateX(0)` cuando tiene la clase `.on`) al hacer clic en una marca del portón o en una tarjeta de transportista, y muestra los requisitos agrupados por Empresa, Vehículo, Conductor y Viaje, más la matriz de equivalencias frente a otros compradores.

El elemento distintivo de toda la pantalla —lo que reemplaza al típico dashboard de tarjetas resumen— es **el portón** (sección `.porton`, con el `<h1>` "35 de 54 unidades pueden cargar hoy. 19 no."). Dentro de él, la `.rejilla` pinta una marca vertical (`.tick`) por cada unidad real declarada por los transportistas (54 en esta demo, derivadas sumando el campo `unidades` de cada uno de los 6 transportistas ficticios), coloreada según su estado de habilitación, y cada una es un `<button>` clicable que abre el cajón de detalle directamente en esa unidad. La idea que transmite el propio texto de la interfaz es literal: "Cada marca es una unidad declarada por tus transportistas. El color es su estado de habilitación en este momento, no el del último informe. Haz clic en cualquier marca para ver qué le falta."

## 3. El sistema de diseño

Todas las variables de diseño están declaradas una sola vez en el `:root` del `<style>`, con el comentario "TRAZZA · sistema de diseño" encabezándolo. Los colores son:

| Variable | Valor | Uso |
|---|---|---|
| `--basalt` | `#12161C` | fondo de la barra superior y del portón (el negro-azulado de base) |
| `--basalt2` | `#1B2129` | superficies secundarias sobre basalto (chips, inputs oscuros) |
| `--basalt3` | `#2B3441` | bordes sobre basalto; también color del estado "en revisión" en tarjetas |
| `--basalt4` | `#3E4956` | acento sobre basalto; color del estado "en revisión" en el portón (`.tick[data-e="rv"]`) |
| `--niebla` | `#EBEFF3` | fondo general de la página (`body`) |
| `--papel` | `#FFFFFF` | fondo de tarjetas, cajón y paleta de comandos |
| `--cobre` | `#C0703A` | acento de marca (el glifo del logo, el punto de la campana de avisos) |
| `--cardenillo` | `#12897A` | color del estado "habilitada"/"ok" en todo el sistema |
| `--ambar` | `#B8820F` | color del estado "por vencer"/"pv" |
| `--ocre` | `#A93529` | color del estado "bloqueada"/"bl" |
| `--tinta` | `#151A20` | color de texto principal sobre fondo claro |
| `--tinta2` | `#59636F` | texto secundario |
| `--tinta3` | `#8B95A1` | texto terciario/deshabilitado |
| `--linea` | `#D9DFE6` | bordes sobre fondo claro |

A esto se suman `--r:14px` y `--r2:8px` (los dos radios de esquina estándar del sistema) y dos sombras compuestas, `--sombra` y `--sombra2`, para tarjetas y superficies flotantes respectivamente.

La paleta no es decorativa: el propio comentario del `:root` explica de dónde sale ("Paleta derivada del material que se transporta: basalto (el sillar y la roca del corredor sur), cobre (la carga) y cardenillo (el cobre oxidado)"). Es decir, basalto es la piedra volcánica del sur del Perú —el color de fondo, la base sobre la que todo se apoya—; cobre es la carga que transportan las unidades que la demo habilita —el acento de marca—; y cardenillo es el cobre oxidado, ese verde-azulado que aparece cuando el cobre se expone al aire, y aquí se usa como el verde de "todo en orden": una unidad habilitada. Sobre esa base de tres colores con origen material, ámbar y ocre son los dos estados de alerta del sistema: ámbar es "por vencer" (el aviso temprano, el color de la urgencia moderada) y ocre es "bloqueado" (el rojo-tierra de lo que ya no puede cargar).

Las tres tipografías, declaradas en las variables `--disp`, `--sans` y `--mono` y cargadas desde Google Fonts en el `<link>` del `<head>` (familia `Archivo` con ejes de ancho y peso variables, `IBM Plex Sans` en los pesos 400/500/600/700, `IBM Plex Mono` en 400/500/600), cumplen tres roles distintos y no se mezclan por accidente en el CSS:

- **Archivo** (`--disp`) es la tipografía de display: se usa en los títulos (`h1, h2, h3` toman `font-family:var(--disp)`), en la marca "TRAZZA" de la barra superior y en el logotipo de cada transportista dentro de su tarjeta. Es la que lleva el peso 800 y el `font-stretch:125%` que le da ese carácter ancho y afirmativo al titular del portón.
- **IBM Plex Sans** (`--sans`) es la tipografía de texto corrido: está declarada como fuente por defecto del `body` y se usa en párrafos, etiquetas de botón, nombres de transportista dentro de la tarjeta (`.tarj h3`) y en general en cualquier texto de lectura.
- **IBM Plex Mono** (`--mono`) es la tipografía de datos y contadores: se aplica mediante la clase utilitaria `.mono` (que además fija `font-variant-numeric:tabular-nums` para que las cifras alineen en columna) y se usa explícitamente en el RUC de cada transportista, en los contadores del filtro de flujo (`.fbtn .n`), en los contadores de la leyenda del portón, en el reloj/fecha superior, en los atajos de teclado (`.kbd`) y en las marcas de vencimiento de la línea de tiempo.

## 4. Cómo se conecta al motor real

La demo no llama a Firestore, pero su pie (`<footer class="pie">`) documenta con precisión qué bloque de interfaz debería consumir qué llamada de `TRAZZA.db` una vez que se cablee al motor. Cito el texto tal como aparece en el archivo, porque es la especificación de facto de esa integración:

> "El portón se alimenta de `TRAZZA.db.listar({coleccion:'unidades', modulo:'flota'})`; las tarjetas de `TRAZZA.db.listar({coleccion:'proveedores'})`; el detalle de requisitos de `TRAZZA.db.listar({coleccion:'documentos', extra:q=>q.where('proveedorId','==',id)})`. Las tres inyectan `empresaId` de forma obligatoria — ninguna pantalla puede saltarse el aislamiento entre clientes. Ver `trazza-db.js` y `firestore.rules` en el núcleo. **[SUPUESTO: nombres de colección finales por confirmar en la migración]**"

En términos concretos, esto mapea así:

- **El portón** (`.porton`, la función `pintarPorton()` que hoy itera sobre el arreglo `UNIDADES` derivado en memoria) pasaría a construir esa lista con `TRAZZA.db.listar({coleccion:'unidades', modulo:'flota'})`.
- **Las tarjetas de transportista** (`.rejilla-t`, la función `pintarTarjetas()` que hoy itera sobre `TRANSPORTISTAS`) pasarían a alimentarse de `TRAZZA.db.listar({coleccion:'proveedores'})`.
- **El cajón de detalle** (la función `abrirCajon()`, específicamente la lista de requisitos por transportista, hoy el campo `req[]` embebido en cada objeto de `TRANSPORTISTAS`) pasaría a leer de `TRAZZA.db.listar({coleccion:'documentos', extra:q=>q.where('proveedorId','==',id)})`.

La función `listar()` de `trazza-db.js` (línea 61 en adelante) ya está escrita para forzar esto: siempre agrega `.where("empresaId","==",empresaId)` antes de aplicar cualquier otro filtro, y rechaza la promesa si no hay `empresaId` activo. Es decir, el aislamiento entre clientes (multi-tenant) no depende de que cada pantalla se acuerde de filtrar correctamente: está impuesto por la capa de datos misma. Vale remarcar la advertencia que trae el propio pie de la demo: los nombres `unidades`, `proveedores` y `documentos` son **[SUPUESTO]** — son los nombres razonables dado el inventario de colecciones que describe `README-NUCLEO.md` y que cubre `firestore.rules` (que sí incluye `documentos` y `proveedores` como colecciones reales, pero no `unidades` como colección raíz — ver la advertencia de seguridad más abajo), pero no están confirmados como definitivos hasta que se haga la migración de datos real.

## 5. Qué falta para pasar de demo a producto

Lo que sigue es una lista honesta de lo que falta, no una lista de deseos. Cada punto está marcado **[PENDIENTE]** porque ninguno está resuelto hoy en el repositorio:

- **Reemplazar el arreglo `TRANSPORTISTAS`** (y los arreglos derivados `UNIDADES`, `CONDUCTORES`, la función `placa()`) por llamadas reales a `TRAZZA.db.listar(...)`, siguiendo el mapeo descrito en la sección 4. Esto implica además reescribir `pintarPorton()`, `pintarTarjetas()`, `pintarVencimientos()` y `abrirCajon()` como funciones asíncronas que esperan una promesa en lugar de iterar un arreglo síncrono ya en memoria. **[PENDIENTE]**
- **Montar el bootstrap de `initializeApp` + App Check.** Como ya señala `README-NUCLEO.md` (hallazgo cuarto), ni `trazza-auth.js` ni `trazza-db.js` incluyen el código que llama a `firebase.initializeApp(TRAZZA_CONFIG.firebase)` ni a `firebase.appCheck().activate(TRAZZA_CONFIG.appCheckSiteKey)`; falta escribir ese pequeño script de arranque (`trazza-init.js` o equivalente) y cargarlo, en cada página, después del SDK de Firebase y de `trazza.config.js`, pero antes de `trazza-auth.js`/`trazza-db.js`. Sin este paso, `TRAZZA.db.listar()` fallaría porque `firebase.firestore()` no tendría una app inicializada de la cual colgarse. **[PENDIENTE]**
- **Cargar las fuentes localmente si se quiere que la demo (o el producto) funcione sin internet.** Hoy las tres familias tipográficas dependen de dos `<link rel="preconnect">` y una hoja de estilo servida desde `fonts.googleapis.com`/`fonts.gstatic.com`; si la página se abre sin conexión, el navegador cae a las tipografías del sistema declaradas como *fallback* en cada variable (`system-ui`, `-apple-system`, `"Segoe UI"`, `ui-monospace`, `"SF Mono"`, `Menlo`), lo cual altera el sistema de diseño descrito en la sección 3. Para un uso realmente autocontenido habría que empaquetar los archivos `.woff2` de Archivo, IBM Plex Sans e IBM Plex Mono y servirlos localmente con `@font-face`. **[PENDIENTE]**
- **Implementar de verdad los botones "Habilitar transportista" y "Solicitar documento"** del pie del cajón (`#cjHab` y `#cjSol`). Hoy ambos solo llaman a `avisar(...)`, que muestra un toast de texto fijo y no toca ningún dato; en producción, "Habilitar transportista" debería escribir en la colección de proveedores (probablemente vía `TRAZZA.db.guardar('proveedores', id, {estado:'ok', ...})`) y "Solicitar documento" debería generar una notificación o tarea real hacia el transportista (posiblemente contra la colección `mail` o `tareas` que ya contempla `firestore.rules`). **[PENDIENTE]**
- **Diseñar el modelo de datos de `documentos` por proveedor.** La demo asume, por cada transportista, una lista `req[]` de objetos con forma `{g (grupo: Empresa/Vehículo/Conductor/Viaje), n (nombre del requisito), nat (est/con), e (estado ok/pv/bl/rv), v (días para vencer, o null si no aplica)}`, más un arreglo `equiv[]` de equivalencias frente a otros compradores. Ese esquema hoy solo existe como forma de un objeto JavaScript en la demo; no hay definición de colección, subcolección ni campos en `documentos` (ni en `firestore.rules` ni en `firestore.indexes.json`) que replique esta estructura granular por requisito, naturaleza (estatutario/contractual) y comprador. Ese diseño de datos —cómo se modela un requisito, su vigencia, su naturaleza y su equivalencia entre compradores— es trabajo de modelado pendiente antes de poder migrar esta pantalla a datos reales. **[PENDIENTE]**

## 6. Cómo verificarlo

Existen dos scripts de verificación en `/home/claude` pensados para archivos HTML autocontenidos como este:

`python3 /home/claude/verify_html.py Trazza_Demo.html` hace una revisión puramente estructural del marcado, sin parsear HTML de verdad (usa expresiones regulares sobre el texto): detecta la clase de error "un `<div>` con ciertas clases que se cierra por accidente con `</p>`", comprueba que el número de `<div>` abiertos y cerrados cuadre, cuenta pares de `<section>`, `<button>` y `<template>` para detectar descuadres, verifica que todo `href="#algo"` apunte a un `id` que exista en el documento, y busca valores de `id` duplicados. Termina con un resumen y sale con código distinto de cero si algo falla.

`node /home/claude/verify_shot.js Trazza_Demo.html <carpeta-de-salida>` renderiza el archivo con Chromium sin cabeza (headless) en dos tamaños de pantalla —escritorio (1440×900) y móvil (390×844)—, capturando `desktop.png` y `mobile.png` en la carpeta indicada. Además de las capturas, revisa dos cosas en tiempo de ejecución real: que no se dispare ningún error de consola ni error de página de JavaScript, y que no haya desbordamiento horizontal (contenido más ancho que el viewport) en ninguno de los dos tamaños, reportando además los elementos concretos responsables del desbordamiento si lo hay. También sale con código distinto de cero si algo falla, e imprime un resumen en JSON.

## 7. Dos reglas de seguridad que esta demo respeta

Esta demo no toca datos reales, y las dos reglas que lo garantizan vienen de lecciones de arquitectura que el núcleo (`firestore.rules`, `trazza-db.js`) existe para no repetir:

Primero, un archivo de reglas que nombra colecciones que la aplicación no usa no protege nada. Es peor que no tenerlo, porque da la sensación de que hay una capa de seguridad donde no la hay, y esa sensación es la que hace que nadie vuelva a mirarlo. Por eso el `firestore.rules` de Trazza cubre explícitamente las colecciones que el sistema sí usa, con aislamiento por `empresaId` y por área, y termina con un `match /{document=**} { allow read, write: if false; }` de cierre por defecto: lo que no está declarado, no se lee ni se escribe.

Segundo, "la interfaz solo lo muestra al admin" describe un control de **interfaz** —qué rol ve qué campo dentro de la aplicación—, no un control de **acceso al dato**: si el archivo se puede descargar sin sesión, el rol del que mira es irrelevante. De ahí la regla de Trazza de que ningún dato de persona vive en un archivo servido: todo pasa por Firestore y por las reglas de `rrhh`, y el único seed que existe (`herramientas/sembrar-demo.js`) trae personas inventadas. Ningún dato de ninguna persona real fue copiado a Trazza ni a esta demo.
