/* ==========================================================================
   TRAZZA — Motor de mantenimiento y entregables
   --------------------------------------------------------------------------
   POR QUÉ EXISTE

   En el sistema de origen el módulo de mantenimiento produce cuatro entregables en Excel:
   Correctivos, Matriz de neumáticos, MP Ejecutado y MP Programado. DOS DE
   LOS CUATRO SALEN EN BLANCO. La causa está en entregables.js:187-206: la
   consulta de la línea 191 apunta a `mantenimiento/mp_plan`, una colección
   que no existe en la base. La consulta no falla —Firestore devuelve cero
   documentos sin error—, así que el archivo se genera, se descarga, se abre
   y tiene encabezados y ninguna fila. Nadie ve un mensaje de error en
   ninguna parte.

   Esa es exactamente la clase de defecto que un cliente minero descubre en
   la PRIMERA entrega, delante de su supervisor de contrato, no en una
   prueba. Y es peor que un error visible: un archivo vacío se interpreta
   como "no hubo mantenimiento programado este mes", que es una afirmación
   falsa sobre el cumplimiento de un contrato.

   Este archivo lo arregla con tres decisiones, y las tres son de diseño, no
   de código:

   1. EL PLAN PREVENTIVO NO ES UNA COLECCIÓN, ES UN PARÁMETRO.
      En el sistema de origen el plan está escrito a fuego para 7 placas (estatus:3823,
      PLAN_PREVENTIVO) y ADEMÁS se lee de una colección fantasma. Las dos
      cosas están mal para un producto multi-cliente: la primera obliga a
      desplegar código para dar de alta un camión, la segunda no existe.
      Aquí el plan vive en `config/<empresa>__plan_preventivo`, se resuelve
      con TRAZZA.params y se puede editar por periodo como cualquier otro
      parámetro. Un taller que cambia el intervalo de 10 000 a 15 000 km en
      agosto no reescribe lo que ya se ejecutó en julio.

   2. EL MP PROGRAMADO SE DERIVA, NO SE ALMACENA.
      Un vencimiento no es un dato que alguien captura: es una consecuencia
      del plan, de la última ejecución y del odómetro. Guardarlo como
      documento crea la obligación de mantenerlo sincronizado, y esa
      obligación es la que nadie cumple. Se calcula.

   3. UNA HOJA VACÍA TIENE QUE DECIR POR QUÉ ESTÁ VACÍA.
      Todo entregable devuelve `motivo` cuando no tiene filas. "No hay plan
      preventivo configurado para ninguna unidad" es accionable. Una hoja en
      blanco no lo es. Esto es lo único que impide que el defecto de
      entregables.js:191 se repita bajo otra forma dentro de seis meses.

   Como el resto del núcleo, todo aquí es cálculo puro: entra un arreglo de
   documentos, sale un arreglo de filas. No abre Firestore, no necesita
   sesión, no necesita pantalla. Por eso se puede probar (ver
   pruebas-nucleo.js, grupo 8).
   ========================================================================== */
(function (global) {

  function CFG() { return global.TRAZZA_CONFIG || {}; }
  function N() { return (global.TRAZZA && global.TRAZZA.norm) || null; }

  // --- utilidades locales de fecha --------------------------------------
  // Se trabaja siempre con "YYYY-MM-DD" ya normalizado. Un día es un número
  // entero; la diferencia entre dos fechas es una resta. No se usa la hora
  // en ningún cálculo de vencimiento: un mantenimiento no vence a las 3pm.
  function dia(f) {
    var s = N() ? N().NF(f) : String(f || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    return Math.floor(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000);
  }
  function deDia(n) {
    if (n === null || n === undefined) return "";
    var d = new Date(n * 86400000);
    var m = String(d.getUTCMonth() + 1), q = String(d.getUTCDate());
    return d.getUTCFullYear() + "-" + (m.length < 2 ? "0" + m : m) + "-" + (q.length < 2 ? "0" + q : q);
  }
  function dif(a, b) { var x = dia(a), y = dia(b); return (x === null || y === null) ? null : y - x; }
  function num(v) { return (N() ? N().NN(v) : (v === "" || v === null || v === undefined ? null : Number(v))); }
  function placa(v) { return N() ? N().NP(v) : String(v || "").toUpperCase(); }
  function r2(n) { return Math.round((n || 0) * 100) / 100; }

  /* ======================================================================
     1. NEUMÁTICOS — el mínimo de las tres lecturas
     ----------------------------------------------------------------------
     El sistema de origen mide tres puntos de profundidad por neumático y clasifica con el
     MÍNIMO, no con el promedio (estatus:3251-3264). Es la decisión correcta
     y conviene dejarla escrita: un neumático con 12/12/4 mm no está a 9.3 mm
     de vida, está gastado en un punto y ese punto es el que revienta en la
     bajada de Yura. El promedio esconde exactamente el caso que interesa.

     Umbrales por defecto (mm): < 6 BAJA · 6 a 9 REENCAUCHE · >= 9 OPERATIVO.
     Editables por tenant en TRAZZA_CONFIG.mantenimiento.neumatico.
     ====================================================================== */
  function umbrales() {
    var m = (CFG().mantenimiento || {}).neumatico || {};
    return { baja: m.baja !== undefined ? m.baja : 6, reencauche: m.reencauche !== undefined ? m.reencauche : 9 };
  }

  function estadoNeumatico(lecturas) {
    var u = umbrales();
    var vals = (lecturas || []).map(num).filter(function (v) { return v !== null && !isNaN(v); });
    if (!vals.length) return { mm: null, estado: "SIN DATO", lecturas: vals.length, incompleto: true };
    var mm = Math.min.apply(null, vals);
    var est = mm < u.baja ? "BAJA" : (mm < u.reencauche ? "REENCAUCHE" : "OPERATIVO");
    return { mm: r2(mm), estado: est, lecturas: vals.length, incompleto: vals.length < 3 };
  }

  // Posiciones de una unidad: 8 si es encapsulado, 6 si no.
  // Se acepta el campo como booleano `encapsulado` o como texto en `config`.
  function posiciones(unidad) {
    var enc = !!(unidad && (unidad.encapsulado === true ||
      /ENCAPSULAD/i.test(String((unidad && (unidad.configuracion || unidad.config)) || ""))));
    var n = enc ? 8 : 6, out = [];
    for (var i = 1; i <= n; i++) out.push("P" + i);
    return out;
  }

  /* ======================================================================
     2. CIERRE DE FALLAS — una falla no se cierra antes de abrirse
     ----------------------------------------------------------------------
     Port de closeFalla() (estatus:2413-2432): la fecha de cierre tiene que
     ser >= la de la falla, y la duración se acota con Math.max(0, ...).
     Aquí se separa la VALIDACIÓN del EFECTO, para poder probar la regla sin
     escribir en la base y para poder mostrar el motivo en la UI antes de
     que la persona apriete guardar.
     ====================================================================== */
  function puedeCerrar(falla, fechaCierre) {
    var fF = (falla && (falla.fecha || falla.fechaFalla)) || "";
    var a = dia(fF), b = dia(fechaCierre);
    if (a === null) return { ok: false, motivo: "La falla no tiene fecha válida; no se puede calcular la duración." };
    if (b === null) return { ok: false, motivo: "La fecha de cierre no es válida." };
    if (b < a) return { ok: false, motivo: "El cierre (" + deDia(b) + ") es anterior a la falla (" + deDia(a) + ")." };
    if (falla && falla.estado === "CERRADA") return { ok: false, motivo: "La falla ya está cerrada." };
    return { ok: true, motivo: "" };
  }

  function duracion(falla, fechaCierre) {
    var d = dif((falla && (falla.fecha || falla.fechaFalla)) || "", fechaCierre);
    return d === null ? null : Math.max(0, d);
  }

  /* ======================================================================
     3. CORRELATIVO DE OT — la parte pura del contador atómico
     ----------------------------------------------------------------------
     La atomicidad la da runTransaction sobre mantenimiento/contador_ot
     (estatus:2099-2112) y eso vive en la capa de datos. Lo que se puede y se
     debe probar sin red es el FORMATO: cuatro dígitos, año del hecho, y que
     el contador sea por año (campo y2026), no global. Si el correlativo se
     arma mal, dos OT distintas comparten número y el taller pierde la
     trazabilidad del repuesto.
     ====================================================================== */
  function codigoOT(anio, correlativo) {
    var n = String(Math.max(1, parseInt(correlativo, 10) || 1));
    while (n.length < 4) n = "0" + n;
    return "OT-" + anio + "-" + n;
  }
  function campoContador(anio) { return "y" + anio; }

  /* ======================================================================
     4. CAUSALIDAD MP -> FALLA
     ----------------------------------------------------------------------
     buildCausales (estatus:3984-4018): una falla se relaciona con un
     mantenimiento preventivo previo si es del MISMO SISTEMA, dentro de 60
     días Y dentro de 10 000 km. Las dos condiciones a la vez, no una u otra:
     un camión de larga distancia hace 10 000 km en tres semanas y uno de
     planta tarda ocho meses, así que cualquiera de los dos límites por
     separado da falsos positivos en una flota mixta.

     Esto NO afirma que el MP causó la falla. Afirma que un humano debería
     mirar los dos juntos. La diferencia importa cuando el reporte va a una
     minera.
     ====================================================================== */
  function causales(mps, fallas, opts) {
    var o = opts || {};
    var maxDias = o.maxDias !== undefined ? o.maxDias : 60;
    var maxKm = o.maxKm !== undefined ? o.maxKm : 10000;
    var out = [];
    (fallas || []).forEach(function (f) {
      var pf = placa(f.placa), sf = String(f.sistema || "").toUpperCase().trim();
      var kf = num(f.odometro);
      (mps || []).forEach(function (m) {
        if (placa(m.placa) !== pf) return;
        if (String(m.sistema || "").toUpperCase().trim() !== sf || !sf) return;
        var d = dif(m.fecha, f.fecha);
        if (d === null || d < 0 || d > maxDias) return;
        var km = num(m.odometro);
        var dk = (kf !== null && km !== null) ? (kf - km) : null;
        if (dk !== null && (dk < 0 || dk > maxKm)) return;
        out.push({
          placa: pf, sistema: sf,
          mp: m.id || m.ot || "", fechaMp: N() ? N().NF(m.fecha) : m.fecha,
          falla: f.id || "", fechaFalla: N() ? N().NF(f.fecha) : f.fecha,
          dias: d, km: dk,
          // Sin odómetro en alguno de los dos, la ventana de km no se pudo
          // comprobar. Se dice, no se asume que pasó.
          kmVerificado: dk !== null
        });
      });
    });
    return out;
  }

  /* ======================================================================
     5. PLAN PREVENTIVO Y MP PROGRAMADO — lo que arregla el defecto
     ----------------------------------------------------------------------
     FORMA DEL PARÁMETRO `plan_preventivo` (colección config):
       {
         tipo: "mapa",
         valores: {
           "2026-01": {
             "_todas":  [ { sistema:"MOTOR", tarea:"Cambio de aceite",
                            cadaKm:10000, cadaDias:90 } ],
             "V1A-844": [ { sistema:"FRENOS", tarea:"Regulación", cadaDias:30 } ]
           }
         }
       }

     La clave "_todas" aplica a toda la flota; una clave de placa AGREGA
     tareas propias de esa unidad. Así dar de alta un camión no requiere
     tocar el plan: hereda el de la flota. En el sistema de origen eso obligaba a editar un
     literal en el código (estatus:3823, siete placas).
     ====================================================================== */
  function tareasDe(plan, unidad) {
    var p = plan || {};
    var base = (p._todas || p.todas || []).slice();
    var pl = placa(unidad && (unidad.placa || unidad));
    var propias = p[pl] || [];
    // Una tarea propia con el mismo sistema+tarea PISA la de flota: así un
    // camión con intervalo especial se declara una vez y no dos veces.
    var idx = {};
    base.forEach(function (t, i) { idx[llaveTarea(t)] = i; });
    propias.forEach(function (t) {
      var k = llaveTarea(t);
      if (idx[k] !== undefined) base[idx[k]] = t; else base.push(t);
    });
    return base;
  }
  function llaveTarea(t) {
    return String(t.sistema || "").toUpperCase().trim() + "|" + String(t.tarea || "").toUpperCase().trim();
  }

  // Deriva el MP programado. Para cada unidad activa y cada tarea del plan:
  // busca la última ejecución de esa tarea, y calcula el vencimiento por
  // kilómetros y por días. Vence lo que ocurra PRIMERO.
  //
  // `kmDia` es el rodaje promedio de la unidad. Si no viene, se estima con
  // el historial de odómetros; si tampoco hay historial, se deja el
  // vencimiento por km sin fecha estimada y se dice (`kmEstimado:false`) en
  // vez de inventar una. Un vencimiento inventado es peor que uno ausente:
  // se planifica sobre él.
  function programado(spec) {
    var s = spec || {};
    var plan = s.plan || {};
    var unidades = (s.unidades || []).filter(function (u) {
      return String(u.estado || "").toUpperCase() !== "BAJA";
    });
    var ejec = s.ejecutados || [];
    var hoy = s.hasta || s.hoy || "";
    var dHoy = dia(hoy);
    var filas = [];

    unidades.forEach(function (u) {
      var pl = placa(u.placa);
      var tareas = tareasDe(plan, u);
      var odoActual = num(u.odometro);
      var kmDia = num(u.kmDia);
      if (kmDia === null) kmDia = rodajeEstimado(pl, s.odometros || ejec);

      tareas.forEach(function (t) {
        var ult = ultimaEjecucion(ejec, pl, t);
        var venceKm = null, venceDia = null, estimadoKm = false;

        if (t.cadaKm && ult && num(ult.odometro) !== null) {
          venceKm = num(ult.odometro) + num(t.cadaKm);
        } else if (t.cadaKm && odoActual !== null && !ult) {
          // Nunca se le hizo: vence desde el odómetro actual.
          venceKm = odoActual + num(t.cadaKm);
        }
        if (t.cadaDias) {
          var base = ult ? dia(ult.fecha) : dHoy;
          if (base !== null) venceDia = base + num(t.cadaDias);
        }
        // Fecha estimada del vencimiento por kilómetros.
        var fechaKm = null;
        if (venceKm !== null && odoActual !== null && kmDia && kmDia > 0 && dHoy !== null) {
          fechaKm = dHoy + Math.round((venceKm - odoActual) / kmDia);
          estimadoKm = true;
        }
        var vence = menorFecha(venceDia, fechaKm);
        filas.push({
          placa: pl,
          unidad: u.descripcion || u.tipo || "",
          sistema: t.sistema || "",
          tarea: t.tarea || "",
          cadaKm: t.cadaKm || null,
          cadaDias: t.cadaDias || null,
          ultimaFecha: ult ? (N() ? N().NF(ult.fecha) : ult.fecha) : "",
          ultimoOdometro: ult ? num(ult.odometro) : null,
          odometroActual: odoActual,
          venceOdometro: venceKm,
          kmRestantes: (venceKm !== null && odoActual !== null) ? r2(venceKm - odoActual) : null,
          venceFecha: deDia(vence),
          diasRestantes: (vence !== null && dHoy !== null) ? vence - dHoy : null,
          fechaKmEstimada: estimadoKm,
          estado: estadoVencimiento(vence, dHoy, venceKm, odoActual, s.avisoDias, s.avisoKm),
          // Trazabilidad de por qué esta fila existe. Si el cliente pregunta
          // "¿de dónde salió esta tarea?", la respuesta está en la fila.
          origen: (plan[pl] || []).some(function (x) { return llaveTarea(x) === llaveTarea(t); }) ? "unidad" : "flota"
        });
      });
    });

    filas.sort(function (a, b) {
      var pa = prioridad(a.estado), pb = prioridad(b.estado);
      if (pa !== pb) return pb - pa;
      var da = a.diasRestantes === null ? 99999 : a.diasRestantes;
      var db = b.diasRestantes === null ? 99999 : b.diasRestantes;
      if (da !== db) return da - db;
      return a.placa < b.placa ? -1 : 1;
    });
    return filas;
  }

  function prioridad(e) { return e === "VENCIDO" ? 3 : (e === "POR VENCER" ? 2 : (e === "AL DÍA" ? 1 : 0)); }

  function estadoVencimiento(venceDia, dHoy, venceKm, odo, avisoDias, avisoKm) {
    var aD = avisoDias !== undefined ? avisoDias : 15;
    var aK = avisoKm !== undefined ? avisoKm : 1000;
    var vencido = false, porVencer = false, hayDato = false;
    if (venceDia !== null && dHoy !== null) {
      hayDato = true;
      if (venceDia < dHoy) vencido = true; else if (venceDia - dHoy <= aD) porVencer = true;
    }
    if (venceKm !== null && odo !== null) {
      hayDato = true;
      if (odo > venceKm) vencido = true; else if (venceKm - odo <= aK) porVencer = true;
    }
    if (!hayDato) return "SIN DATO";
    return vencido ? "VENCIDO" : (porVencer ? "POR VENCER" : "AL DÍA");
  }

  function menorFecha(a, b) {
    if (a === null || a === undefined) return (b === undefined ? null : b);
    if (b === null || b === undefined) return a;
    return Math.min(a, b);
  }

  function ultimaEjecucion(ejec, pl, tarea) {
    var k = llaveTarea(tarea), mejor = null, mejorD = null;
    (ejec || []).forEach(function (e) {
      if (placa(e.placa) !== pl) return;
      if (llaveTarea(e) !== k) return;
      var d = dia(e.fecha);
      if (d === null) return;
      if (mejorD === null || d > mejorD) { mejorD = d; mejor = e; }
    });
    return mejor;
  }

  // Rodaje promedio km/día a partir de lecturas de odómetro de esa placa.
  function rodajeEstimado(pl, lecturas) {
    var pts = (lecturas || []).filter(function (x) {
      return placa(x.placa) === pl && dia(x.fecha) !== null && num(x.odometro) !== null;
    }).map(function (x) { return { d: dia(x.fecha), o: num(x.odometro) }; })
      .sort(function (a, b) { return a.d - b.d; });
    if (pts.length < 2) return null;
    var dd = pts[pts.length - 1].d - pts[0].d;
    var dk = pts[pts.length - 1].o - pts[0].o;
    if (dd <= 0 || dk <= 0) return null;
    return r2(dk / dd);
  }

  /* ======================================================================
     6. LOS CUATRO ENTREGABLES
     ----------------------------------------------------------------------
     Cada hoja devuelve { id, titulo, columnas, filas, motivo, aviso }.
     REGLA DURA: si filas está vacío, motivo NO puede estar vacío. La función
     `entregables()` lo verifica antes de devolver y, si alguna hoja vacía se
     quedó sin motivo, lo marca como defecto del propio motor. Esa es la
     salvaguarda contra el retorno de entregables.js:191.
     ====================================================================== */
  var COLS = {
    correctivos: ["OT", "Placa", "Sistema", "Falla", "Fecha falla", "Fecha cierre", "Días", "Costo S/", "Estado"],
    neumaticos:  ["Placa", "Posición", "Marca", "Medida", "L1 mm", "L2 mm", "L3 mm", "Mínimo mm", "Estado", "Lecturas"],
    mpEjecutado: ["OT", "Placa", "Sistema", "Tarea", "Fecha", "Odómetro", "Costo S/", "Responsable"],
    mpProgramado:["Placa", "Sistema", "Tarea", "Cada km", "Cada días", "Última", "Odóm. actual", "Vence odóm.", "Km restantes", "Vence", "Días restantes", "Estado", "Origen"]
  };

  function enRango(f, desde, hasta) {
    var d = dia(f);
    if (d === null) return false;
    if (desde && dia(desde) !== null && d < dia(desde)) return false;
    if (hasta && dia(hasta) !== null && d > dia(hasta)) return false;
    return true;
  }

  function hojaCorrectivos(s) {
    var fuente = (s.fallas || []).filter(function (f) { return !f.historico; });
    var filas = fuente.filter(function (f) { return enRango(f.fecha, s.desde, s.hasta); })
      .sort(function (a, b) { return (dia(b.fecha) || 0) - (dia(a.fecha) || 0); })
      .map(function (f) {
        return [f.ot || f.id || "", placa(f.placa), f.sistema || "", f.descripcion || f.falla || "",
                N() ? N().NF(f.fecha) : f.fecha, f.fechaCierre ? (N() ? N().NF(f.fechaCierre) : f.fechaCierre) : "",
                f.fechaCierre ? duracion(f, f.fechaCierre) : null,
                num(f.costo), f.estado || (f.fechaCierre ? "CERRADA" : "ABIERTA")];
      });
    return hoja("correctivos", "Correctivos", COLS.correctivos, filas,
      !fuente.length ? "No hay fallas registradas en el módulo de mantenimiento."
                     : (!filas.length ? "Hay " + fuente.length + " fallas registradas, pero ninguna dentro del rango " + (s.desde || "…") + " a " + (s.hasta || "…") + "." : ""));
  }

  function hojaNeumaticos(s) {
    var unidades = (s.unidades || []).filter(function (u) { return String(u.estado || "").toUpperCase() !== "BAJA"; });
    var lect = s.neumaticos || [];
    var porClave = {};
    lect.forEach(function (l) { porClave[placa(l.placa) + "|" + String(l.posicion || "").toUpperCase()] = l; });

    var filas = [], sinLectura = 0;
    unidades.forEach(function (u) {
      posiciones(u).forEach(function (pos) {
        var l = porClave[placa(u.placa) + "|" + pos] || {};
        var e = estadoNeumatico([l.l1, l.l2, l.l3]);
        if (e.estado === "SIN DATO") sinLectura++;
        filas.push([placa(u.placa), pos, l.marca || "", l.medida || "",
                    num(l.l1), num(l.l2), num(l.l3), e.mm, e.estado, e.lecturas]);
      });
    });
    // La matriz se emite COMPLETA: una fila por posición existente aunque no
    // haya lectura. Ese hueco es justamente el entregable — le dice al taller
    // qué le falta medir. Emitir solo lo medido oculta lo no medido.
    var h = hoja("neumaticos", "Matriz de neumáticos", COLS.neumaticos, filas,
      !unidades.length ? "No hay unidades activas en el maestro de flota." : "");
    if (sinLectura) h.aviso = sinLectura + " de " + filas.length + " posiciones no tienen ninguna lectura de profundidad.";
    return h;
  }

  function hojaMpEjecutado(s) {
    var fuente = (s.ejecutados || []).filter(function (e) { return !e.historico; });
    var filas = fuente.filter(function (e) { return enRango(e.fecha, s.desde, s.hasta); })
      .sort(function (a, b) { return (dia(b.fecha) || 0) - (dia(a.fecha) || 0); })
      .map(function (e) {
        return [e.ot || e.id || "", placa(e.placa), e.sistema || "", e.tarea || "",
                N() ? N().NF(e.fecha) : e.fecha, num(e.odometro), num(e.costo), e.responsable || ""];
      });
    return hoja("mpEjecutado", "MP Ejecutado", COLS.mpEjecutado, filas,
      !fuente.length ? "No hay mantenimientos preventivos ejecutados registrados."
                     : (!filas.length ? "Hay " + fuente.length + " ejecuciones registradas, pero ninguna dentro del rango " + (s.desde || "…") + " a " + (s.hasta || "…") + "." : ""));
  }

  function hojaMpProgramado(s) {
    var unidades = (s.unidades || []).filter(function (u) { return String(u.estado || "").toUpperCase() !== "BAJA"; });
    var plan = s.plan || {};
    var conPlan = unidades.filter(function (u) { return tareasDe(plan, u).length > 0; });
    var filas = programado({
      plan: plan, unidades: unidades, ejecutados: s.ejecutados || [],
      odometros: s.odometros || s.ejecutados || [], hasta: s.hasta || s.hoy,
      avisoDias: s.avisoDias, avisoKm: s.avisoKm
    }).map(function (f) {
      return [f.placa, f.sistema, f.tarea, f.cadaKm, f.cadaDias, f.ultimaFecha, f.odometroActual,
              f.venceOdometro, f.kmRestantes, f.venceFecha, f.diasRestantes, f.estado, f.origen];
    });
    // El motivo es explícito y distingue los DOS casos que en el sistema de origen se veían
    // idénticos (hoja en blanco): no hay flota, o hay flota y no hay plan.
    var motivo = "";
    if (!unidades.length) motivo = "No hay unidades activas en el maestro de flota.";
    else if (!conPlan.length) motivo = "Hay " + unidades.length + " unidades activas pero ninguna tiene tareas en el plan preventivo. Configure config/<empresa>__plan_preventivo (clave _todas para toda la flota).";
    return hoja("mpProgramado", "MP Programado", COLS.mpProgramado, filas, filas.length ? "" : motivo);
  }

  function hoja(id, titulo, columnas, filas, motivo) {
    return { id: id, titulo: titulo, columnas: columnas, filas: filas || [], motivo: (filas && filas.length) ? "" : (motivo || ""), aviso: "" };
  }

  function entregables(spec) {
    var s = spec || {};
    var hojas = [hojaCorrectivos(s), hojaNeumaticos(s), hojaMpEjecutado(s), hojaMpProgramado(s)];
    var defectos = [];
    hojas.forEach(function (h) {
      // La salvaguarda: ninguna hoja vacía sin explicación. Si esto salta, el
      // defecto es de este motor, no de los datos, y hay que arreglarlo aquí.
      if (!h.filas.length && !h.motivo) {
        h.motivo = "Hoja vacía sin motivo declarado — defecto del motor de entregables.";
        defectos.push(h.id);
      }
    });
    return {
      hojas: hojas,
      vacias: hojas.filter(function (h) { return !h.filas.length; }).map(function (h) { return h.id; }),
      defectos: defectos,
      // Resumen de una línea para imprimir al pie del archivo y en el log.
      firma: hojas.map(function (h) { return h.titulo + ": " + h.filas.length; }).join(" · ")
    };
  }

  global.TRAZZA = global.TRAZZA || {};
  global.TRAZZA.mantenimiento = {
    umbrales: umbrales,
    estadoNeumatico: estadoNeumatico,
    posiciones: posiciones,
    puedeCerrar: puedeCerrar,
    duracion: duracion,
    codigoOT: codigoOT,
    campoContador: campoContador,
    causales: causales,
    tareasDe: tareasDe,
    programado: programado,
    entregables: entregables,
    COLUMNAS: COLS,
    _dia: dia,
    _deDia: deDia
  };
})(window);
