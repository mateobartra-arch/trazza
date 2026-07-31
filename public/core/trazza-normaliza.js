/* ==========================================================================
   TRAZZA — Normalización (una sola función por tipo de clave)
   --------------------------------------------------------------------------
   POR QUÉ EXISTE
   El changelog del sistema de origen cierra con esta línea: "Normalización de placas a
   AAA-000 antes de comparar/cruzar (una sola función NP())". No es un
   detalle cosmético. En el sistema de origen la misma unidad aparecía escrita como
   "ABC-123", "ABC123", "abc 123" y " ABC-123 " según quién la tecleó y en
   qué pantalla. Cada variante es una placa distinta para Firestore, así que
   los gastos de un camión se repartían entre cuatro "camiones" y el módulo
   de utilidad los daba por huérfanos. Eso fue exactamente lo que la
   auditoría de consistencia del punto 7 tuvo que salir a cazar.

   La regla del núcleo es: NINGÚN cruce entre colecciones se hace sobre el
   texto que tecleó el usuario. Se normaliza al escribir (trazza-db.guardar
   lo aplica sobre los campos declarados como clave) y se normaliza otra vez
   al comparar. Si las dos puntas normalizan con la MISMA función, el cruce
   es exacto por construcción y el módulo de consistencia deja de encontrar
   huérfanos fantasma.

   Las claves normalizadas del sistema son tres: placa (une unidades con
   viajes, gastos, fallas y neumáticos), DNI (une personas con roster,
   boletas, asistencia y entregas de EPP) y periodo YYYY-MM (une cualquier
   movimiento con los parámetros de costo vigentes ese mes).
   ========================================================================== */
(function (global) {

  // ---- Texto base: sin acentos, sin dobles espacios, sin bordes ----------
  // Se usa para comparar nombres cuando NO hay clave dura disponible (el
  // cruce por nombre del punto 6 del changelog: importar entregas de EPP
  // históricas y completar DNI/cargo contra el maestro de Personas). Cruzar
  // por nombre siempre es el último recurso, nunca el primero.
  function texto(v) {
    return String(v == null ? "" : v)
      .normalize("NFD").replace(/[̀-ͯ]/g, "")   // quita tildes
      .replace(/\s+/g, " ")
      .trim();
  }

  function clave(v) {
    return texto(v).toUpperCase();
  }

  // ---- NP(): placa peruana a la forma canónica AAA-000 -------------------
  // Acepta "abc123", "ABC 123", "abc-123", "A1B-234". Devuelve "" si lo que
  // llega no puede ser una placa: devolver "" es deliberado, porque un "" es
  // detectable por el módulo de consistencia como campo obligatorio vacío,
  // mientras que devolver la basura original la propaga silenciosamente.
  function NP(v) {
    var s = clave(v).replace(/[^A-Z0-9]/g, "");
    if (s.length < 6) return "";
    // Las placas peruanas de carga son 3 caracteres + 3 dígitos. Los remolques
    // y algunos históricos traen sufijos; se conservan los 6 primeros.
    var izq = s.slice(0, 3), der = s.slice(3, 6);
    if (!/^[A-Z0-9]{3}$/.test(izq) || !/^[0-9]{3}$/.test(der)) return "";
    return izq + "-" + der;
  }

  // ---- DNI: 8 dígitos, con ceros a la izquierda conservados --------------
  // Excel se come el cero inicial de los DNI que empiezan en 0 y los
  // convierte en números de 7 dígitos. Cualquier importación desde hoja de
  // cálculo pasa por aquí antes de tocar la base.
  function ND(v) {
    var s = String(v == null ? "" : v).replace(/\D/g, "");
    if (!s) return "";
    if (s.length > 8) s = s.slice(-8);
    while (s.length < 8) s = "0" + s;
    return s;
  }

  // ---- RUC: 11 dígitos ---------------------------------------------------
  function NR(v) {
    var s = String(v == null ? "" : v).replace(/\D/g, "");
    return s.length === 11 ? s : "";
  }

  // ---- Fecha del hecho: siempre ISO YYYY-MM-DD ---------------------------
  // Acepta Date, Timestamp de Firestore, "31/07/2026", "2026-07-31" y
  // "31-07-2026". Devuelve "" si no se puede interpretar. NO inventa la
  // fecha de hoy cuando falla: un movimiento sin fecha del hecho tiene que
  // salir en el reporte de consistencia, no colarse fechado hoy.
  function NF(v) {
    if (!v && v !== 0) return "";
    if (v && typeof v.toDate === "function") v = v.toDate();          // Timestamp
    if (v instanceof Date && !isNaN(v)) {
      return v.getFullYear() + "-" + dos(v.getMonth() + 1) + "-" + dos(v.getDate());
    }
    var s = String(v).trim();
    var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return m[1] + "-" + dos(m[2]) + "-" + dos(m[3]);
    m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (m) return m[3] + "-" + dos(m[2]) + "-" + dos(m[1]);
    return "";
  }

  function dos(n) { n = String(n); return n.length < 2 ? "0" + n : n; }

  // ---- Periodo YYYY-MM: la clave con la que se buscan los parámetros -----
  // Ver trazza-params.js: todo parámetro de costo (tipo de cambio, tarifa,
  // mantenimiento preventivo del mes, alquiler) se resuelve por el periodo
  // de la FECHA DEL HECHO, no por el mes en que alguien abre la pantalla.
  function NPer(v) {
    var f = NF(v);
    if (f) return f.slice(0, 7);
    var s = String(v == null ? "" : v).trim();
    return /^\d{4}-\d{2}$/.test(s) ? s : "";
  }

  // ---- Número/monto: tolera "S/ 1,234.50", "1.234,50" y espacios ---------
  // Devuelve null (no 0) cuando no hay número. La diferencia importa: 0 es
  // un costo declarado como cero; null es un costo que nadie registró, y el
  // módulo de consistencia los tiene que distinguir.
  function NN(v) {
    if (v === 0) return 0;
    if (typeof v === "number") return isFinite(v) ? v : null;
    var s = String(v == null ? "" : v).replace(/[^\d,.\-]/g, "").trim();
    if (!s) return null;
    // Si hay coma y punto, el último separador que aparece es el decimal.
    var iC = s.lastIndexOf(","), iP = s.lastIndexOf(".");
    if (iC >= 0 && iP >= 0) {
      if (iC > iP) s = s.replace(/\./g, "").replace(",", ".");
      else s = s.replace(/,/g, "");
    } else if (iC >= 0) {
      s = (s.match(/,/g) || []).length === 1 && s.length - iC <= 3
        ? s.replace(",", ".")            // "1234,50" -> decimal
        : s.replace(/,/g, "");           // "1,234"   -> millar
    }
    var n = parseFloat(s);
    return isFinite(n) ? n : null;
  }

  // ---- Qué campo normaliza con qué función ------------------------------
  // trazza-db.js lee este mapa antes de escribir. Añadir un campo aquí lo
  // normaliza en TODO el sistema de golpe; ese es el punto de tener una
  // sola función por tipo de clave y no una limpieza ad hoc por pantalla.
  var CAMPOS = {
    placa: NP, placaTracto: NP, placaTolva: NP, placaCarreta: NP, unidad: NP,
    dni: ND, dniConductor: ND, dniCopiloto: ND, dniResponsable: ND,
    ruc: NR,
    fecha: NF, fechaFalla: NF, fechaCierre: NF, fechaSalida: NF, fechaLlegada: NF,
    periodo: NPer
  };

  // Normaliza in place los campos conocidos de un documento y devuelve el
  // mismo objeto. No toca los campos que no están en CAMPOS.
  function documento(doc) {
    if (!doc) return doc;
    for (var k in CAMPOS) {
      if (CAMPOS.hasOwnProperty(k) && doc.hasOwnProperty(k) && doc[k] !== undefined) {
        doc[k] = CAMPOS[k](doc[k]);
      }
    }
    return doc;
  }

  global.TRAZZA = global.TRAZZA || {};
  global.TRAZZA.norm = {
    texto: texto, clave: clave,
    NP: NP, ND: ND, NR: NR, NF: NF, NPer: NPer, NN: NN,
    CAMPOS: CAMPOS, documento: documento
  };
})(window);
