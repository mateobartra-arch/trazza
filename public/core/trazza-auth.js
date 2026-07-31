/* ==========================================================================
   TRAZZA — Autenticación y autorización COMPARTIDA (multi-tenant)
   --------------------------------------------------------------------------
   Port de assets/auth.js (MISAGI) al núcleo reutilizable TRAZZA. Una sola
   fuente de verdad para login y permisos, ahora parametrizada por tenant
   a través de window.TRAZZA_CONFIG (ver trazza.config.js).

   Modelo de permisos (igual que el original, con empresaId agregado):
   - Firebase Auth (correo + contraseña) identifica a la persona.
   - Firestore  usuarios/{uid}  guarda: { nombre, tipo, areas[], activo,
     empresaId }. El campo empresaId DEBE coincidir con el tenant activo;
     si no coincide, se trata como si el usuario no tuviera perfil (evita
     que una cuenta de un tenant vea datos de otro si comparten proyecto).
   - El "tipo" (conductor / administrativo) que la persona elige en el login
     es solo informativo para la UI; el ACCESO REAL lo determina el documento
     en la base. Así un conductor no obtiene permisos de admin por elegir otra
     opción. La seguridad de los datos la refuerzan firestore.rules.

   Requiere que trazza.config.js se haya cargado ANTES que este script
   (window.TRAZZA_CONFIG debe existir).
   ========================================================================== */
(function (global) {
  // Config del tenant activo (obligatoria). Si falta, no hay áreas ni empresaId.
  var CFG = global.TRAZZA_CONFIG || {};

  // Catálogo de áreas: YA NO se hardcodea aquí, se lee de TRAZZA_CONFIG.
  var AREAS = CFG.areas || {};

  // Id del tenant activo, leído de la config (antes no existía este concepto).
  var EMPRESA_ID = CFG.empresaId || "";

  // Calcula la ruta a la raíz del sitio a partir de dónde está este script
  // (core/trazza-auth.js -> raíz = un nivel arriba de la carpeta de este script).
  function deriveRoot() {
    var s = document.currentScript;
    if (!s) {
      var scripts = document.scripts;
      for (var i = 0; i < scripts.length; i++) {
        if (/trazza-auth\.js/.test(scripts[i].src)) { s = scripts[i]; break; }
      }
    }
    if (!s) return "/";
    var url = new URL(s.src, location.href);
    return url.href.replace(/(core\/)?trazza-auth\.js.*$/, "");
  }
  var ROOT = deriveRoot();

  function auth() { return firebase.auth(); }
  function db() { return firebase.firestore(); }

  // Devuelve el empresaId del tenant activo (config local, no depende de sesión).
  function empresaActual() { return EMPRESA_ID; }

  // Comprueba que un documento Firestore pertenezca a la empresa activa.
  // Uso típico: filtrar en memoria resultados ya traídos, o validar antes
  // de mostrar/editar un doc suelto (defensa en profundidad; la regla real
  // vive en firestore.rules).
  function mismaEmpresa(doc) {
    return !!doc && doc.empresaId === EMPRESA_ID;
  }

  // Trae el documento de usuario (perfil + permisos).
  // OPTIMIZACIÓN: cachea el perfil en sessionStorage durante 5 min para que
  // navegar entre módulos y el portal sea instantáneo (no reconsulta la base
  // cada vez). Revalida en segundo plano; los cambios de permisos se aplican
  // como máximo en 5 min o al reiniciar sesión.
  // La clave de cache se prefija con empresaId para que, si el mismo
  // navegador visita dos tenants distintos (multi-tenant), no se mezcle
  // el perfil cacheado de una empresa con el de otra.
  var PERFIL_TTL = 5 * 60 * 1000;
  function _cacheKey(uid) { return "trazza_perfil_" + EMPRESA_ID + "_" + uid; }

  function fetchPerfil(uid) {
    return new Promise(function (resolve) {
      try {
        var raw = sessionStorage.getItem(_cacheKey(uid));
        if (raw) {
          var c = JSON.parse(raw);
          if (c && c.uid === uid && (Date.now() - c.t) < PERFIL_TTL) {
            // Revalida en segundo plano sin bloquear la navegación.
            db().collection("usuarios").doc(uid).get()
              .then(function (s) {
                try { sessionStorage.setItem(_cacheKey(uid), JSON.stringify({ uid: uid, t: Date.now(), d: s.exists ? s.data() : null })); } catch (e) {}
              })
              .catch(function () {});
            resolve(_soloSiMismaEmpresa(c.d));
            return;
          }
        }
      } catch (e) {}
      db().collection("usuarios").doc(uid).get().then(function (snap) {
        var d = snap.exists ? snap.data() : null;
        try { sessionStorage.setItem(_cacheKey(uid), JSON.stringify({ uid: uid, t: Date.now(), d: d })); } catch (e) {}
        resolve(_soloSiMismaEmpresa(d));
      });
    });
  }

  // Blindaje adicional en cliente: si el documento trae un empresaId de
  // OTRO tenant, se trata como "sin perfil". La barrera fuerte real está
  // en firestore.rules; esto solo evita mostrar datos cruzados en UI.
  function _soloSiMismaEmpresa(perfil) {
    if (!perfil) return perfil;
    if (perfil.empresaId && EMPRESA_ID && perfil.empresaId !== EMPRESA_ID) return null;
    return perfil;
  }

  function limpiarCachePerfil() {
    try {
      Object.keys(sessionStorage).forEach(function (k) {
        if (/^trazza_perfil_/.test(k)) sessionStorage.removeItem(k);
      });
    } catch (e) {}
  }

  // Fuerza el cambio de contraseña en el primer ingreso (flag debeCambiarClave).
  //
  // ACTIVADO POR DEFECTO, y esto es deliberado. En MISAGI la contraseña
  // inicial era el DNI del trabajador, el flag debeCambiarClave se creaba en
  // false y además esta constante estaba en false: dos capas apagadas, así
  // que cualquiera que supiera el DNI de un empleado activo entraba con sus
  // permisos. Un DNI no es un secreto; está en el fotocheck.
  // Se puede apagar por tenant con TRAZZA_CONFIG.forzarCambioClave === false,
  // pero apagarlo tiene que ser una decisión escrita de alguien, no el valor
  // que quedó por descuido.
  var FORZAR_CAMBIO = (global.TRAZZA_CONFIG && global.TRAZZA_CONFIG.forzarCambioClave === false) ? false : true;
  function debeCambiar(perfil) { return FORZAR_CAMBIO && !!(perfil && perfil.debeCambiarClave === true); }
  function irACambioClave() { if (!/\/clave\//.test(location.pathname)) location.href = ROOT + "clave/index.html"; }

  function esAdmin(perfil) {
    return !!(perfil && Array.isArray(perfil.areas) && perfil.areas.indexOf("admin") >= 0);
  }
  function puedeVer(perfil, area) {
    if (!perfil || perfil.activo === false) return false;
    if (esAdmin(perfil)) return true;
    return Array.isArray(perfil.areas) && perfil.areas.indexOf(area) >= 0;
  }

  // Inicia sesión. `tipo` es informativo (conductor/administrativo).
  function login(email, password) {
    return auth().signInWithEmailAndPassword(email.trim(), password).then(function (cred) {
      return fetchPerfil(cred.user.uid).then(function (perfil) {
        if (!perfil || perfil.activo === false) {
          return auth().signOut().then(function () {
            throw new Error("Tu usuario no está activo o no pertenece a esta empresa. Contacta al administrador.");
          });
        }
        return { user: cred.user, perfil: perfil };
      });
    });
  }

  function logout() {
    limpiarCachePerfil();
    return auth().signOut().then(function () { location.href = ROOT + "index.html"; });
  }

  // Para páginas de módulo: exige sesión y permiso sobre un área.
  // Si no cumple, redirige al portal. Devuelve { user, perfil } si cumple.
  function requireAccess(area) {
    return new Promise(function (resolve) {
      auth().onAuthStateChanged(function (user) {
        if (!user) { location.href = ROOT + "index.html"; return; }
        fetchPerfil(user.uid).then(function (perfil) {
          if (debeCambiar(perfil)) { irACambioClave(); return; }
          if (!puedeVer(perfil, area)) {
            alert("No tienes acceso a este módulo.");
            location.href = ROOT + "index.html";
            return;
          }
          resolve({ user: user, perfil: perfil });
        });
      });
    });
  }

  // Para páginas de autoservicio (Mi espacio): exige solo sesión iniciada,
  // sin requerir un área concreta. Devuelve { user, perfil }.
  function requireLogin() {
    return new Promise(function (resolve) {
      auth().onAuthStateChanged(function (user) {
        if (!user) { location.href = ROOT + "index.html"; return; }
        fetchPerfil(user.uid).then(function (perfil) {
          if (!perfil || perfil.activo === false) {
            auth().signOut().then(function () { location.href = ROOT + "index.html"; });
            return;
          }
          if (debeCambiar(perfil)) { irACambioClave(); return; }
          resolve({ user: user, perfil: perfil });
        });
      });
    });
  }

  // Observa el estado de sesión (para el portal)
  function onUser(cb) {
    auth().onAuthStateChanged(function (user) {
      if (!user) { cb(null); return; }
      fetchPerfil(user.uid).then(function (perfil) { cb({ user: user, perfil: perfil }); });
    });
  }

  // MERGE, no asignación. Este archivo fue el primero del núcleo y por eso
  // creaba el objeto TRAZZA entero; con ocho archivos colgando del mismo
  // espacio de nombres, asignarlo aquí borraba lo que hubieran registrado
  // trazza-init, trazza-normaliza, trazza-params y trazza-db, que en el
  // orden de carga documentado se cargan ANTES. El síntoma era una pantalla
  // que arrancaba y moría con "TRAZZA.db is undefined" según el orden de los
  // <script>, es decir, según el archivo HTML: la peor clase de falla.
  var API = {
    AREAS: AREAS,
    ROOT: ROOT,
    empresaActual: empresaActual,
    mismaEmpresa: mismaEmpresa,
    login: login,
    logout: logout,
    requireAccess: requireAccess,
    requireLogin: requireLogin,
    onUser: onUser,
    puedeVer: puedeVer,
    esAdmin: esAdmin,
    fetchPerfil: fetchPerfil,
    limpiarCachePerfil: limpiarCachePerfil,
    debeCambiar: debeCambiar,
    irACambioClave: irACambioClave
  };
  global.TRAZZA = global.TRAZZA || {};
  for (var _k in API) if (API.hasOwnProperty(_k)) global.TRAZZA[_k] = API[_k];
})(window);
