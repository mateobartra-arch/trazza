/* ==========================================================================
   TRAZZA — Capa de datos compartida (fusión de crud.js + la parte de datos
   de registro.js, limpia de todo lo específico de un cliente)
   --------------------------------------------------------------------------
   Este archivo NO pinta pantallas (eso lo siguen haciendo los módulos de
   cada app, igual que antes). Expone solo el acceso a Firestore que antes
   estaba repetido y mezclado con UI dentro de assets/crud.js (función
   modulo()) y assets/registro.js (funciones cargar/guardar/borrar internas
   de init()). Aquí queda aislado y con el aislamiento por tenant aplicado
   SIEMPRE, no como responsabilidad de cada módulo.

   Cambio de fondo respecto al original: en el sistema de origen el único discriminador
   de datos era el campo "modulo" dentro de una colección compartida por
   área (ej. la colección "operaciones" mezcla los módulos "combustible",
   "rutas", "gnl", etc.). Eso funcionaba para una sola empresa. Para
   multi-tenant hace falta un segundo discriminador: "empresaId". Por eso
   listar() y guardar() lo inyectan de forma OBLIGATORIA y no opcional:
   ningún módulo de app puede "olvidarse" de filtrar por empresa.

   ÍNDICES DE FIRESTORE REQUERIDOS
   --------------------------------------------------------------------------
   listar() arma queries del tipo:
     where("empresaId","==",X).where("modulo","==",Y).orderBy("_ts","desc")
   Firestore exige un índice compuesto para cada colección que reciba este
   patrón (empresaId + modulo [+ _ts]). Ver firestore.indexes.json (en esta
   misma carpeta) para la lista de índices a desplegar con:
     firebase deploy --only firestore:indexes
   Las colecciones que usan el patrón empresaId+modulo son (según el
   inventario de la app de origen): operaciones, mantenimiento,
   contabilidad, rrhh, ssoma, imagen, personas, roster, roster_conductores,
   viajes, documentos, asistencia, boletas, solicitudes, tareas, enlaces,
   prefs_enlaces, mis_enlaces, proveedores, mail.
   La colección "usuarios" es la excepción: se indexa por uid (id de
   documento), no por modulo, así que no necesita este índice compuesto.

   --------------------------------------------------------------------------
   TRES REGLAS QUE ESTE ARCHIVO IMPONE Y NINGÚN MÓDULO PUEDE SALTARSE
   --------------------------------------------------------------------------
   1) ORDEN POR FECHA DEL HECHO, CAPTURA SOLO COMO DESEMPATE.
      Es el punto 2 del changelog. En el sistema de origen el listado de reportes de flota
      ordenaba solo por fecha de subida, así que un reporte atrasado subido
      hoy tapaba al más reciente y el jefe de flota leía como "último estado"
      un estado viejo. Este archivo tenía exactamente el mismo defecto: la
      línea de sort miraba solo _ts. Ahora ordena por `fecha` descendente y
      usa _ts únicamente para desempatar dos hechos del mismo día.
      Un documento SIN fecha del hecho no se esconde ni se manda al final en
      silencio: se marca _sinFecha:true y se pone al principio, porque es un
      registro que alguien tiene que arreglar, no un registro antiguo.

   2) NORMALIZAR AL ESCRIBIR.
      guardar() pasa el documento por TRAZZA.norm.documento() antes de tocar
      la base. Las placas entran como AAA-000, los DNI con sus ocho dígitos y
      las fechas como YYYY-MM-DD, venga el dato de un formulario, de un pegado
      de Excel o de una importación. Si la normalización viviera en cada
      pantalla, bastaría con una pantalla nueva escrita con prisa para volver
      a partir un camión en cuatro.

   3) LAS BANDERAS DE DATO SE RESPETAN AQUÍ, NO EN CADA REPORTE.
      `historico:true` = cargado antes de la fecha de corte, existe pero no
      computa en saldos ni KPIs (punto 6). `estado:"baja"` = ya no es parte de
      la operación (punto 7: la compresora a diésel que se coló como tracto).
      listar() los excluye por defecto y hay que pedirlos explícitamente.
      Al revés — que cada reporte se acuerde de filtrarlos — es cómo aparecen
      dos cifras distintas del mismo mes en dos pantallas del mismo sistema.
   ========================================================================== */
(function (global) {
  function db() { return firebase.firestore(); }

  // Devuelve la referencia a una colección por nombre (helper fino, sin
  // lógica de tenant: úsalo solo para casos que no encajan en listar/guardar,
  // por ejemplo doc(uid) directo como usuarios).
  function col(nombre) {
    return db().collection(nombre);
  }

  // Usuario autenticado actual (para el campo _por de auditoría).
  function _porActual() {
    var u = firebase.auth().currentUser;
    return u ? (u.email || u.uid || "desconocido") : "desconocido";
  }

  // Lee todos los documentos de {coleccion} que pertenecen al módulo {modulo}
  // Y a la empresa activa (TRAZZA.empresaActual()). SIEMPRE filtra por
  // empresaId: ningún llamador puede pedir datos de otro tenant desde aquí.
  //   opts = {
  //     coleccion: "operaciones",   // nombre de la colección Firestore
  //     modulo: "combustible",      // sub-app dentro de la colección
  //     extra: function(query){ return query.where(...); },  // opcional
  //     incluirHistorico: false,    // por defecto NO (punto 6 del changelog)
  //     incluirBajas: false,        // por defecto NO (punto 7)
  //     desde: "2026-07-01",        // filtro por fecha del hecho, en memoria
  //     hasta: "2026-07-31"
  //   }
  // Devuelve una Promise<Array> con cada doc como { _id, ...datos }.
  function listar(opts) {
    if (!opts || !opts.coleccion) return Promise.reject(new Error("listar() requiere 'coleccion'"));
    var empresaId = global.TRAZZA && global.TRAZZA.empresaActual ? global.TRAZZA.empresaActual() : "";
    if (!empresaId) return Promise.reject(new Error("No hay empresaId activo (revisa trazza.config.js)"));
    var q = col(opts.coleccion).where("empresaId", "==", empresaId);
    if (opts.modulo) q = q.where("modulo", "==", opts.modulo);
    if (typeof opts.extra === "function") q = opts.extra(q);
    return q.get().then(function (snap) {
      var out = [];
      snap.forEach(function (d) {
        var data = d.data();
        data._id = d.id;
        out.push(data);
      });
      return preparar(out, opts);
    });
  }

  // Filtro de banderas + rango + orden. Separado de listar() para poder
  // probarlo sin red y para que cualquier otra fuente (una importación, una
  // caché offline) pase por exactamente el mismo criterio.
  function preparar(filas, opts) {
    opts = opts || {};
    var n = norm();
    var out = (filas || []).filter(function (d) {
      if (!opts.incluirHistorico && d.historico === true) return false;
      if (!opts.incluirBajas && String(d.estado || "").toLowerCase() === "baja") return false;
      return true;
    });

    // Rango por FECHA DEL HECHO. Se hace aquí y no con un where() de
    // Firestore a propósito: un where de rango sobre `fecha` obligaría a que
    // el primer orderBy fuera `fecha` y multiplicaría los índices compuestos
    // por cada combinación. Los volúmenes de una transportista (miles de
    // registros por año, no millones) no lo justifican todavía.
    if (opts.desde || opts.hasta) {
      var d0 = n ? n.NF(opts.desde) : opts.desde;
      var d1 = n ? n.NF(opts.hasta) : opts.hasta;
      out = out.filter(function (d) {
        var f = fechaHecho(d);
        if (!f) return true;                      // sin fecha: se ve siempre, hay que arreglarlo
        if (d0 && f < d0) return false;
        if (d1 && f > d1) return false;
        return true;
      });
    }

    return ordenar(out);
  }

  // La fecha del hecho de un documento. `fecha` es el campo canónico; los
  // módulos que nombran su fecha de otra forma la declaran en _campoFecha.
  function fechaHecho(d) {
    var n = norm();
    var v = d[d._campoFecha || "fecha"];
    if (v === undefined && d.fechaFalla !== undefined) v = d.fechaFalla;
    return n ? n.NF(v) : (v ? String(v).slice(0, 10) : "");
  }

  // ---- EL ORDEN (punto 2 del changelog) ---------------------------------
  // fecha del hecho DESC; empate -> fecha de captura DESC.
  // Los registros sin fecha del hecho van ARRIBA, marcados. No es un descuido:
  // si fueran al final, nadie los vería nunca y se quedarían fuera de todos
  // los totales en silencio, que es justo lo que el módulo de consistencia
  // existe para impedir.
  function ordenar(filas) {
    filas.forEach(function (d) { d._fechaHecho = fechaHecho(d); d._sinFecha = !d._fechaHecho; });
    return filas.sort(function (a, b) {
      if (a._sinFecha !== b._sinFecha) return a._sinFecha ? -1 : 1;
      if (a._fechaHecho !== b._fechaHecho) return a._fechaHecho < b._fechaHecho ? 1 : -1;
      return ((b._ts && b._ts.seconds) || 0) - ((a._ts && a._ts.seconds) || 0);
    });
  }

  function norm() { return (global.TRAZZA && global.TRAZZA.norm) || null; }

  // Crea o actualiza un documento. SIEMPRE fuerza empresaId (tenant activo),
  // _ts (marca de tiempo del servidor) y _por (quién lo guardó), sin
  // permitir que el llamador los sobreescriba con otro valor.
  //   guardar("operaciones", null, {modulo:"rutas", ...})       -> crea
  //   guardar("operaciones", "abc123", {modulo:"rutas", ...})   -> actualiza (merge)
  // Devuelve una Promise con el id del documento.
  function guardar(coleccion, id, data) {
    var empresaId = global.TRAZZA && global.TRAZZA.empresaActual ? global.TRAZZA.empresaActual() : "";
    if (!empresaId) return Promise.reject(new Error("No hay empresaId activo (revisa trazza.config.js)"));
    var payload = {};
    for (var k in data) { if (data.hasOwnProperty(k)) payload[k] = data[k]; }
    // Normalización en el borde de escritura: placas AAA-000, DNI de 8
    // dígitos, fechas ISO. Venga el dato de un formulario, de un pegado de
    // Excel o de una importación masiva, entra a la base de una sola forma.
    var n = norm();
    if (n) n.documento(payload);
    delete payload._id; delete payload._fechaHecho; delete payload._sinFecha;   // campos de vista, no de base
    payload.empresaId = empresaId;                                   // fuerza el tenant, no confía en el llamador
    payload._por = _porActual();                                     // quién guardó (auditoría)
    if (id) {
      payload._ts = payload._ts || firebase.firestore.FieldValue.serverTimestamp();
      return col(coleccion).doc(id).set(payload, { merge: true }).then(function () { return id; });
    }
    payload._ts = firebase.firestore.FieldValue.serverTimestamp();
    return col(coleccion).add(payload).then(function (ref) { return ref.id; });
  }

  // Borra un documento por id. No revalida empresaId en cliente (además de
  // la validación real en firestore.rules) porque el id ya viene de un
  // listar() previo que solo trae documentos de la empresa activa.
  function borrar(coleccion, id) {
    return col(coleccion).doc(id).delete();
  }

  // Búsqueda en memoria sobre un arreglo ya cargado (igual que filtradas()
  // en crud.js/registro.js): filtra por texto libre sobre los campos dados.
  //   buscar(datos, ["placa","conductor"], "abc")
  function buscar(datos, campos, texto) {
    var q = String(texto || "").toLowerCase().trim();
    if (!q) return datos;
    return (datos || []).filter(function (d) {
      return (campos || []).some(function (c) {
        var v = d[c];
        return String(v == null ? "" : v).toLowerCase().indexOf(q) >= 0;
      });
    });
  }

  global.TRAZZA = global.TRAZZA || {};
  global.TRAZZA.db = {
    col: col,
    listar: listar,
    guardar: guardar,
    borrar: borrar,
    buscar: buscar,
    preparar: preparar,        // expuestos para poder probar el orden y el
    ordenar: ordenar,          // filtrado de banderas sin tocar la red
    fechaHecho: fechaHecho
  };
})(window);
