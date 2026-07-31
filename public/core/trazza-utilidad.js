/* ==========================================================================
   TRAZZA — Motor único de atribución y utilidad
   --------------------------------------------------------------------------
   POR QUÉ EXISTE, Y POR QUÉ ES UN ARCHIVO Y NO UNA FUNCIÓN EN CADA PANTALLA

   El punto 5 del changelog dice que en `gerencia/utilidad/index.html` el
   mantenimiento correctivo AHORA RESTA de la utilidad operativa, cuando
   antes era "solo informativo, no resta".

   Pero el módulo de viajes calcula la utilidad del tramo con su propia
   fórmula, y ahí el mantenimiento se muestra y NO resta:

       utilidad del tramo = flete − (viáticos + estiba/toldeo/descarga
                                     + combustible + lavado)

   Es decir: hoy hay DOS motores de utilidad en el mismo sistema, con dos
   políticas distintas sobre el mismo concepto. Abrir "Viajes" y abrir
   "Rentabilidad" para el mismo mes puede dar dos números distintos, y los
   dos son "correctos" según su propio archivo. Esto no es un bug de cálculo
   —cada fórmula evalúa bien— es un bug de arquitectura, y es de la clase
   más cara: el cliente lo descubre delante de su gerente, no en una prueba.

   [CONFLICTO DETECTADO — resolver antes de migrar datos]
   Hay que decidir UNA política y declararla. Este archivo no la decide: la
   lee de `config/<empresa>__politica_costos` y la DEVUELVE junto al
   resultado, de modo que cualquier reporte pueda imprimir con qué regla se
   calculó ese número. Un número sin su política al lado no es auditable.

   LAS DOS CLASES DE COSTO (punto 5 del changelog, textual)
   "Distinción explícita entre costos imputables por unidad vs costos
   globales de empresa (se restan del total pero no se prorratean)."

   - imputable: tiene una placa. Se resta del tramo y de la placa.
     (combustible, GNL, lavado, viáticos, estiba, peaje, correctivo…)
   - global:    es de la empresa. Se resta del total del periodo y NO se
     reparte entre placas. (mantenimiento preventivo mensual manual,
     alquileres, planilla administrativa…)

   Prorratear un costo global entre placas es la tentación obvia y es
   siempre un error: inventa un costo por unidad que nadie puede accionar, y
   ensucia la única cifra que el transportista sí usa para decidir, que es
   cuánto dejó ESE camión en ESE tramo.
   ========================================================================== */
(function (global) {

  function N() { return (global.TRAZZA && global.TRAZZA.norm) || null; }
  function P() { return (global.TRAZZA && global.TRAZZA.params) || null; }

  // Política por defecto si el tenant no declaró la suya. Es deliberadamente
  // la más conservadora: el correctivo NO resta del tramo (coincide con el
  // módulo de viajes original), y se marca `_pordefecto:true` para que el
  // reporte pueda advertir que nadie la eligió explícitamente.
  var POLITICA_DEFECTO = {
    _pordefecto: true,
    imputables: ["combustible", "gnl", "lavado", "viaticos", "estiba", "toldeo", "descarga", "peaje"],
    globales: ["mant_preventivo_mes", "alquileres"],
    correctivoResta: false,
    preventivoResta: true,
    incluirHistorico: false
  };

  function politica() {
    if (!P()) return Promise.resolve(POLITICA_DEFECTO);
    return P().traer("politica_costos").then(function (d) {
      if (!d) return POLITICA_DEFECTO;
      var p = {};
      for (var k in POLITICA_DEFECTO) if (POLITICA_DEFECTO.hasOwnProperty(k)) p[k] = POLITICA_DEFECTO[k];
      for (var j in d) if (d.hasOwnProperty(j) && j.charAt(0) !== "_") p[j] = d[j];
      p._pordefecto = false;
      return p;
    });
  }

  /* ------------------------------------------------------------------------
     1) ATRIBUCIÓN — "los gastos se enganchan solos, por placa + rango"
     ------------------------------------------------------------------------
     Regla del cerebro de MISAGI, motor nº2 (el diferenciador): un gasto no
     se asigna a mano a un viaje. Se engancha por placa normalizada y por
     fecha dentro del rango del viaje. Si dos viajes de la misma placa se
     solapan en esa fecha, gana el MÁS RECIENTE (el que empezó después).

     Devuelve el gasto anotado con:
       dueno  = id del viaje al que quedó imputado (o null)
       autoDe = "auto" | "manual" | null
     y NO pisa una atribución manual previa: si alguien ya dijo a mano a qué
     viaje pertenece un gasto, el automático no lo corrige. Esa es la única
     forma de que el operador confíe en corregir el sistema una vez y que la
     corrección sobreviva al siguiente recálculo.
  ------------------------------------------------------------------------ */
  function atribuir(gastos, viajes) {
    var n = N();
    var porPlaca = {};
    (viajes || []).forEach(function (v) {
      var pl = n ? n.NP(v.placa) : v.placa;
      if (!pl) return;
      // `hasta` vacío significa VIAJE ABIERTO (salió y todavía no registró
      // llegada), no viaje de un solo día. Es la diferencia entre que el
      // diésel del martes de un viaje que sigue en ruta se enganche solo, o
      // que caiga en "revisar" hasta que alguien cierre el viaje el jueves.
      // Un viaje abierto no se come los gastos de los viajes posteriores de
      // la misma placa: el orden es más-reciente-primero y gana la primera
      // coincidencia, así que un viaje que empezó después siempre manda.
      (porPlaca[pl] = porPlaca[pl] || []).push({
        id: v._id || v.id,
        desde: n ? n.NF(v.fechaSalida || v.desde || v.fecha) : (v.fechaSalida || v.desde || v.fecha),
        hasta: n ? n.NF(v.fechaLlegada || v.hasta) : (v.fechaLlegada || v.hasta)
      });
    });
    // Más reciente primero: la primera coincidencia gana el solape.
    for (var k in porPlaca) {
      if (porPlaca.hasOwnProperty(k)) {
        porPlaca[k].sort(function (a, b) { return (b.desde || "").localeCompare(a.desde || ""); });
      }
    }

    return (gastos || []).map(function (g) {
      var out = {};
      for (var kk in g) if (g.hasOwnProperty(kk)) out[kk] = g[kk];
      if (out.dueno && out.autoDe === "manual") return out;      // respeta lo manual

      var pl = n ? n.NP(out.placa) : out.placa;
      var f = n ? n.NF(out.fecha) : out.fecha;
      out.dueno = null; out.autoDe = null;
      if (!pl || !f) { out.revisar = true; out.motivo = "gasto sin placa o sin fecha del hecho"; return out; }

      var cands = porPlaca[pl] || [];
      for (var i = 0; i < cands.length; i++) {
        var c = cands[i];
        if (c.desde && f >= c.desde && (!c.hasta || f <= c.hasta)) {
          out.dueno = c.id; out.autoDe = "auto"; return out;
        }
      }
      // Sin viaje que lo reclame. No se descarta ni se fuerza: se marca.
      out.revisar = true;
      out.motivo = "no hay viaje de la placa " + pl + " que cubra el " + f;
      return out;
    });
  }

  /* ------------------------------------------------------------------------
     2) UTILIDAD DEL TRAMO
     ------------------------------------------------------------------------
     flete = 0 si el tramo va vacío; si va cargado, (tarifaUsada || tarifa
     vigente a la fecha) × tne, y × tipo de cambio si la tarifa está en USD.
     Ambos parámetros se resuelven A LA FECHA DEL VIAJE, no a hoy (ver
     trazza-params.js).
  ------------------------------------------------------------------------ */
  function fleteDe(viaje, tarifa, tc) {
    var n = N();
    if (viaje.vacio === true || viaje.cargado === false) return 0;
    var t = (viaje.tarifaUsada !== undefined && viaje.tarifaUsada !== null) ? viaje.tarifaUsada : tarifa;
    t = n ? n.NN(t) : t;
    var tne = n ? n.NN(viaje.tne) : viaje.tne;
    if (t == null || tne == null) return null;                 // null ≠ 0: falta el dato
    var f = t * tne;
    if (String(viaje.moneda || "").toUpperCase() === "USD") {
      var c = n ? n.NN(tc) : tc;
      if (c == null) return null;
      f = f * c;
    }
    return round2(f);
  }

  function round2(x) { return Math.round(x * 100) / 100; }

  // Suma los gastos imputables de un viaje según la política declarada.
  function costosDe(viaje, gastosDelViaje, pol) {
    var n = N();
    var det = {}, total = 0, mostrados = {};
    (gastosDelViaje || []).forEach(function (g) {
      if (!pol.incluirHistorico && g.historico === true) return;   // punto 6: histórico no computa
      if (String(g.estado || "").toLowerCase() === "baja") return;  // punto 7: bandera de baja
      var rubro = String(g.rubro || g.modulo || "otro").toLowerCase();
      var monto = n ? n.NN(g.monto !== undefined ? g.monto : g.costo) : g.monto;
      if (monto == null) return;

      var resta = pol.imputables.indexOf(rubro) >= 0;
      if (rubro === "correctivo" || rubro === "mantenimiento") resta = !!pol.correctivoResta;

      if (resta) { det[rubro] = round2((det[rubro] || 0) + monto); total = round2(total + monto); }
      else { mostrados[rubro] = round2((mostrados[rubro] || 0) + monto); }
    });
    return { detalle: det, total: total, mostradosNoRestan: mostrados };
  }

  // Calcula un tramo completo. `ctx` trae los parámetros ya resueltos a la
  // fecha del viaje: { tarifa, tc }.
  function tramo(viaje, gastosDelViaje, pol, ctx) {
    ctx = ctx || {};
    var flete = fleteDe(viaje, ctx.tarifa, ctx.tc);
    var c = costosDe(viaje, gastosDelViaje, pol);
    var util = (flete == null) ? null : round2(flete - c.total);
    return {
      viaje: viaje._id || viaje.id,
      placa: N() ? N().NP(viaje.placa) : viaje.placa,
      fecha: N() ? N().NF(viaje.fechaSalida || viaje.fecha) : viaje.fecha,
      cargado: !(viaje.vacio === true || viaje.cargado === false),
      flete: flete,
      costos: c.total,
      detalle: c.detalle,
      noRestan: c.mostradosNoRestan,
      utilidad: util,
      incompleto: (flete == null)
    };
  }

  /* ------------------------------------------------------------------------
     3) UTILIDAD DEL PERIODO
     ------------------------------------------------------------------------
     Suma los tramos por placa (costos imputables) y resta aparte los costos
     globales del periodo, que NO se prorratean. Devuelve siempre la política
     usada: ningún consumidor debería imprimir el número sin ella.
  ------------------------------------------------------------------------ */
  function periodo(tramos, globalesDelPeriodo, pol) {
    var porPlaca = {}, flete = 0, costos = 0, incompletos = 0;
    (tramos || []).forEach(function (t) {
      if (t.incompleto) { incompletos++; return; }
      var p = t.placa || "SIN PLACA";
      var b = porPlaca[p] = porPlaca[p] || { placa: p, viajes: 0, vacios: 0, flete: 0, costos: 0, utilidad: 0 };
      b.viajes++;
      if (!t.cargado) b.vacios++;
      b.flete = round2(b.flete + (t.flete || 0));
      b.costos = round2(b.costos + (t.costos || 0));
      b.utilidad = round2(b.utilidad + (t.utilidad || 0));
      flete = round2(flete + (t.flete || 0));
      costos = round2(costos + (t.costos || 0));
    });

    var glob = 0, globDet = {};
    for (var k in (globalesDelPeriodo || {})) {
      if (!globalesDelPeriodo.hasOwnProperty(k)) continue;
      if (k === "mant_preventivo_mes" && !pol.preventivoResta) continue;
      var v = N() ? N().NN(globalesDelPeriodo[k]) : globalesDelPeriodo[k];
      if (v == null) continue;
      globDet[k] = v; glob = round2(glob + v);
    }

    var lista = [];
    for (var p2 in porPlaca) if (porPlaca.hasOwnProperty(p2)) lista.push(porPlaca[p2]);
    lista.sort(function (a, b) { return b.utilidad - a.utilidad; });

    return {
      porPlaca: lista,
      flete: flete,
      costosImputables: costos,
      costosGlobales: glob,
      detalleGlobales: globDet,
      utilidadOperativa: round2(flete - costos),          // la que sí es por placa
      utilidadNeta: round2(flete - costos - glob),        // después de lo global
      tramosIncompletos: incompletos,
      politica: pol,
      // Firma legible para imprimir al pie de cualquier reporte. Sin esto,
      // dos reportes del mismo mes con políticas distintas son
      // indistinguibles a simple vista.
      firma: firmaDe(pol)
    };
  }

  function firmaDe(pol) {
    return "correctivo " + (pol.correctivoResta ? "RESTA" : "no resta") +
      " · preventivo " + (pol.preventivoResta ? "RESTA (global)" : "no resta") +
      " · histórico " + (pol.incluirHistorico ? "incluido" : "excluido") +
      (pol._pordefecto ? " · POLÍTICA POR DEFECTO (nadie la declaró)" : "");
  }

  global.TRAZZA = global.TRAZZA || {};
  global.TRAZZA.utilidad = {
    POLITICA_DEFECTO: POLITICA_DEFECTO,
    politica: politica,
    atribuir: atribuir,
    fleteDe: fleteDe,
    costosDe: costosDe,
    tramo: tramo,
    periodo: periodo,
    firmaDe: firmaDe
  };
})(window);
