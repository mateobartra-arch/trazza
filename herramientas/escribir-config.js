#!/usr/bin/env node
/* ==========================================================================
   TRAZZA — Escribe public/core/trazza.config.js con las credenciales reales
   --------------------------------------------------------------------------
   POR QUÉ ES UN SCRIPT Y NO UN "copia y pega"

   El paso donde más se rompe un enlace con Firebase es este: alguien copia
   el bloque de configuración de la consola, lo pega con una coma de menos o
   con las comillas curvas que puso el navegador, y la pantalla queda en
   blanco sin decir por qué. Aquí el bloque lo escribe una máquina a partir
   del JSON que devuelve la propia CLI de Firebase, así que no hay copia
   manual y no hay comilla curva posible.

   Además NO reescribe el archivo entero: reemplaza únicamente el bloque
   `firebase: { ... }`, el `empresaId` y la marca. Todo lo demás —áreas,
   módulos, rubros, umbrales de mantenimiento, catálogos, rangos— es
   configuración de producto que costó pensarse y no se toca.

   USO
     node herramientas/escribir-config.js \
        --sdk sdkconfig.json \
        --empresa acme \
        --nombre "Trazza" \
        --razon "ACME TRANSPORTES S.A.C." \
        --ruc 20xxxxxxxxx \
        [--destino public/core/trazza.config.js]

   El JSON de --sdk es exactamente lo que imprime:
     firebase apps:sdkconfig WEB <appId> --json
   (se acepta tanto el objeto plano como el envoltorio { result: { sdkConfig } })
   ========================================================================== */
"use strict";

var fs = require("fs");
var path = require("path");

function arg(nombre, porDefecto) {
  var i = process.argv.indexOf("--" + nombre);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : porDefecto;
}
function morir(msg) {
  console.error("\n  ✕ " + msg + "\n");
  process.exit(1);
}

var rutaSdk = arg("sdk", null);
if (!rutaSdk) morir("Falta --sdk <archivo.json> (salida de: firebase apps:sdkconfig WEB <appId> --json)");
if (!fs.existsSync(rutaSdk)) morir("No existe el archivo " + rutaSdk);

var crudo;
try { crudo = JSON.parse(fs.readFileSync(rutaSdk, "utf8")); }
catch (e) { morir("El archivo " + rutaSdk + " no es JSON válido: " + e.message); }

// La CLI ha cambiado de forma entre versiones. Se aceptan las tres que
// existen en el mundo real en vez de exigir una y fallar con las otras.
var cfg = crudo.sdkConfig
       || (crudo.result && crudo.result.sdkConfig)
       || (crudo.result && crudo.result)
       || crudo;

var CLAVES = ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"];
var faltan = CLAVES.filter(function (k) { return !cfg[k]; });
// storageBucket y messagingSenderId pueden faltar si el proyecto aún no tiene
// Storage activado; las cuatro que sí son obligatorias las valida trazza-init.js.
var duras = faltan.filter(function (k) {
  return ["apiKey", "authDomain", "projectId", "appId"].indexOf(k) >= 0;
});
if (duras.length) morir("El JSON no trae: " + duras.join(", ") + ". ¿Seguro que es la salida de apps:sdkconfig WEB?");

var empresaId = arg("empresa", null);
if (!empresaId) morir("Falta --empresa <id-corto-en-minusculas>. Es el campo empresaId que se graba en CADA documento.");
if (!/^[a-z0-9][a-z0-9_-]{1,30}$/.test(empresaId)) {
  morir("El empresaId '" + empresaId + "' no sirve: usa minúsculas, números y guiones, entre 2 y 31 caracteres. " +
        "Va dentro del id de cada documento de config y en todas las reglas; cambiarlo después es una migración.");
}

var nombre = arg("nombre", "Trazza");
var razon  = arg("razon", nombre);
var ruc    = arg("ruc", "");
var siteKey = arg("appcheck", "");

var destino = arg("destino", path.join("public", "core", "trazza.config.js"));
if (!fs.existsSync(destino)) morir("No existe " + destino + ". Ejecuta este script desde la raíz del proyecto Trazza.");

var texto = fs.readFileSync(destino, "utf8");
var antes = texto;

function bloque(nombreBloque, cuerpo) {
  // Reemplaza `  <nombreBloque>: {` … hasta la primera línea `  },` o `  }` a
  // ese mismo nivel de indentación. Anclarse a la indentación es lo que hace
  // que un objeto anidado dentro no rompa el reemplazo.
  var re = new RegExp("(\\n  " + nombreBloque + ": \\{)[\\s\\S]*?(\\n  \\},)");
  if (!re.test(texto)) morir("No encontré el bloque `" + nombreBloque + "` en " + destino + ". ¿Se editó a mano?");
  texto = texto.replace(re, "$1\n" + cuerpo + "$2");
}

bloque("firebase", CLAVES.map(function (k) {
  var v = cfg[k] || "";
  return '    ' + k + ': ' + JSON.stringify(v) + ',';
}).join("\n").replace(/,$/, ""));

bloque("marca", [
  '    nombre: ' + JSON.stringify(nombre) + ',',
  '    razonSocial: ' + JSON.stringify(razon) + ',',
  '    ruc: ' + JSON.stringify(ruc) + ',',
  '    color: "#12161C",',
  '    logoUrl: ""'
].join("\n"));

// empresaId y App Check son escalares sueltos, no bloques.
var reEmpresa = /\n  empresaId: "[^"]*",/;
if (!reEmpresa.test(texto)) morir("No encontré la línea `empresaId` en " + destino + ".");
texto = texto.replace(reEmpresa, '\n  empresaId: ' + JSON.stringify(empresaId) + ',');

var reCheck = /\n  appCheckSiteKey: "[^"]*",/;
if (reCheck.test(texto)) texto = texto.replace(reCheck, '\n  appCheckSiteKey: ' + JSON.stringify(siteKey) + ',');

if (texto === antes) morir("No cambió nada. Revisa el archivo antes de desplegar.");
if (/REEMPLAZAR/.test(texto)) {
  console.error("\n  ⚠  Todavía quedan valores 'REEMPLAZAR' en " + destino + ":");
  texto.split("\n").forEach(function (l, i) {
    if (/REEMPLAZAR/.test(l)) console.error("     línea " + (i + 1) + ": " + l.trim());
  });
  console.error("     trazza-init.js detendrá el arranque y mostrará un cartel hasta que se llenen.\n");
}

// Copia de seguridad antes de escribir: este archivo es el único que
// distingue a un cliente de otro, y sobrescribirlo sin respaldo es la clase
// de error que se descubre el día del despliegue.
try { fs.writeFileSync(destino + ".bak", antes, "utf8"); } catch (e) {}
fs.writeFileSync(destino, texto, "utf8");

console.log("");
console.log("  ✓ " + destino + " escrito");
console.log("      empresaId   " + empresaId);
console.log("      projectId   " + cfg.projectId);
console.log("      authDomain  " + cfg.authDomain);
console.log("      appId       " + String(cfg.appId).slice(0, 28) + "…");
console.log("      App Check   " + (siteKey ? "activado" : "DESACTIVADO (appCheckSiteKey vacío)"));
console.log("      respaldo    " + destino + ".bak");
console.log("");
