/* ==========================================================================
   TRAZZA — Consistencia de maestros (calidad de dato por tenant)
   --------------------------------------------------------------------------
   POR QUÉ EXISTE
   El punto 7 del changelog describe una auditoría hecha a mano sobre los
   datos de MISAGI: placas huérfanas, GNL cargado a una unidad que no es GNL,
   tipos de lavado fuera de catálogo, MTC duplicados, registros sin fecha ni
   costo. Y cierra con la frase que decide la prioridad de este archivo:
   "Es de lo más valioso para un producto multi-cliente (calidad de datos por
   tenant)".

   Hay una ironía en el changelog que conviene no repetir: el punto 3 retira
   del portal el módulo "Consistencia de maestros" justo cuando el punto 7
   demuestra para qué servía. En un sistema de una sola empresa se puede
   auditar a mano una vez al año. En un producto con veinte clientes, la
   calidad del dato ajeno es el principal riesgo operativo: el cliente no
   dice "mis datos están sucios", dice "tu sistema da mal el número".

   QUÉ HACE
   Cruza cada colección de movimientos contra sus maestros y devuelve
   hallazgos. NO corrige nada. Corregir en automático es cómo se pierde
   información real: si una placa no existe en el maestro puede ser que esté
   mal escrita, o puede ser que sea una unidad nueva que nadie dio de alta, y
   el sistema no puede distinguirlo. Reporta, propone, y la persona decide.

   SEIS FAMILIAS DE HALLAZGO
     huerfano       la clave del movimiento no existe en el maestro
     duplicado      dos maestros comparten un identificador declarado único
     catalogo       un campo tiene un valor fuera de su lista permitida
     obligatorio    falta un campo sin el cual el registro no computa
     incompatible   el movimiento contradice un atributo del maestro
                    (GNL cargado a una unidad que no es GNL)
     rango          un número está fuera del rango plausible
                    (el guardarraíl del Capture Router: rendimiento imposible,
                     precio unitario fuera de banda, odómetro hacia atrás)

   SEVERIDAD
     bloqueante  el número del reporte está mal por esto
     revisar     probablemente está mal, hay que mirarlo
     aviso       no afecta a ningún cálculo, ensucia la vista

   Nada de esto bloquea la captura. Igual que el Capture Router: el gasto se
   guarda con revisar:true y un motivo. Un sistema que no deja registrar lo
   que pasó en la realidad hace que la gente registre otra cosa.
   ========================================================================== */
(function (global) {

  function N() { return (global.TRAZZA && global.TRAZZA.norm) || null; }

  var SEV = { bloqueante: 3, revisar: 2, aviso: 1 };

  function hallazgo(tipo, sev, coleccion, id, campo, valor, mensaje, sugerencia) {
    return {
      tipo: tipo, severidad: sev, sevN: SEV[sev] || 0,
      coleccion: coleccion, id: id, campo: campo, valor: valor,
      mensaje: mensaje, sugerencia: sugerencia || null
    };
  }

  // ---- Índice de un maestro por su clave natural -------------------------
  // El maestro se indexa con la MISMA función de normalización con la que se
  // escribió el movimiento. Si las dos puntas no normalizan igual, esta
  // auditoría inventa huérfanos que no existen, que es peor que no auditar:
  // el cliente pierde la confianza en el auditor y deja de mirarlo.
  function indice(docs, campoClave, normFn) {
    var ix = {}, dups = [];
    (docs || []).forEach(function (d) {
      var k = normFn ? normFn(d[campoClave]) : String(d[campoClave] || "");
      if (!k) return;
      if (ix[k]) dups.push({ clave: k, a: ix[k], b: d });
      else ix[k] = d;
    });
    return { por: ix, duplicados: dups };
  }

  // ---- Distancia de edición acotada --------------------------------------
  // Solo se usa para SUGERIR, nunca para corregir. Una placa huérfana a
  // distancia 1 de una del maestro es casi siempre un dedazo ("ABC-123" vs
  // "ABC-132"); a distancia 3 ya no se sugiere nada, porque una sugerencia
  // mala es peor que ninguna: la gente la acepta sin mirar.
  function cerca(clave, candidatas, maxD) {
    maxD = maxD || 1;
    var mejor = null, mejorD = maxD + 1;
    for (var i = 0; i < candidatas.length; i++) {
      var d = lev(clave, candidatas[i], maxD);
      if (d < mejorD) { mejorD = d; mejor = candidatas[i]; }
    }
    return mejorD <= maxD ? mejor : null;
  }

  function lev(a, b, corte) {
    a = String(a); b = String(b);
    if (Math.abs(a.length - b.length) > corte) return corte + 1;
    var prev = [], cur = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur[0] = i; var min = cur[0];
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < min) min = cur[j];
      }
      if (min > corte) return corte + 1;
      prev = cur.slice();
    }
    return prev[b.length];
  }

  /* ------------------------------------------------------------------------
     auditar(spec) — el motor
     ------------------------------------------------------------------------
     spec = {
       coleccion: "gastos",
       movimientos: [ {...}, ... ],
       maestros: {
         unidades: { docs:[...], clave:"placa", norm:NP, unicos:["mtc"],
                     atributos:{ gnl:"esGNL" } },
         personas: { docs:[...], clave:"dni",   norm:ND }
       },
       reglas: {
         referencias: [ { campo:"placa", maestro:"unidades" },
                        { campo:"dni",   maestro:"personas", opcional:true } ],
         obligatorios: ["fecha","placa","costo"],
         catalogos:    { tipoLavado:["INTERIOR","EXTERIOR","COMPLETO"] },
         incompatibles:[ { cuando:{campo:"rubro", igual:"GNL"},
                           exige:{maestro:"unidades", atributo:"gnl", valor:true},
                           mensaje:"GNL cargado a una unidad que no es GNL" } ],
         rangos:       { precioUnit:{min:1, max:30},
                         rendimiento:{min:1.2, max:12} }
       },
       excluirHistorico: true,   // por defecto sí: el histórico no computa
       excluirBaja: false        // las bajas SÍ se auditan (una baja mal puesta
                                 // es justo lo que hay que ver)
     }
     ------------------------------------------------------------------------ */
  function auditar(spec) {
    spec = spec || {};
    var out = [];
    var col = spec.coleccion || "movimientos";
    var reglas = spec.reglas || {};
    var maestros = spec.maestros || {};
    var n = N();

    // ---- Índices de maestros + duplicados de clave e identificadores únicos
    var ix = {};
    for (var mk in maestros) {
      if (!maestros.hasOwnProperty(mk)) continue;
      var m = maestros[mk];
      var r = indice(m.docs, m.clave, m.norm);
      ix[mk] = { def: m, por: r.por, claves: Object.keys(r.por) };

      r.duplicados.forEach(function (d) {
        out.push(hallazgo("duplicado", "bloqueante", mk, d.clave, m.clave, d.clave,
          "Dos registros del maestro comparten la clave " + d.clave +
          ". Los movimientos se van a enganchar a uno solo, elegido al azar.",
          "Fusionar los dos registros o corregir la clave del que esté mal."));
      });

      // identificadores declarados únicos (el MTC repetido del punto 7)
      (m.unicos || []).forEach(function (campo) {
        var vistos = {};
        (m.docs || []).forEach(function (d) {
          var v = n ? n.clave(d[campo]) : String(d[campo] || "");
          if (!v) return;
          if (vistos[v]) {
            out.push(hallazgo("duplicado", "revisar", mk, String(d[m.clave] || ""), campo, v,
              "El identificador único '" + campo + "' = " + v + " está en " +
              vistos[v] + " y también aquí.",
              "Un documento no puede pertenecer a dos unidades: uno de los dos está mal copiado."));
          } else {
            vistos[v] = String(d[m.clave] || "");
          }
        });
      });
    }

    // ---- Recorrido de movimientos ---------------------------------------
    var movs = spec.movimientos || [];
    var excH = spec.excluirHistorico !== false;

    movs.forEach(function (mv) {
      if (!mv) return;
      if (excH && mv.historico === true) return;
      if (spec.excluirBaja && String(mv.estado || "").toLowerCase() === "baja") return;
      var id = String(mv.id || mv._id || "(sin id)");

      // obligatorios ------------------------------------------------------
      (reglas.obligatorios || []).forEach(function (campo) {
        var v = mv[campo];
        var vacio = (v === undefined || v === null || String(v).trim() === "");
        // un 0 declarado NO es un vacío; un null sí. Esa es la razón de que
        // trazza-normaliza.NN() devuelva null y no 0 cuando no hay número.
        if (vacio) {
          out.push(hallazgo("obligatorio", "bloqueante", col, id, campo, null,
            "Falta '" + campo + "'. El registro no puede computar en ningún reporte.",
            campo === "fecha"
              ? "Sin fecha del hecho no se le puede aplicar el parámetro del periodo ni ordenarlo."
              : null));
        }
      });

      // referencias a maestros --------------------------------------------
      (reglas.referencias || []).forEach(function (ref) {
        var def = ix[ref.maestro];
        if (!def) return;
        var crudo = mv[ref.campo];
        if ((crudo === undefined || crudo === null || String(crudo).trim() === "")) {
          return; // lo cubre 'obligatorios' si lo es
        }
        var k = def.def.norm ? def.def.norm(crudo) : String(crudo);
        if (!k) {
          out.push(hallazgo("obligatorio", "bloqueante", col, id, ref.campo, crudo,
            "'" + crudo + "' no tiene la forma de " + ref.campo + " válida, así que no cruza con ningún maestro.",
            "Corregir el formato; el normalizador devolvió vacío a propósito en vez de propagar el error."));
          return;
        }
        if (!def.por[k]) {
          var sug = cerca(k, def.claves, 1);
          out.push(hallazgo("huerfano", ref.opcional ? "revisar" : "bloqueante", col, id, ref.campo, k,
            k + " no existe en el maestro de " + ref.maestro + ". Todo lo que se gaste aquí queda fuera de los totales por unidad.",
            sug ? ("¿Quiso decir " + sug + "? Están a un carácter.")
                : "O es una unidad nueva sin dar de alta, o la clave está mal escrita. El sistema no puede decidirlo."));
        }
      });

      // catálogos cerrados -------------------------------------------------
      var cats = reglas.catalogos || {};
      for (var cc in cats) {
        if (!cats.hasOwnProperty(cc)) continue;
        var val = mv[cc];
        if (val === undefined || val === null || String(val).trim() === "") continue;
        var permitidos = (cats[cc] || []).map(function (x) { return n ? n.clave(x) : String(x).toUpperCase(); });
        var vv = n ? n.clave(val) : String(val).toUpperCase();
        if (permitidos.indexOf(vv) === -1) {
          out.push(hallazgo("catalogo", "revisar", col, id, cc, val,
            "'" + val + "' no está en el catálogo de " + cc + " (" + permitidos.join(", ") + ").",
            "O se amplía el catálogo en config, o el registro está mal tipeado. Un '?' guardado es un dato que nadie va a poder agrupar."));
        }
      }

      // incompatibilidades con atributos del maestro ------------------------
      (reglas.incompatibles || []).forEach(function (inc) {
        var cuando = inc.cuando || {};
        var vCampo = n ? n.clave(mv[cuando.campo]) : String(mv[cuando.campo] || "").toUpperCase();
        var esperado = n ? n.clave(cuando.igual) : String(cuando.igual || "").toUpperCase();
        if (vCampo !== esperado) return;
        var ex = inc.exige || {};
        var def2 = ix[ex.maestro];
        if (!def2) return;
        var refCampo = ex.campoRef || def2.def.clave;
        var k2 = def2.def.norm ? def2.def.norm(mv[refCampo]) : String(mv[refCampo] || "");
        var doc = def2.por[k2];
        if (!doc) return;                                  // ya reportado como huérfano
        var attr = (def2.def.atributos && def2.def.atributos[ex.atributo]) || ex.atributo;
        if (doc[attr] !== ex.valor) {
          out.push(hallazgo("incompatible", "bloqueante", col, id, cuando.campo, mv[cuando.campo],
            inc.mensaje || ("El movimiento contradice el atributo '" + attr + "' de " + k2 + "."),
            "O el maestro está desactualizado, o el gasto se cargó a la unidad equivocada. Las dos cosas cambian el número."));
        }
      });

      // rangos plausibles (guardarraíles) -----------------------------------
      var rangos = reglas.rangos || {};
      for (var rc in rangos) {
        if (!rangos.hasOwnProperty(rc)) continue;
        var num = n ? n.NN(mv[rc]) : parseFloat(mv[rc]);
        if (num === null || num === undefined || isNaN(num)) continue;
        var rg = rangos[rc];
        if ((rg.min !== undefined && num < rg.min) || (rg.max !== undefined && num > rg.max)) {
          out.push(hallazgo("rango", "revisar", col, id, rc, num,
            rc + " = " + num + " está fuera del rango esperado (" +
            (rg.min !== undefined ? rg.min : "−∞") + " a " + (rg.max !== undefined ? rg.max : "∞") + ").",
            rg.motivo || "Puede ser un error de tipeo, una unidad de medida distinta, o un hecho real que hay que explicar."));
        }
      }
    });

    return ordenar(out);
  }

  // ---- Auditoría de secuencia: el odómetro que va hacia atrás -------------
  // No es un cruce contra maestro sino contra el registro ANTERIOR de la
  // misma unidad. Se separa porque necesita ordenar por fecha del hecho, que
  // es justo el punto 2 del changelog: si esto se ordenara por fecha de
  // captura, un registro subido tarde haría saltar la alarma en el registro
  // correcto y no en el atrasado.
  function auditarSecuencia(movs, opts) {
    opts = opts || {};
    var campoClave = opts.clave || "placa";
    var campoValor = opts.valor || "odometro";
    var col = opts.coleccion || "movimientos";
    var n = N();
    var maxSalto = opts.maxSalto || null;
    var porClave = {};

    (movs || []).forEach(function (m) {
      if (!m || m.historico === true) return;
      var k = n ? n.NP(m[campoClave]) : String(m[campoClave] || "");
      var f = n ? n.NF(m.fecha) : String(m.fecha || "");
      var v = n ? n.NN(m[campoValor]) : parseFloat(m[campoValor]);
      if (!k || !f || v === null || v === undefined || isNaN(v)) return;
      (porClave[k] = porClave[k] || []).push({ id: String(m.id || "(sin id)"), f: f, v: v, _ts: m._ts });
    });

    var out = [];
    for (var k in porClave) {
      if (!porClave.hasOwnProperty(k)) continue;
      var arr = porClave[k].sort(function (a, b) {
        if (a.f !== b.f) return a.f < b.f ? -1 : 1;                      // fecha del hecho
        return (segs(a._ts) - segs(b._ts));                              // captura solo desempata
      });
      for (var i = 1; i < arr.length; i++) {
        if (arr[i].v < arr[i - 1].v) {
          out.push(hallazgo("rango", "revisar", col, arr[i].id, campoValor, arr[i].v,
            k + ": el " + campoValor + " del " + arr[i].f + " (" + arr[i].v + ") es menor que el del " +
            arr[i - 1].f + " (" + arr[i - 1].v + ").",
            "O el número está mal tecleado, o los dos registros están cruzados de fecha, o cambió el tablero."));
        } else if (maxSalto && (arr[i].v - arr[i - 1].v) > maxSalto) {
          out.push(hallazgo("rango", "aviso", col, arr[i].id, campoValor, arr[i].v,
            k + ": salto de " + (arr[i].v - arr[i - 1].v) + " entre " + arr[i - 1].f + " y " + arr[i].f + ".",
            "Puede faltar un registro intermedio."));
        }
      }
    }
    return ordenar(out);
  }

  function segs(ts) { return (ts && ts.seconds) ? ts.seconds : 0; }

  // ---- Presentación ------------------------------------------------------
  function ordenar(list) {
    return list.sort(function (a, b) {
      if (a.sevN !== b.sevN) return b.sevN - a.sevN;
      if (a.tipo !== b.tipo) return a.tipo < b.tipo ? -1 : 1;
      return String(a.id) < String(b.id) ? -1 : 1;
    });
  }

  // Resumen para la cabecera del módulo. El número que importa no es "cuántos
  // hallazgos" sino "cuántos registros están fuera de los totales", porque es
  // el que traduce calidad de dato a dinero mal contado.
  function resumen(hallazgos) {
    var r = { total: 0, bloqueante: 0, revisar: 0, aviso: 0, porTipo: {}, registrosAfectados: 0 };
    var regs = {};
    (hallazgos || []).forEach(function (h) {
      r.total++;
      r[h.severidad] = (r[h.severidad] || 0) + 1;
      r.porTipo[h.tipo] = (r.porTipo[h.tipo] || 0) + 1;
      if (h.severidad === "bloqueante") regs[h.coleccion + "/" + h.id] = 1;
    });
    r.registrosAfectados = Object.keys(regs).length;
    return r;
  }

  // Línea de texto plano para exportar a CSV o pegar en un correo al cliente.
  function linea(h) {
    return [h.severidad, h.tipo, h.coleccion, h.id, h.campo, h.valor, h.mensaje].join(" | ");
  }

  global.TRAZZA = global.TRAZZA || {};
  global.TRAZZA.consistencia = {
    auditar: auditar,
    auditarSecuencia: auditarSecuencia,
    indice: indice,
    resumen: resumen,
    linea: linea,
    lev: lev,
    cerca: cerca
  };
})(window);
