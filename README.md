# Trazza

Sistema de operación de flota para empresas de transporte de carga. Un solo
núcleo de código, muchas empresas: lo único que cambia entre una y otra es
`public/core/trazza.config.js`.

Para ponerlo en marcha, lee **`ENLAZAR-FIREBASE.md`**. Es la única guía que
necesitas y va desde una carpeta de archivos hasta un sitio publicado con
administrador y datos de demostración.

## Qué hay en cada carpeta

`public/` es el sitio. Todo lo que está aquí se publica tal cual. Dentro,
`core/` son los diez archivos del núcleo —los motores de cálculo compartidos— y
`trazza.config.js`, que es el único archivo distinto por empresa: marca,
credenciales de Firebase, `empresaId`, áreas, módulos contratados, umbrales y
catálogos. Las carpetas por módulo (`operaciones/viajes/`, y las que sigan)
contienen las pantallas.

`herramientas/` son los scripts que se corren una vez por empresa: `enlazar.ps1`
y `enlazar.sh` hacen el enlace completo con Firebase, `escribir-config.js`
escribe las credenciales sin que nadie las teclee, `crear-admin.js` crea el
primer administrador y `sembrar-demo.js` levanta el ambiente de demostración con
datos ficticios.

`pruebas/pruebas-nucleo.js` corre con `npm run pruebas` y no necesita red ni
sesión ni pantalla. Son 135 casos sobre los cálculos que terminan en una
factura: normalización de placas, orden por la fecha del hecho, parámetros por
periodo, vigencias con fecha exacta, atribución de gastos con solape, costo
imputable contra global, y la auditoría de consistencia. Si algo de eso se
rompe, se rompe aquí antes que en el cliente.

`docs/` explica el núcleo por dentro y el frontend por fuera.

En la raíz viven los archivos que Firebase espera encontrar ahí:
`firebase.json`, `firestore.rules`, `firestore.indexes.json`, `storage.rules` y
`.firebaserc`.

## Reglas que no se rompen

Los archivos de `public/core/` son idénticos para todas las empresas. Editar uno
"solo para este cliente" crea una bifurcación que después se mantiene a mano
para siempre.

`clave-servicio.json` se salta todas las reglas de seguridad. Se usa una vez
para crear el primer administrador y se borra. Ya está en `.gitignore`.

Las demostraciones se hacen sobre el ambiente `demo`, nunca sobre datos reales
de una empresa. Ahí hay sueldos, DNI y direcciones de gente que no dio permiso
para aparecer en una grabación.
