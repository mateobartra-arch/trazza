# Enlazar Trazza con Firebase

Esta guía lleva la carpeta `trazza` desde una carpeta de archivos hasta un sitio
publicado, con base de datos, reglas de seguridad, un administrador que puede
entrar y un ambiente de demostración con datos ficticios. Está escrita para
hacerse una vez por empresa. La segunda vez toma quince minutos.

Hay dos caminos y valen lo mismo. El **camino corto** es un solo comando que hace
siete pasos seguidos; sirve cuando todo va bien, que es casi siempre. El **camino
largo** es la consola web, clic por clic; sirve cuando el comando falla en algún
punto y hay que terminar a mano, y también sirve para entender qué está pasando
por debajo, que a la larga importa más.

Los tres pasos que ningún comando puede hacer están en la sección 4. No es una
omisión del script: la CLI de Firebase no expone esas tres operaciones, y
cualquier guía que diga lo contrario está desactualizada.

---

## 0. Antes de empezar

Necesitas una cuenta de Google (la misma con la que vas a administrar el sistema,
no una personal que después no puedas ceder), Node.js en versión LTS descargado
de `https://nodejs.org`, y esta carpeta completa en tu disco. Nada más. No hace
falta tarjeta de crédito: el plan Spark alcanza de sobra para un piloto, y en la
sección 7 está cómo poner una alerta de gasto antes de que eso deje de ser
cierto.

Decide dos identificadores antes de tocar nada, porque cambiarlos después es una
migración, no una edición:

El **id del proyecto Firebase** es global para todo Google, así que puede estar
tomado. Usa el patrón `trazza-<empresa>`, por ejemplo `trazza-misagi`. Aparece en
la URL del sitio publicado (`trazza-misagi.web.app`).

El **empresaId** es el inquilino dentro de Trazza. Es corto, en minúsculas, sin
espacios ni tildes: `acme`. Va escrito en cada documento de Firestore y es el
campo sobre el que se apoya toda la separación entre empresas en
`firestore.rules`. Cambiarlo después obliga a reescribir todos los documentos.

---

## 1. El camino corto: un comando

Abre PowerShell en la carpeta `trazza` (clic derecho dentro de la carpeta →
*Abrir en Terminal*) y corre:

```powershell
.\herramientas\enlazar.ps1 -Proyecto trazza-misagi -Empresa acme -Razon "ACME TRANSPORTES S.A.C." -Ruc 20123456789
```

En macOS, Linux o Git Bash el equivalente es:

```bash
bash herramientas/enlazar.sh --proyecto trazza-misagi --empresa acme --razon "ACME TRANSPORTES S.A.C." --ruc 20123456789
```

El script comprueba Node, instala la CLI de Firebase si falta, abre el navegador
para que inicies sesión con Google, crea el proyecto, crea la base Firestore en
la región `nam5`, registra la app web, **lee las credenciales de la propia CLI**
y las escribe en `public/core/trazza.config.js`, y publica reglas, índices y
sitio.

Que las credenciales las escriba una máquina y no tú es deliberado. El paso que
más veces rompe un enlace con Firebase es copiar el bloque de configuración desde
el navegador y pegarlo con una coma de menos o con comillas curvas que el
navegador convirtió sin avisar. `escribir-config.js` toma el JSON que emite la
CLI y reemplaza únicamente los bloques `firebase` y `marca`, más `empresaId` y
`appCheckSiteKey`. Todo lo demás de ese archivo —las once áreas, el catálogo
completo de módulos del ERP, los rubros, los umbrales de neumáticos, los
catálogos, los rangos de guardarraíl— es configuración de producto que costó
pensarse y no se toca. Antes
de escribir deja un `.bak`, y al terminar lista cualquier línea que siga diciendo
`REEMPLAZAR`.

Si el proyecto ya existe porque lo creaste antes o porque el comando falló a
mitad de camino, repite agregando `-Existente` (o `--existente`) y no intentará
crearlo de nuevo. Si quieres configurar sin publicar todavía, agrega
`-SinPublicar` (o `--sin-publicar`).

Cuando el script termina, salta a la sección 4. Los tres clics de consola siguen
pendientes.

---

## 2. El camino largo: la consola, paso a paso

Sirve si el comando falló, si prefieres ver lo que estás creando, o si alguien
más ya creó el proyecto y solo tienes que conectarte.

**Crear el proyecto.** Entra a `https://console.firebase.google.com`, *Agregar
proyecto*, nombre `trazza-misagi`. Google Analytics no hace falta y agrega
consentimientos que no necesitas para un piloto interno: desactívalo.

**Crear la base de datos.** Menú lateral → *Firestore Database* → *Crear base de
datos*. Elige **Modo de producción**, nunca modo de prueba. El modo de prueba
deja la base abierta a cualquiera durante treinta días, y treinta días es
exactamente el tiempo que tarda uno en olvidarse. La región es **`nam5`**
(multi-región Estados Unidos). Firebase no ofrece región en Perú; `nam5` es la
que da menor latencia hacia Sudamérica entre las multi-región disponibles y es la
que asumen los índices de este proyecto. La región **no se puede cambiar
después**.

**Registrar la app web.** *Configuración del proyecto* (el engranaje) → sección
*Tus apps* → icono `</>` → nombre `Trazza`. No marques Firebase Hosting en ese
formulario; el hosting lo configura el deploy. Al terminar te muestra un bloque
`firebaseConfig` con seis valores: `apiKey`, `authDomain`, `projectId`,
`storageBucket`, `messagingSenderId`, `appId`.

**Escribir la configuración.** Ábrelo en `public/core/trazza.config.js` y
reemplaza cada `"REEMPLAZAR"` del bloque `firebase` por su valor, más
`empresaId: "acme"` y el bloque `marca` con el nombre comercial, la razón
social y el RUC. Copia valor por valor, no el bloque entero, y revisa que no
haya quedado ninguna comilla curva.

Sobre la `apiKey`: **es pública por diseño**, va en el HTML de cualquier app web
de Firebase y no es un secreto. Quien te diga que hay que esconderla te está
vendiendo una falsa sensación de seguridad mientras las reglas siguen abiertas.
Lo que protege los datos es `firestore.rules`, no la ocultación de esa cadena. Lo
que sí es secreto es la clave de servicio de la sección 5.

**Publicar reglas, índices y sitio.** Desde la carpeta `trazza`:

```bash
npm install -g firebase-tools
firebase login
firebase use --add        # elige trazza-misagi, alias "default"
firebase deploy --only firestore:rules,firestore:indexes,storage,hosting
```

El deploy de índices tarda: los 62 índices compuestos de
`firestore.indexes.json` se construyen en segundo plano y pueden demorar varios
minutos. El sitio funciona mientras tanto; algunas consultas ordenadas fallarán
hasta que terminen, con un error que incluye un link para crear el índice
faltante. Si ya publicaste el archivo, ignora ese link y espera.

---

## 3. Qué quedó publicado

`firebase.json` define la carpeta `public/` como raíz del sitio, con URLs
limpias, caché de una hora para JS y CSS, y **`no-store` explícito para
`trazza.config.js`**: es el único archivo que cambia por empresa y no puede
quedarse pegado en el caché de un navegador después de un cambio de credenciales.
Las cabeceras `X-Content-Type-Options`, `X-Frame-Options`,
`Referrer-Policy` y `Permissions-Policy` van en todas las respuestas.

`firestore.rules` separa las empresas por el campo `empresaId` y los permisos por
el arreglo `areas` del perfil del usuario. La regla que importa entender es la de
`usuarios`: un documento de usuario solo lo puede crear un admin de la misma
empresa. Eso es lo que impide que alguien se auto-asigne permisos, y es también
lo que hace necesaria la sección 5.

`storage.rules` obliga a que todo archivo viva en la ruta
`/{empresaId}/{modulo}/{año}/{nombre}`, acepta solo imágenes y PDF de hasta 15 MB,
y deja el borrado a los administradores. Cualquier ruta fuera de ese patrón está
cerrada.

---

## 4. Los tres clics que ningún comando puede dar

La CLI de Firebase no expone estas tres operaciones. Hay que hacerlas en el
navegador, una sola vez por proyecto. Reemplaza `trazza-misagi` por tu id.

**Activar el ingreso con correo y contraseña.**
`https://console.firebase.google.com/project/trazza-misagi/authentication/providers`
→ *Comenzar* → *Correo electrónico/contraseña* → activar el primer interruptor.
El segundo, el de link mágico sin contraseña, déjalo apagado. Sin este paso el
login devuelve `auth/operation-not-allowed` y parece un error del sistema cuando
en realidad es un interruptor apagado.

**Crear el bucket de Storage.**
`https://console.firebase.google.com/project/trazza-misagi/storage` → *Comenzar*
→ acepta la región que propone. Si publicaste antes de este paso, el deploy de
`storage` habrá fallado con un mensaje sobre el bucket; repite el deploy después.

**Sacar la clave de App Check.**
`https://console.firebase.google.com/project/trazza-misagi/appcheck` → registra
la app web con **reCAPTCHA v3** → copia la *clave del sitio* y pégala en
`appCheckSiteKey` dentro de `trazza.config.js`. Vuelve a publicar el hosting.

App Check es opcional y el sistema arranca sin él: `trazza-init.js` deja la nota
`App Check DESACTIVADO en este tenant` en la consola del navegador y sigue.
Actívalo antes del primer cliente que paga. Lo que hace es asegurar que las
peticiones vengan de tu sitio y no de un script apuntando a tu base con la
`apiKey` que cualquiera puede leer. Mientras esté apagado, lo único entre tus
datos y un extraño son las reglas —que están bien escritas, pero una sola capa es
una sola capa.

---

## 5. El primer administrador

Aquí aparece el problema de arranque. `firestore.rules` dice que un documento en
`usuarios` solo lo crea un admin de la misma empresa, así que el primer admin no
puede crearse a sí mismo: para crearse necesitaría ya ser admin. La salida no es
aflojar la regla "solo por esta vez" —esa es la clase de excepción que se queda
para siempre— sino entrar una vez por la puerta de servicio, que se salta las
reglas por diseño, y volver a cerrarla.

Descarga la llave: *Configuración del proyecto* → *Cuentas de servicio* →
*Generar nueva clave privada*. Guarda el `.json` como `clave-servicio.json` en la
raíz de `trazza`. Después:

```bash
npm install firebase-admin
node herramientas/crear-admin.js --clave "UnaClaveLargaDeVerdad" --nombre "Mateo Bartra"
```

No hace falta escribir el correo ni la empresa. El script los lee de
`public/core/trazza.config.js`, que ya trae `correoAdmin: "mateobartra@gmail.com"`
y `empresaId: "acme"`. Esa es la cuenta principal del sistema: la primera que
existe y desde la que se dan de alta todas las demás. Lo único que se teclea es
la clave, porque una clave no se escribe en un archivo que se versiona.

El script crea el usuario en Authentication, escribe su documento en `usuarios`
con `areas: ["admin"]` y `empresaId: "acme"`, y deja registrado en `config` el
nacimiento del inquilino. Rechaza claves de menos de doce caracteres y rechaza
claves que sean solo números. Eso segundo no es paranoia de manual: un número de
documento no es un secreto —está impreso en el fotocheck que la persona lleva
colgado al cuello—, así que una clave derivada de él no protege nada. Ninguna
cuenta de este producto nace así, y menos la que lo ve todo.

**Cuando termines, borra `clave-servicio.json`.** Ese archivo se salta todas las
reglas de seguridad: quien lo tenga es dueño de la base entera, sin login y sin
rastro. No se versiona —ya está en `.gitignore`—, no se manda por WhatsApp, no se
sube a Drive, no se deja en Descargas. Se borra. Si hace falta otra vez, se
genera otra en treinta segundos.

---

## 6. El ambiente de demostración

```bash
node herramientas/sembrar-demo.js --empresa demo
```

Nunca demuestres sobre datos reales de un cliente. Una demo se enseña en una sala con
gente de otras empresas, se graba, se comparte por correo y termina en un chat de
WhatsApp que no controlas; ahí van sueldos, DNI y direcciones de gente que no dio
permiso para eso. Por eso el `empresaId` por defecto de este script es
literalmente `demo`, con placas y DNI inventados.

Los datos no son relleno. Cada registro está puesto para que un motor se vea
funcionando: hay un viaje **abierto** sin fecha de llegada que sigue atrayendo
gastos, dos viajes **vacíos** cuyo costo antes nadie podía medir, un viaje en
**dólares** que obliga al sistema a usar el tipo de cambio del mes del hecho y no
el de hoy, un consumo de combustible con un **rendimiento imposible** que dispara
la alerta sin bloquear el guardado, un **gasto huérfano** sobre una unidad dada de
baja, y una ruta cuya **tarifa se renegoció el 15 de junio**, de modo que un viaje
del 10 de junio tiene que liquidarse todavía a la tarifa vieja. Ese último es el
que conviene enseñar despacio, porque es el que la competencia hace mal.

Para limpiar: `node herramientas/sembrar-demo.js --empresa demo --borrar`. El
script se niega a borrar si el `empresaId` no contiene la palabra `demo`, para
que un dedo cansado no vacíe la empresa de verdad.

---

## 7. Presupuesto, y qué no tocar

Pon la alerta de gasto antes de que haga falta:
`https://console.cloud.google.com/billing` → *Budgets & alerts* → un presupuesto
de veinte dólares con avisos al 50, 90 y 100 por ciento. En plan Spark no vas a
pagar nada, pero el día que actives Blaze para subir archivos o correr funciones,
la alerta ya está puesta. Los costos que se disparan en Firebase casi nunca son
de almacenamiento: son de **lecturas** en un bucle mal escrito.

Lo que no se toca: los archivos de `public/core/` son el núcleo compartido y son
idénticos para todas las empresas. Si algún día editas uno "solo para este
cliente", acabas de crear una bifurcación que vas a mantener a mano para siempre.
Lo único que cambia entre empresas es `trazza.config.js`, y por eso `.gitignore`
excluye `clientes/*/trazza.config.js`: cada inquilino guarda el suyo aparte y
ninguno viaja en el repositorio.

Tampoco edites `firestore.indexes.json` a mano para "arreglar" una consulta que
falla. Si una pantalla pide un índice que no existe, Firebase devuelve el error
con un link que lo crea; úsalo, y después exporta con
`firebase firestore:indexes > firestore.indexes.json` para que el archivo y la
nube no se separen.

---

## 8. Cuando algo falla

`auth/operation-not-allowed` al entrar significa que el proveedor de correo y
contraseña sigue apagado; es el primer clic de la sección 4.

`Missing or insufficient permissions` significa que las reglas están haciendo su
trabajo: el usuario que entró no tiene el área que la pantalla pide, o su
`empresaId` no coincide con el del documento. Revisa el documento del usuario en
Firestore antes de sospechar de las reglas.

`The query requires an index` es normal en los primeros minutos después del
deploy. Espera a que terminen de construirse.

Un cartel a pantalla completa al abrir el sitio, en basalto y cobre, con una
lista de campos, es `trazza-init.js` avisando que `trazza.config.js` todavía
tiene valores en `REEMPLAZAR`. No es una falla: es el sistema negándose a
arrancar a medias.

Si el deploy de `storage` falla y el de todo lo demás pasa, es el bucket que no
existe todavía. Segundo clic de la sección 4, y repite el deploy.

---

## 9. La lista corta

Crear el proyecto y la base en `nam5`, modo producción. Registrar la app web y
escribir sus credenciales en `trazza.config.js` junto con el `empresaId`. Activar
correo y contraseña. Crear el bucket de Storage. Publicar reglas, índices y
sitio. Crear el primer administrador con la clave de servicio y **borrar la
clave**. Sembrar la demo. Poner la alerta de presupuesto. Activar App Check antes
del primer cliente que paga.
