/* ==========================================================================
   TRAZZA — Catálogo de módulos, rubros y agrupación dinámica
   --------------------------------------------------------------------------
   POR QUÉ EXISTE
   Tres puntos del changelog son en el fondo la misma pieza:

   Punto 3 — el portal dejó de tener módulos escritos a mano y pasó a un
   array de objetos {id, área, url, estado, soloAdmin, desc}. El propio
   changelog lo nombra: "Base natural para feature-flags por tenant".

   Punto 4 — los tres módulos hermanos (Combustible, GNL, Lavado) se
   navegan como uno solo con una fila de "rubro" encima, sin fusionar su
   código. Es una capa de agrupación, no una refactorización.

   Punto 1 — el roster agrupa a los conductores contando los códigos que
   cada uno tiene ese mes, no leyendo un campo "grupo". Cero configuración
   manual: si un conductor pasa a trabajar para otra operación, cambia de
   grupo solo, porque el grupo se deriva del contenido.

   Los tres comparten una idea: la estructura de la aplicación no se
   escribe, se declara o se deriva. Este archivo es donde vive esa idea.

   LO QUE ESTO RESUELVE EN UN PRODUCTO MULTI-CLIENTE
   Un cliente contrata 4 módulos y otro 9. Un cliente llama "operación" a lo
   que otro llama "cliente final". Un cliente reencaucha llantas y otro no.
   Si eso se resuelve con `if (empresa === "x")` en el código, el producto
   se muere en el tercer cliente. Aquí se resuelve con datos: el catálogo
   vive en trazza.config.js (lo estable) y los overrides por tenant en la
   colección `config` (lo que cambia sin redeploy).
   ========================================================================== */
(function (global) {

  function CFG() { return global.TRAZZA_CONFIG || {}; }

  // ---- Estados posibles de un módulo ------------------------------------
  // "activo"       se ve y se entra
  // "proximamente" se ve, con etiqueta, y no se entra (sirve para vender el
  //                roadmap dentro del propio producto sin prometer de más)
  // "oculto"       no se ve (feature flag apagado para este tenant)
  var ESTADOS = { activo: 1, proximamente: 1, oculto: 1 };

  // ---- Catálogo efectivo para el usuario actual -------------------------
  // Filtra por: estado, módulo contratado por el tenant, y permiso de área
  // del usuario. El orden importa — primero lo que el cliente compró,
  // después lo que la persona puede ver. Un módulo no contratado no se
  // muestra ni al admin: no es un permiso, es un límite de contrato.
  function modulos(opts) {
    opts = opts || {};
    var cfg = CFG();
    var lista = cfg.modulos || [];
    var out = [];
    for (var i = 0; i < lista.length; i++) {
      var m = lista[i];
      if (typeof m === "string") m = { id: m, area: m, estado: "activo", label: m, url: "" };
      if (!ESTADOS[m.estado || "activo"]) continue;
      if ((m.estado || "activo") === "oculto") continue;
      if (m.soloAdmin && !esAdmin()) continue;
      // `todos:true` es la diferencia entre requireLogin y requireAccess.
      // Hay módulos que son de la persona, no del área: sus datos, su boleta,
      // su roster, sus vacaciones. Exigirle a un conductor permiso sobre todo
      // Recursos Humanos para que vea SU boleta es la forma más rápida de que
      // nadie use el sistema y todo vuelva a pedirse por WhatsApp. Estos
      // módulos ya filtran por uid dentro de su propia página y en las reglas
      // de Firestore; el permiso de área no aporta nada y sí estorba.
      if (m.area && !m.todos && !puedeVer(m.area)) continue;
      out.push(copia(m));
    }
    if (opts.rubro) out = out.filter(function (m) { return m.rubro === opts.rubro; });
    return out;
  }

  function esAdmin() {
    return !!(global.TRAZZA && global.TRAZZA.esAdmin && global.TRAZZA.esAdmin());
  }
  function puedeVer(area) {
    if (!(global.TRAZZA && global.TRAZZA.puedeVer)) return true;   // sin auth cargada, no filtra
    return global.TRAZZA.puedeVer(area);
  }
  function copia(o) { var c = {}; for (var k in o) if (o.hasOwnProperty(k)) c[k] = o[k]; return c; }

  // ---- Rubros: la capa de navegación del punto 4 ------------------------
  // Devuelve los rubros que tienen al menos un módulo visible, en el orden
  // declarado. Un rubro con un solo módulo visible NO se pinta como fila de
  // pestañas (sería una pestaña sola, ruido puro): eso lo decide la vista
  // leyendo el largo, pero el dato viene de aquí ya resuelto.
  function rubros() {
    var vis = modulos();
    var orden = (CFG().rubros || []);
    var cuenta = {};
    vis.forEach(function (m) { if (m.rubro) cuenta[m.rubro] = (cuenta[m.rubro] || 0) + 1; });
    var out = [];
    for (var i = 0; i < orden.length; i++) {
      var r = orden[i];
      if (cuenta[r.id]) out.push({ id: r.id, label: r.label, icono: r.icono || "", n: cuenta[r.id] });
    }
    return out;
  }

  // ---- Agrupación dinámica por contenido (punto 1, generalizado) --------
  // El roster decide el grupo de un conductor contando los códigos que tiene
  // ese mes: gana el patrón que más aparece. Aquí eso queda como una función
  // genérica: dada una lista de filas, una forma de extraer los códigos de
  // cada fila, y una lista de grupos con su patrón, devuelve las filas
  // repartidas. Los patrones y las etiquetas viven en trazza.config.js
  // (rosterGrupos), nunca aquí: los destinos son del cliente, no del motor.
  //
  //   agrupar(filas, {
  //     codigos: function(fila){ return Object.values(fila.dias || {}); },
  //     grupos: [
  //       { id:"servicios",   label:"SERVICIOS",   patron:/^S/ },
  //       { id:"operaciones", label:"OPERACIONES", patron:/^O/ }
  //     ],
  //     sinGrupo: "SIN ASIGNAR"
  //   })
  //
  // Empates: gana el grupo declarado primero. Es determinista a propósito —
  // un empate que se resuelve al azar hace que la pantalla cambie sola entre
  // dos cargas y nadie confía en eso.
  function agrupar(filas, spec) {
    spec = spec || {};
    var grupos = spec.grupos || [];
    var saca = spec.codigos || function (f) { return f && f.codigos ? f.codigos : []; };
    var bolsas = {}, orden = [];
    grupos.forEach(function (g) { bolsas[g.id] = { id: g.id, label: g.label, filas: [] }; orden.push(g.id); });
    var sinId = "__sin__";
    bolsas[sinId] = { id: sinId, label: spec.sinGrupo || "SIN ASIGNAR", filas: [] };

    (filas || []).forEach(function (f) {
      var cods = saca(f) || [];
      var mejor = null, mejorN = 0;
      for (var i = 0; i < grupos.length; i++) {
        var n = 0;
        for (var j = 0; j < cods.length; j++) {
          var c = String(cods[j] || "").toUpperCase();
          if (c && grupos[i].patron.test(c)) n++;
        }
        if (n > mejorN) { mejorN = n; mejor = grupos[i].id; }   // ">" y no ">=": el primero gana el empate
      }
      bolsas[mejor || sinId].filas.push(f);
    });

    var out = [];
    orden.forEach(function (id) { if (bolsas[id].filas.length) out.push(bolsas[id]); });
    if (bolsas[sinId].filas.length) out.push(bolsas[sinId]);
    return out;
  }

  // ---- Recuento de una selección (la barra de estado tipo Excel) --------
  // El punto 1 describe una barra que muestra "nº seleccionadas, trabajados,
  // descansos, vacías y desglose por código". Eso no es UI: es un cálculo
  // sobre un conjunto de celdas, y por tanto se puede probar. La vista solo
  // pinta lo que sale de aquí.
  //
  //   resumen(["H1","H1","D","", "CV"], DICCIONARIO_CODIGOS)
  //   -> { n:5, vacias:1, porCodigo:{H1:2,D:1,CV:1}, porClase:{trabajo:3,descanso:1} }
  function resumen(celdas, dicc) {
    dicc = dicc || {};
    var r = { n: 0, vacias: 0, porCodigo: {}, porClase: {} };
    (celdas || []).forEach(function (v) {
      r.n++;
      var c = String(v == null ? "" : v).trim().toUpperCase();
      if (!c) { r.vacias++; return; }
      r.porCodigo[c] = (r.porCodigo[c] || 0) + 1;
      var clase = (dicc[c] && dicc[c].clase) || "otro";
      r.porClase[clase] = (r.porClase[clase] || 0) + 1;
    });
    return r;
  }

  global.TRAZZA = global.TRAZZA || {};
  global.TRAZZA.catalogo = {
    ESTADOS: ESTADOS,
    modulos: modulos,
    rubros: rubros,
    agrupar: agrupar,
    resumen: resumen
  };
})(window);
