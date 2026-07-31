/* ==========================================================================
   TRAZZA — La forma canónica de un viaje y de un gasto
   --------------------------------------------------------------------------
   POR QUÉ EXISTE

   Los motores de Trazza (utilidad, mantenimiento, consistencia) hablan un
   vocabulario: un viaje tiene `fechaSalida`, `fechaLlegada` y `cargado`; un
   gasto tiene `placa`, `fecha`, `monto` y `rubro`. Los documentos que hoy
   están en la base de origen hablan otro: `fechaInicio`, `fechaFin`,
   `carga:"CARGADO"`, `costoTotal`, `modulo`. Los dos vocabularios describen
   exactamente el mismo hecho.

   Traducir entre ellos parece trabajo de una línea y por eso suele quedarse
   escrito dentro de cada pantalla, repetido y ligeramente distinto en cada
   una. Ese es el modo en que dos pantallas del mismo sistema terminan
   mostrando dos cifras del mismo mes: no porque el cálculo difiera, sino
   porque una de las dos leyó `costo` donde la otra leyó `costoTotal`, o
   trató un viaje sin fecha de llegada como un viaje de un día. La
   traducción es una regla de negocio, no un detalle de presentación, y por
   eso vive aquí, en un archivo con pruebas, y no dentro del HTML.

   TRES DECISIONES

   1) La traducción NO se guarda. Convierte al leer. Renombrar los campos en
      la base es una migración de datos que se hace una vez, con respaldo, y
      no en medio de una demo; hasta entonces el sistema nuevo lee los
      documentos viejos sin tocarlos. Cuando esa migración ocurra, este
      archivo sigue sirviendo: pasar un documento ya canónico por `viaje()`
      lo devuelve igual, porque acepta ambos nombres para cada campo.

   2) Los gastos propios del viaje se emiten como gastos. Los viáticos, la
      estiba, el toldeo y la descarga viven DENTRO del documento del viaje,
      no como documentos aparte, pero son costos imputables exactamente
      igual que el diésel. `gastosPropios()` los saca a la forma de gasto
      para que el motor de utilidad los sume con el mismo criterio y la
      misma política que a los demás. Si no se hiciera así, la pantalla
      tendría que sumarlos por su cuenta y volveríamos a tener dos fórmulas.

   3) Una falla de mantenimiento entra como rubro `correctivo`, no como
      `mantenimiento` ni como nada que la pantalla decida. Es deliberado: en
      el sistema de origen el módulo de viajes tenía escrito a mano que el mantenimiento
      no resta (`viajes:202`) mientras que gerencia/utilidad tenía escrito a
      mano que sí. Al nombrarlo `correctivo` la respuesta pasa a salir de
      `politica.correctivoResta`, que se lee de la configuración de la
      empresa, y ninguna pantalla puede volver a contestarla sola.

   No hace red, no toca Firestore y no depende del navegador: se puede
   probar con `node`.
   ========================================================================== */
(function (global) {

  function N() { return (global.TRAZZA && global.TRAZZA.norm) || null; }

  function num(v) {
    var n = N();
    if (n) { var x = n.NN(v); return x == null ? null : x; }
    var y = parseFloat(v);
    return isNaN(y) ? null : y;
  }
  function num0(v) { var x = num(v); return x == null ? 0 : x; }
  function fecha(v) { var n = N(); return n ? n.NF(v) : (v ? String(v).slice(0, 10) : ""); }
  function placa(v) { var n = N(); return n ? n.NP(v) : String(v || "").toUpperCase(); }
  function txt(v) { return String(v == null ? "" : v).trim(); }

  /* ------------------------------------------------------------------------
     ¿VA CARGADO?
     ------------------------------------------------------------------------
     Tres formas de decir lo mismo conviven hoy: `cargado` (booleano, la
     canónica), `vacio` (booleano, la negada) y `carga` (el texto "CARGADO"
     o "VACIO" que escribió la pantalla de origen). El orden de precedencia
     es el de mayor a menor explicitud, y ante un documento que no dice
     nada la respuesta es `true`: un tramo se registra porque movió carga, y
     tratar como vacío lo que no se declaró convertiría un flete real en
     cero soles sin que nadie lo note. Un flete de más se discute; un flete
     que desaparece no se discute porque nadie lo ve.
  ------------------------------------------------------------------------ */
  function esCargado(d) {
    if (!d) return true;
    if (d.cargado === true || d.cargado === false) return d.cargado;
    if (d.vacio === true || d.vacio === false) return !d.vacio;
    var c = txt(d.carga).toUpperCase();
    if (c === "VACIO" || c === "VACÍO") return false;
    if (c === "CARGADO") return true;
    return true;
  }

  /* ------------------------------------------------------------------------
     VIAJE → forma canónica
     ------------------------------------------------------------------------
     `fechaLlegada` vacía significa VIAJE ABIERTO y se deja vacía a
     propósito: `TRAZZA.utilidad.atribuir()` interpreta esa ausencia como
     ventana abierta y engancha los gastos de un viaje que sigue en ruta.
     Rellenarla con la fecha de salida —el error natural, "si no llegó, es
     de un día"— rompe justo esa promesa.
  ------------------------------------------------------------------------ */
  function viaje(d) {
    d = d || {};
    var v = {};
    for (var k in d) if (d.hasOwnProperty(k)) v[k] = d[k];

    v._id = d._id || d.id || "";
    v.placa = placa(d.placa);
    v.fechaSalida = fecha(d.fechaSalida || d.fechaInicio || d.desde || d.fecha);
    v.fechaLlegada = fecha(d.fechaLlegada || d.fechaFin || d.hasta);
    v.cargado = esCargado(d);
    v.vacio = !v.cargado;
    v.estado = txt(d.estado).toUpperCase() || (v.fechaLlegada ? "LLEGO" : "EN_TRANSITO");
    v.ruta = txt(d.ruta);
    v.origen = txt(d.origen).toUpperCase();
    v.destino = txt(d.destino).toUpperCase();
    v.conductor = txt(d.conductor);
    v.guia = txt(d.guia);
    v.moneda = (txt(d.moneda).toUpperCase() || "PEN");
    v.tne = num(d.tne);
    v.tc = num(d.tc);
    v.tarifaUsada = num(d.tarifaUsada);
    v.conceptos = d.conceptos || {};
    v.viaticos = d.viaticos || [];
    v.viaticosEntregado = num0(d.viaticosEntregado);
    v.estiba = num0(d.estiba);
    v.toldeo = num0(d.toldeo);
    v.descarga = num0(d.descarga);
    v.periodo = v.fechaSalida ? v.fechaSalida.slice(0, 7) : "";
    return v;
  }

  /* ------------------------------------------------------------------------
     GASTO → forma canónica
     ------------------------------------------------------------------------
     El monto se lee de `monto`, `costoTotal` o `costo`, en ese orden, y si
     ninguno existe queda en null y no en cero. La diferencia importa: cero
     es "costó cero" y null es "no sabemos cuánto costó". El motor de
     utilidad descarta el null y el módulo de consistencia lo denuncia; un
     cero silencioso no lo denuncia nadie y baja el costo del tramo.
  ------------------------------------------------------------------------ */
  var RUBRO_DE_MODULO = {
    combustible: "combustible",
    gnl: "gnl",
    glp: "gnl",
    lavado: "lavado",
    fallas: "correctivo",
    correctivos: "correctivo",
    mantenimiento: "correctivo",
    peaje: "peaje",
    peajes: "peaje"
  };

  function rubroDe(d) {
    if (!d) return "otro";
    var r = txt(d.rubro).toLowerCase();
    if (r) return RUBRO_DE_MODULO[r] || r;
    var m = txt(d.modulo).toLowerCase();
    if (m) return RUBRO_DE_MODULO[m] || m;
    return "otro";
  }

  function gasto(d, rubroForzado) {
    d = d || {};
    var g = {};
    for (var k in d) if (d.hasOwnProperty(k)) g[k] = d[k];
    g._id = d._id || d.id || "";
    g.placa = placa(d.placa);
    g.fecha = fecha(d.fecha || d.fechaFalla || d.fechaGasto);
    g.rubro = txt(rubroForzado).toLowerCase() || rubroDe(d);
    var m = (d.monto !== undefined && d.monto !== null && d.monto !== "") ? d.monto
          : ((d.costoTotal !== undefined && d.costoTotal !== null && d.costoTotal !== "") ? d.costoTotal
          : d.costo);
    g.monto = num(m);
    return g;
  }

  /* ------------------------------------------------------------------------
     GASTOS PROPIOS DEL VIAJE
     ------------------------------------------------------------------------
     Viáticos línea por línea (cada una conserva su fecha, que es la que
     permite discutir un gasto concreto y no un total), más estiba, toldeo y
     descarga cuando la ruta los contempla. Un concepto que la ruta no
     contempla no se emite aunque el documento traiga un número: si la ruta
     dice que ahí no se estiba, ese monto es un dato viejo de otra ruta y
     sumarlo es inventar un costo.
  ------------------------------------------------------------------------ */
  function gastosPropios(v) {
    v = viaje(v);
    var out = [], c = v.conceptos || {};

    (v.viaticos || []).forEach(function (x, i) {
      var m = num(x && x.monto);
      if (m == null) return;
      out.push({
        _id: (v._id || "viaje") + "__viatico_" + i,
        placa: v.placa,
        fecha: fecha((x && x.fecha) || v.fechaSalida),
        rubro: "viaticos",
        monto: m,
        concepto: txt(x && x.concepto),
        lugar: txt(x && x.lugar),
        dueno: v._id,
        autoDe: "propio"
      });
    });

    ["estiba", "toldeo", "descarga"].forEach(function (k) {
      if (!c[k]) return;                       // la ruta no contempla el concepto
      var m = num(v[k]);
      if (m == null || m === 0) return;
      out.push({
        _id: (v._id || "viaje") + "__" + k,
        placa: v.placa,
        fecha: v.fechaSalida,
        rubro: k,
        monto: m,
        dueno: v._id,
        autoDe: "propio"
      });
    });

    return out;
  }

  /* ------------------------------------------------------------------------
     GASTOS DE UN VIAJE = los propios + los que la atribución le enganchó
     ------------------------------------------------------------------------
     Un solo lugar donde se decide qué entra en el costo de un tramo. La
     pantalla llama a esto y le pasa el resultado al motor de utilidad; no
     construye la lista por su cuenta.
  ------------------------------------------------------------------------ */
  function gastosDe(v, atribuidos) {
    var id = (v && (v._id || v.id)) || "";
    var enganchados = (atribuidos || []).filter(function (g) { return g && g.dueno === id; });
    return gastosPropios(v).concat(enganchados);
  }

  /* ------------------------------------------------------------------------
     ¿SE PUEDE CERRAR EL VIAJE?
     ------------------------------------------------------------------------
     La misma lista que el sistema de origen tenía dentro de la pantalla, sacada aquí para
     que se pueda probar y para que la respuesta sea idéntica venga de donde
     venga (la tarjeta, el modal o una futura acción masiva). Devuelve el
     motivo en texto para mostrarlo, o "" si se puede.
  ------------------------------------------------------------------------ */
  function puedeCerrar(v) {
    v = viaje(v);
    if (!v.fechaLlegada) return "Marca primero que llegó: sin fecha de llegada el viaje sigue abierto y sigue enganchando gastos.";
    if (v.fechaLlegada < v.fechaSalida) return "La llegada no puede ser anterior a la salida.";
    if (v.cargado && !v.guia) return "Un tramo cargado necesita su guía: la guía es el DNI del tramo.";
    if (v.cargado && !v.tne) return "Falta el tonelaje (TNE): sin él no hay flete que calcular.";
    if (v.cargado && v.moneda === "USD" && !v.tc) return "La tarifa está en dólares y falta el tipo de cambio de la fecha del viaje.";
    var vt = 0;
    (v.viaticos || []).forEach(function (x) { var m = num(x && x.monto); if (m != null) vt += m; });
    if (vt <= 0) return "Faltan los viáticos: ningún viaje cuesta cero en el camino.";
    return "";
  }

  /* ------------------------------------------------------------------------
     PENDIENTES DEL VIAJE
     ------------------------------------------------------------------------
     Tres niveles y no dos: `req` es lo que impide cerrar, `esp` es lo que
     normalmente hay y puede no aplicar (un tramo corto sin lavado es
     legítimo), `ok` es lo que ya está. La distinción existe porque pintar
     de rojo lo que puede no aplicar enseña a la gente a ignorar el rojo.
  ------------------------------------------------------------------------ */
  function pendientes(v, resumenGastos) {
    v = viaje(v);
    var a = resumenGastos || {};
    var out = [];
    if (v.cargado) out.push(v.guia ? { t: "ok", txt: "Guía " + v.guia } : { t: "req", txt: "Falta GUÍA" });
    else out.push({ t: "ok", txt: "Vacío · sin guía" });

    var vt = 0;
    (v.viaticos || []).forEach(function (x) { var m = num(x && x.monto); if (m != null) vt += m; });
    out.push(vt > 0 ? { t: "ok", txt: "Viáticos" } : { t: "req", txt: "Faltan VIÁTICOS" });

    out.push(a.nCombustible ? { t: "ok", txt: "Combustible" } : { t: "esp", txt: "Sin abastecimiento" });
    out.push(a.nLavado ? { t: "ok", txt: "Lavado" } : { t: "esp", txt: "Sin lavado" });
    if (a.nCorrectivo) out.push({ t: "esp", txt: "Correctivo en estas fechas" });
    return out;
  }

  // Cuenta los gastos enganchados por rubro. Devuelve nCombustible, nGnl,
  // nLavado, nCorrectivo… en la forma que consume pendientes().
  function conteo(gastosDelViaje) {
    var out = {};
    (gastosDelViaje || []).forEach(function (g) {
      var r = String((g && g.rubro) || "otro");
      var k = "n" + r.charAt(0).toUpperCase() + r.slice(1);
      out[k] = (out[k] || 0) + 1;
    });
    out.nCombustible = (out.nCombustible || 0) + (out.nGnl || 0);   // GNL es abastecimiento
    return out;
  }

  global.TRAZZA = global.TRAZZA || {};
  global.TRAZZA.forma = {
    viaje: viaje,
    gasto: gasto,
    esCargado: esCargado,
    rubroDe: rubroDe,
    gastosPropios: gastosPropios,
    gastosDe: gastosDe,
    puedeCerrar: puedeCerrar,
    pendientes: pendientes,
    conteo: conteo,
    RUBRO_DE_MODULO: RUBRO_DE_MODULO
  };
})(typeof window !== "undefined" ? window : global);
