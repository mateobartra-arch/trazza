/* ==========================================================================
   TRAZZA — Arranque de Firebase para el tenant
   --------------------------------------------------------------------------
   POR QUÉ EXISTE

   En MISAGI el arranque de Firebase vivía en `assets/firebase-config.js`, y
   ese archivo mezclaba dos cosas que no deben ir juntas: las credenciales
   concretas de una empresa (`apiKey`, `projectId`, la site key de App Check)
   y la mecánica de encenderla (`initializeApp`, `activate` de App Check,
   persistencia de sesión). Mientras hubo un solo cliente eso no se notó.
   Con dos clientes, "cambiar de empresa" significaba editar código de motor,
   que es exactamente la clase de cambio que rompe al cliente que no tocaste.

   Aquí queda solo la mecánica. Las credenciales están en `trazza.config.js`,
   que es el único archivo que cambia por tenant. Este archivo se carga
   DESPUÉS de la config y ANTES de `trazza-auth.js`, y no se toca nunca.

   ORDEN DE CARGA EN CADA PÁGINA
     1. firebase-app-compat / app-check-compat / auth-compat / firestore-compat
     2. trazza.config.js        ← lo único propio del tenant
     3. trazza-init.js          ← este archivo
     4. trazza-normaliza.js, trazza-params.js, trazza-db.js, trazza-auth.js…
     5. la pantalla

   SOBRE LA apiKey: no es un secreto. La clave web de Firebase es pública por
   diseño, viaja en cualquier página que use el SDK y no autoriza nada por sí
   sola. Lo que autoriza son las Firestore Security Rules y App Check. Decirlo
   aquí importa porque la reacción natural al ver una clave en un archivo
   estático es esconderla, y esconderla da una falsa sensación de seguridad
   mientras las reglas siguen abiertas, que es el riesgo real.

   FALLA RUIDOSA A PROPÓSITO: si la config trae "REEMPLAZAR" o falta un
   campo, este archivo lo dice en pantalla y detiene el arranque. La
   alternativa —arrancar con una config a medias— produce una pantalla que
   carga, se ve bien y no trae ningún dato, y esa es la falla más cara de
   diagnosticar que existe, porque no parece una falla.
   ========================================================================== */
(function (global) {
  var CLAVES = ["apiKey", "authDomain", "projectId", "appId"];

  function cfg() { return global.TRAZZA_CONFIG || null; }

  function faltantes() {
    var c = cfg();
    var malos = [];
    if (!c) return ["trazza.config.js no está cargado"];
    if (!c.empresaId || c.empresaId === "REEMPLAZAR") malos.push("empresaId");
    // correoAdmin no es un permiso, pero sí es la cuenta con la que alguien
    // entra por primera vez. Si está mal escrito, el admin se crea y nadie
    // puede usarlo, y eso se descubre tarde.
    if (!c.correoAdmin || c.correoAdmin === "REEMPLAZAR" || c.correoAdmin.indexOf("@") < 0) malos.push("correoAdmin");
    var f = c.firebase || {};
    CLAVES.forEach(function (k) {
      if (!f[k] || f[k] === "REEMPLAZAR") malos.push("firebase." + k);
    });
    return malos;
  }

  // Un cartel, no un console.error. Un error en consola lo ve el que lo
  // escribió; el que abre la pantalla en la oficina del cliente no abre la
  // consola nunca.
  function cartel(lista) {
    var d = global.document;
    if (!d) return;
    var caja = d.createElement("div");
    caja.setAttribute("role", "alert");
    caja.style.cssText = "position:fixed;inset:0;z-index:9999;background:#12161C;color:#EBEFF3;" +
      "font:15px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif;padding:40px 24px;overflow:auto";
    caja.innerHTML =
      '<div style="max-width:640px;margin:8vh auto">' +
      '<div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#C0703A;margin-bottom:14px">Trazza · configuración incompleta</div>' +
      '<h1 style="font-size:28px;margin:0 0 14px;letter-spacing:-.02em">Esta instalación todavía no tiene empresa.</h1>' +
      '<p style="margin:0 0 16px;color:#B6C0CC">El sistema se detuvo antes de cargar nada. No es un error de red ni de permisos: ' +
      'falta reemplazar valores en <code style="color:#8FD8CB">trazza.config.js</code>, que es el único archivo propio de cada empresa.</p>' +
      '<ul style="margin:0 0 18px;padding-left:20px;color:#EBEFF3">' +
      lista.map(function (x) { return '<li style="margin:4px 0"><code style="color:#8FD8CB">' + x + '</code></li>'; }).join("") +
      '</ul>' +
      '<p style="margin:0;color:#8B95A1;font-size:13.5px">Se prefiere detener el arranque a mostrar una pantalla vacía: ' +
      'una pantalla que carga bien y no trae datos parece un problema de la base y no lo es.</p>' +
      '</div>';
    if (d.body) d.body.appendChild(caja);
    else d.addEventListener("DOMContentLoaded", function () { d.body.appendChild(caja); });
  }

  function arrancar() {
    if (global.TRAZZA_LISTO) return true;
    var malos = faltantes();
    if (malos.length) { cartel(malos); global.TRAZZA_INIT_ERROR = malos; return false; }

    var c = cfg();
    if (!global.firebase || !global.firebase.initializeApp) {
      cartel(["el SDK de Firebase no se cargó antes que trazza-init.js"]);
      return false;
    }

    if (!global.firebase.apps || !global.firebase.apps.length) {
      global.firebase.initializeApp(c.firebase);
    }

    // App Check: opcional por tenant. Vacío = desactivado, y en ese caso hay
    // que decirlo en consola, porque "creí que estaba activado" es cómo se
    // deja un proyecto sin App Check durante un año.
    if (c.appCheckSiteKey && global.firebase.appCheck) {
      try {
        global.firebase.appCheck().activate(c.appCheckSiteKey, true);
      } catch (e) {
        if (global.console) console.warn("[Trazza] App Check no pudo activarse:", e && e.message);
      }
    } else if (global.console) {
      console.info("[Trazza] App Check DESACTIVADO en este tenant (appCheckSiteKey vacío).");
    }

    // Sesión persistente en el dispositivo: el operador de patio no quiere
    // volver a escribir su clave cada mañana. El aislamiento entre empresas
    // no depende de esto: depende de empresaId en las reglas.
    if (global.firebase.auth && global.firebase.auth.Auth) {
      try {
        global.firebase.auth().setPersistence(global.firebase.auth.Auth.Persistence.LOCAL);
      } catch (e) { /* algunos navegadores en modo privado lo rechazan; no es fatal */ }
    }

    global.TRAZZA_LISTO = true;
    return true;
  }

  global.TRAZZA = global.TRAZZA || {};
  global.TRAZZA.init = { arrancar: arrancar, faltantes: faltantes };

  // Arranca solo. Ninguna pantalla debería tener que acordarse de llamarlo:
  // olvidarlo produce, otra vez, la pantalla que carga y no trae nada.
  arrancar();
})(typeof window !== "undefined" ? window : global);
