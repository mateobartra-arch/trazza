#!/usr/bin/env node
/* ==========================================================================
   TRAZZA — Crea el PRIMER administrador de una empresa
   --------------------------------------------------------------------------
   POR QUÉ HACE FALTA UN SCRIPT CON CLAVE DE SERVICIO

   firestore.rules dice, textualmente, que un documento en `usuarios` solo lo
   puede crear un admin de la misma empresa:

       allow create: if esAdmin() && request.resource.data.empresaId == miEmpresa();

   Eso es correcto y es lo que impide que cualquiera se auto-asigne permisos.
   Pero deja un problema de arranque: el primer admin no puede crearse a sí
   mismo, porque para crearse necesitaría ya ser admin. La salida NO es
   aflojar la regla "solo por esta vez" —esa es la clase de excepción que se
   queda para siempre— sino entrar una vez por la puerta de servicio, que se
   salta las reglas por diseño, y volver a cerrarla.

   Este script hace exactamente eso y nada más: crea el usuario en Firebase
   Auth y su documento en `usuarios` con areas:["admin"]. Después se borra la
   clave de servicio y no se vuelve a usar hasta el próximo cliente.

   LA CLAVE DE SERVICIO
   Consola → Configuración del proyecto → Cuentas de servicio → Generar nueva
   clave privada. Se descarga un .json. Guárdalo como `clave-servicio.json`
   en la raíz del proyecto. Ese archivo da acceso TOTAL saltándose todas las
   reglas: no se versiona, no se manda por WhatsApp, no se sube a Drive. Ya
   está en .gitignore. Cuando termines, bórralo.

   USO
     node herramientas/crear-admin.js \
       --correo mateo@ejemplo.com \
       --clave 'una-clave-larga-de-verdad' \
       --nombre 'Mateo Bartra' \
       --empresa misagi \
       [--areas admin,operaciones,contabilidad] \
       [--servicio clave-servicio.json]
   ========================================================================== */
"use strict";

var fs = require("fs");
var path = require("path");

function arg(n, d) { var i = process.argv.indexOf("--" + n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; }
function morir(m) { console.error("\n  ✕ " + m + "\n"); process.exit(1); }

var correo  = arg("correo");
var clave   = arg("clave");
var nombre  = arg("nombre", "Administrador");
var empresa = arg("empresa");
var areas   = arg("areas", "admin").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
var rutaSvc = arg("servicio", "clave-servicio.json");

if (!correo)  morir("Falta --correo");
if (!clave)   morir("Falta --clave");
if (!empresa) morir("Falta --empresa (el mismo empresaId que quedó en trazza.config.js)");

// La contraseña inicial en MISAGI era el DNI del trabajador. Un DNI no es un
// secreto: está impreso en el fotocheck que la persona lleva colgado. Este
// producto no vuelve a nacer con esa deuda, y menos en la cuenta que tiene
// permiso sobre todo.
if (clave.length < 12) morir("La clave debe tener al menos 12 caracteres. Esta es la cuenta que lo ve todo.");
if (/^\d+$/.test(clave)) morir("La clave no puede ser solo números (y mucho menos un DNI).");
if (areas.indexOf("admin") < 0) areas.unshift("admin");

if (!fs.existsSync(rutaSvc)) {
  morir("No encuentro " + rutaSvc + ".\n" +
        "      Consola → Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada.\n" +
        "      Guarda el .json como " + rutaSvc + " en la raíz del proyecto.");
}

var admin;
try { admin = require("firebase-admin"); }
catch (e) { morir("Falta la librería firebase-admin. Corre:  npm install firebase-admin"); }

var svc = JSON.parse(fs.readFileSync(rutaSvc, "utf8"));
admin.initializeApp({ credential: admin.credential.cert(svc), projectId: svc.project_id });

var auth = admin.auth();
var db = admin.firestore();

console.log("\n  Proyecto : " + svc.project_id);
console.log("  Empresa  : " + empresa);
console.log("  Correo   : " + correo);
console.log("  Áreas    : " + areas.join(", ") + "\n");

auth.getUserByEmail(correo)
  .then(function (u) {
    console.log("  · El usuario ya existía en Auth (uid " + u.uid + "). Se actualiza su contraseña.");
    return auth.updateUser(u.uid, { password: clave, displayName: nombre }).then(function () { return u.uid; });
  })
  .catch(function (e) {
    if (e && e.code === "auth/user-not-found") {
      return auth.createUser({ email: correo, password: clave, displayName: nombre, emailVerified: true })
        .then(function (u) { console.log("  · Usuario creado en Auth (uid " + u.uid + ")"); return u.uid; });
    }
    throw e;
  })
  .then(function (uid) {
    var doc = {
      nombre: nombre,
      correo: correo,
      tipo: "administrativo",
      areas: areas,
      activo: true,
      empresaId: empresa,
      // false a propósito: esta clave la eligió una persona, no la generó el
      // sistema a partir de un dato público. El flag existe para las cuentas
      // que se crean en masa desde el maestro de personal.
      debeCambiarClave: false,
      _ts: admin.firestore.FieldValue.serverTimestamp(),
      _por: "crear-admin.js"
    };
    return db.collection("usuarios").doc(uid).set(doc, { merge: true }).then(function () { return uid; });
  })
  .then(function (uid) {
    // Se marca la empresa como existente. No es obligatorio para las reglas,
    // pero deja rastro de cuándo nació el tenant y quién lo abrió.
    return db.collection("config").doc(empresa + "__tenant").set({
      empresaId: empresa,
      clave: "tenant",
      tipo: "escalar",
      valor: { creado: new Date().toISOString(), por: correo },
      area: "admin",
      _por: "crear-admin.js"
    }, { merge: true }).then(function () { return uid; });
  })
  .then(function (uid) {
    console.log("\n  ✓ Listo. Entra en el sitio con " + correo);
    console.log("    usuarios/" + uid + " → areas: [" + areas.join(", ") + "], empresaId: " + empresa);
    console.log("\n  AHORA BORRA " + path.basename(rutaSvc) + ". Ya no hace falta hasta el próximo cliente.\n");
    process.exit(0);
  })
  .catch(function (e) {
    morir("Falló: " + (e && e.message ? e.message : e));
  });
