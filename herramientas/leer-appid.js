#!/usr/bin/env node
/* Lee la salida JSON de `firebase apps:list WEB --json` y devuelve el appId
   de la primera app web. Existe para que el script de enlace no tenga que
   parsear texto con expresiones regulares en dos lenguajes distintos
   (PowerShell y bash), que es donde se cuelan los errores. */
"use strict";
var fs = require("fs");
var ruta = process.argv[2];
if (!ruta || !fs.existsSync(ruta)) { console.error("Falta el archivo JSON de apps:list"); process.exit(1); }
var d;
try { d = JSON.parse(fs.readFileSync(ruta, "utf8")); } catch (e) { console.error("JSON inválido: " + e.message); process.exit(1); }
var lista = d.result || d.apps || d || [];
if (!Array.isArray(lista)) lista = [];
var web = lista.filter(function (a) { return !a.platform || a.platform === "WEB"; });
if (!web.length) { console.error("Este proyecto todavía no tiene ninguna app WEB registrada."); process.exit(2); }
process.stdout.write(String(web[0].appId || web[0].appid || ""));
