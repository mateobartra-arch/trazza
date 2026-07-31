/* ==========================================================================
   TRAZZA — Parámetros por periodo (config editable sin redeploy)
   --------------------------------------------------------------------------
   POR QUÉ EXISTE
   El punto 5 del changelog describe el patrón sin nombrarlo del todo:
   "Parámetros de costo editables por periodo guardados en un doc de config
   (igual que el tipo de cambio) → auditable y sin redeploy". Y el punto 3
   del cerebro de MISAGI describe lo mismo desde otro ángulo: "La tarifa se
   fotografía a la fecha del viaje".

   Son el mismo mecanismo. Un parámetro no tiene un valor: tiene un valor
   POR PERIODO. El tipo de cambio de julio no es el de agosto. El monto
   manual de mantenimiento preventivo de julio no es el de agosto. La tarifa
   de una ruta cambia cuando se renegocia el contrato. Si el sistema guarda
   "el valor actual" y lo aplica a todo, recalcular junio en agosto da un
   número distinto del que se le facturó al cliente en junio, y ahí se acabó
   la confianza en el sistema.

   Por eso la regla dura del núcleo es:

       TODO parámetro se resuelve con la FECHA DEL HECHO,
       nunca con la fecha en que alguien abre la pantalla.

   enFecha(clave, fechaDelHecho) es la única forma correcta de leer un
   parámetro. valorHoy() existe solo para pintar el formulario de edición.

   DÓNDE VIVEN
   En la colección top-level `config`, un documento por parámetro y tenant,
   con id "<empresaId>__<clave>". Es una colección propia y NO un documento
   escondido dentro de `contabilidad` (que es como estaba en MISAGI:
   contabilidad/_config_tc). Ese detalle importa: si el tipo de cambio vive
   dentro de la colección `contabilidad`, entonces por las reglas de
   seguridad solo puede leerlo quien tenga el área contabilidad — y el
   módulo de viajes, que es de operaciones, necesita el TC para convertir un
   flete en dólares. En MISAGI eso no explotaba porque no había reglas
   reales. Aquí sí las hay, así que el parámetro tiene que vivir donde
   cualquier usuario activo del tenant pueda leerlo y solo su área dueña
   pueda escribirlo. Ver firestore.rules, match /config/{id}.

   FORMA DEL DOCUMENTO
     {
       empresaId: "andina",
       clave:     "tc_sunat",
       tipo:      "escalar" | "mapa",
       area:      "contabilidad",     // quién puede escribirlo
       defecto:   3.75,               // valor si no hay periodo aplicable
       valores:   { "2026-06": 3.72, "2026-07": 3.68 },
       catalogo:  null,               // solo para tipo "catalogo"
       _ts, _por                      // auditoría: cuándo y quién lo cambió
     }
   ========================================================================== */
(function (global) {

  var TTL = 5 * 60 * 1000;          // mismo TTL que el perfil en trazza-auth.js
  var cache = {};                    // clave -> { t: ms, doc: {...} }

  function N() { return (global.TRAZZA && global.TRAZZA.norm) || null; }
  function empresa() {
    return (global.TRAZZA && global.TRAZZA.empresaActual) ? global.TRAZZA.empresaActual() : "";
  }
  function docId(clave) { return empresa() + "__" + clave; }

  // ---- Lectura cruda, con caché por TTL ---------------------------------
  function traer(clave, forzar) {
    var eId = empresa();
    if (!eId) return Promise.reject(new Error("No hay empresaId activo (revisa trazza.config.js)"));
    var k = docId(clave), c = cache[k], ahora = fechaMs();
    if (!forzar && c && (ahora - c.t) < TTL) return Promise.resolve(c.doc);
    return firebase.firestore().collection("config").doc(k).get().then(function (s) {
      var d = s.exists ? s.data() : null;
      // Barrera de tenant también en lectura: el id lleva el empresaId, pero
      // no se confía en el id — se comprueba el campo, igual que en las reglas.
      if (d && d.empresaId !== eId) d = null;
      cache[k] = { t: ahora, doc: d };
      return d;
    });
  }

  // Date.now() aislado en una función para poder inyectar un reloj en pruebas.
  function fechaMs() { return (new Date()).getTime(); }

  // ---- enFecha(): la única lectura correcta -----------------------------
  // Busca el valor vigente en el periodo de la fecha del hecho. Si ese
  // periodo no está declarado, usa el periodo declarado más reciente que sea
  // ANTERIOR o igual (un parámetro sigue vigente hasta que alguien lo
  // cambia), y si no hay ninguno anterior cae a `defecto`.
  //
  // Nota importante: NO se toma el periodo posterior más cercano. Si en
  // agosto alguien carga el TC de agosto, un viaje de julio sigue valiendo
  // el TC de julio. Extrapolar hacia atrás reescribiría el pasado.
  function enFecha(clave, fechaDelHecho) {
    return traer(clave).then(function (d) {
      return resolver(d, fechaDelHecho);
    });
  }

  function resolver(d, fechaDelHecho) {
    if (!d) return null;
    if (d.tipo !== "mapa") return d.valor !== undefined ? d.valor : (d.defecto !== undefined ? d.defecto : null);
    var per = N() ? N().NPer(fechaDelHecho) : String(fechaDelHecho || "").slice(0, 7);
    var vals = d.valores || {};
    if (per && vals.hasOwnProperty(per)) return vals[per];
    // periodo declarado más reciente que sea <= per
    var claves = Object.keys(vals).sort();
    var elegido = null;
    for (var i = 0; i < claves.length; i++) {
      if (!per || claves[i] <= per) elegido = claves[i]; else break;
    }
    if (elegido !== null) return vals[elegido];
    return d.defecto !== undefined ? d.defecto : null;
  }

  // Resuelve varias claves de una vez para la misma fecha. Es lo que usa el
  // motor de utilidad: una sola pasada de lecturas para todo un periodo.
  function variosEnFecha(claves, fechaDelHecho) {
    return Promise.all((claves || []).map(function (c) {
      return enFecha(c, fechaDelHecho).then(function (v) { return [c, v]; });
    })).then(function (pares) {
      var o = {};
      pares.forEach(function (p) { o[p[0]] = p[1]; });
      return o;
    });
  }

  // ---- Valor de hoy: SOLO para pintar el formulario de edición ----------
  function valorHoy(clave) {
    return enFecha(clave, new Date());
  }

  // ---- Escritura de un periodo ------------------------------------------
  // Escribe un periodo puntual sin tocar los demás (merge de un campo del
  // mapa). Esto es lo que hace "auditable y sin redeploy": el histórico de
  // valores queda en el mismo documento, no se pisa.
  function fijarPeriodo(clave, periodo, valor, meta) {
    var eId = empresa();
    if (!eId) return Promise.reject(new Error("No hay empresaId activo"));
    var per = N() ? N().NPer(periodo) : periodo;
    if (!per) return Promise.reject(new Error("Periodo inválido: use YYYY-MM"));
    var u = firebase.auth().currentUser;
    var payload = {
      empresaId: eId,
      clave: clave,
      tipo: "mapa",
      _ts: firebase.firestore.FieldValue.serverTimestamp(),
      _por: u ? (u.email || u.uid) : "desconocido"
    };
    if (meta && meta.area) payload.area = meta.area;
    if (meta && meta.defecto !== undefined) payload.defecto = meta.defecto;
    payload.valores = {};
    payload.valores[per] = valor;
    delete cache[docId(clave)];
    return firebase.firestore().collection("config").doc(docId(clave))
      .set(payload, { merge: true }).then(function () { return per; });
  }

  function fijarEscalar(clave, valor, meta) {
    var eId = empresa();
    if (!eId) return Promise.reject(new Error("No hay empresaId activo"));
    var u = firebase.auth().currentUser;
    var payload = {
      empresaId: eId, clave: clave, tipo: "escalar", valor: valor,
      _ts: firebase.firestore.FieldValue.serverTimestamp(),
      _por: u ? (u.email || u.uid) : "desconocido"
    };
    if (meta && meta.area) payload.area = meta.area;
    delete cache[docId(clave)];
    return firebase.firestore().collection("config").doc(docId(clave))
      .set(payload, { merge: true });
  }

  // ---- Catálogos cerrados (para el módulo de consistencia) --------------
  // Un catálogo es la lista de valores permitidos de un campo: los tipos de
  // lavado, los códigos del roster, los rubros de gasto. El punto 7 del
  // changelog los usa para detectar "valores fuera de catálogo (p. ej. tipo
  // de lavado '?')". Se guardan como parámetro para poder ampliarlos por
  // cliente sin tocar código.
  function catalogo(clave) {
    return traer("cat_" + clave).then(function (d) {
      return (d && d.catalogo) || (d && d.valor) || [];
    });
  }

  // ---- Fecha de corte por módulo (bandera histórico, punto 6) -----------
  // Todo lo anterior al corte se carga con historico:true y no computa en
  // saldos ni KPIs. Aquí vive la fecha, para que el mismo corte lo respeten
  // el kardex, los reportes y el motor de utilidad sin acordarse cada uno.
  function corte(modulo) {
    return traer("corte_" + modulo).then(function (d) {
      return d ? (d.valor || d.defecto || null) : null;
    });
  }

  // ---- Vigencias con fecha exacta ---------------------------------------
  // resolver() trabaja por PERIODO (YYYY-MM) y eso está bien para el tipo de
  // cambio o el gasto de mantenimiento del mes. Pero una tarifa de ruta no se
  // renegocia el día primero: se renegocia el 15 de junio. Si esa lista pasara
  // por resolver(), NPer() truncaría "2026-06-15" a "2026-06" y un viaje del
  // 10 de junio cobraría la tarifa nueva. Sería un error silencioso, del peor
  // tipo: nadie lo nota hasta que el cliente reclama la factura.
  //
  // vigenteEn() es la versión con fecha exacta y es una función pura: recibe
  // la lista, devuelve el elemento. Sin red, sin caché, sin empresa. Así se
  // puede probar el número que va a terminar en una factura sin levantar
  // Firebase.
  //
  //   lista  : [{desde:"2026-01-01", ...}, {desde:"2026-06-15", ...}]
  //   fecha  : "2026-06-10"  (o Date; se normaliza con NF)
  //   campo  : nombre del campo de fecha; por defecto "desde"
  //
  // Reglas, en orden:
  //   1. Gana la entrada más reciente con desde <= fecha. Nunca extrapola
  //      hacia adelante: una tarifa que empieza el 15 no existe el 10.
  //   2. Una entrada sin `desde` se considera vigente desde siempre.
  //   3. Si el hecho es anterior a TODA la lista, corresponde la entrada más
  //      antigua conocida, nunca la de hoy. Es lo que hacía MISAGI a
  //      propósito (viajes/index.html:154) y es la decisión correcta: liquidar
  //      un viaje viejo a la tarifa de hoy infla el ingreso de un periodo ya
  //      cerrado.
  function vigenteEn(lista, fecha, campo) {
    if (!lista || !lista.length) return null;
    var c = campo || "desde";
    var f = N() ? N().NF(fecha) : String(fecha || "").slice(0, 10);
    var cands = [];
    for (var i = 0; i < lista.length; i++) {
      if (!lista[i]) continue;
      var d = lista[i][c];
      d = d ? (N() ? N().NF(d) : String(d).slice(0, 10)) : "";
      cands.push({ desde: d || "", item: lista[i] });
    }
    if (!cands.length) return null;
    cands.sort(function (a, b) { return a.desde < b.desde ? -1 : (a.desde > b.desde ? 1 : 0); });
    var elegido = null;
    for (var j = 0; j < cands.length; j++) {
      if (!f || !cands[j].desde || cands[j].desde <= f) elegido = cands[j].item; else break;
    }
    return elegido !== null ? elegido : cands[0].item;   // regla 3
  }

  function limpiarCache() { cache = {}; }

  global.TRAZZA = global.TRAZZA || {};
  global.TRAZZA.params = {
    enFecha: enFecha,
    variosEnFecha: variosEnFecha,
    valorHoy: valorHoy,
    fijarPeriodo: fijarPeriodo,
    fijarEscalar: fijarEscalar,
    catalogo: catalogo,
    corte: corte,
    traer: traer,
    resolver: resolver,          // expuesto para poder probarlo sin red
    vigenteEn: vigenteEn,        // vigencias con fecha exacta (tarifas de ruta)
    limpiarCache: limpiarCache
  };
})(window);
