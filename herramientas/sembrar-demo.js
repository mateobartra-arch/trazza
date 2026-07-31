#!/usr/bin/env node
/* ==========================================================================
   TRAZZA — Ambiente de demostración [FICTICIO]
   --------------------------------------------------------------------------
   REGLA QUE ESTE ARCHIVO EXISTE PARA CUMPLIR

   Nunca se demuestra sobre datos reales de un cliente. Ni los del piloto, ni
   los del siguiente. No es una formalidad legal: es que una demo se enseña
   en una sala con gente de otras empresas, se graba, se comparte por correo
   y termina en un chat. Los sueldos, los DNI y las tarifas negociadas de una
   empresa no pueden viajar en una demo.

   Todo lo que siembra este script es inventado. Las placas no existen, los
   nombres no existen, las tarifas son de orden de magnitud plausible pero no
   son las de nadie. La empresa por defecto se llama `demo` justamente para
   que no se confunda con un tenant real ni un minuto.

   TAMBIÉN ES LA PRUEBA DE FUEGO DEL NÚCLEO
   Los datos están escogidos para que la pantalla tenga algo que decir:
     · un viaje ABIERTO (sin fecha de llegada) que sigue enganchando gastos
     · un viaje VACÍO, que cuesta y no factura — la cifra que nadie medía
     · un viaje en dólares, para que se vea el tipo de cambio fotografiado
     · un abastecimiento con rendimiento imposible, para que salte el
       guardarraíl con revisar:true en vez de bloquear la captura
     · un gasto huérfano, de una placa sin viaje en esa fecha
     · una tarifa que cambia a mitad de periodo, para que se vea que un viaje
       de junio se sigue liquidando con la tarifa de junio

   USO
     node herramientas/sembrar-demo.js [--empresa demo] [--servicio clave-servicio.json] [--borrar]

   --borrar limpia primero todo lo que tenga ese empresaId. Solo funciona si
   el empresaId contiene la palabra "demo": un borrado masivo no debe poder
   apuntar por accidente a un tenant de producción.
   ========================================================================== */
"use strict";

var fs = require("fs");

function arg(n, d) { var i = process.argv.indexOf("--" + n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; }
function tiene(n) { return process.argv.indexOf("--" + n) >= 0; }
function morir(m) { console.error("\n  ✕ " + m + "\n"); process.exit(1); }

var EMPRESA = arg("empresa", "demo");
var rutaSvc = arg("servicio", "clave-servicio.json");
var BORRAR = tiene("borrar");

if (BORRAR && EMPRESA.indexOf("demo") < 0) {
  morir("--borrar solo se permite si el empresaId contiene 'demo'. Este es '" + EMPRESA + "'.");
}
if (!fs.existsSync(rutaSvc)) morir("No encuentro " + rutaSvc + " (ver crear-admin.js para obtenerla).");

var admin;
try { admin = require("firebase-admin"); } catch (e) { morir("Falta firebase-admin. Corre:  npm install firebase-admin"); }
var svc = JSON.parse(fs.readFileSync(rutaSvc, "utf8"));
admin.initializeApp({ credential: admin.credential.cert(svc), projectId: svc.project_id });
var db = admin.firestore();

// ---- Utilidades de clave: espejo de trazza-normaliza.js -------------------
function NP(p) { return String(p || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^([A-Z]{3})(\d{3})$/, "$1-$2"); }
function clave() {
  return Array.prototype.slice.call(arguments).map(function (x) {
    return String(x || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-");
  }).join("_");
}
var base = { empresaId: EMPRESA, _por: "sembrar-demo.js", _demo: true };
function doc(extra) { var o = {}; for (var k in base) o[k] = base[k]; for (var j in extra) o[j] = extra[j]; return o; }

// ---- Maestros [FICTICIO] --------------------------------------------------
var UNIDADES = [
  { placa: "V7K-841", tipo: "TRACTO", marca: "Volvo",      modelo: "FH 460",  anio: 2019, estado: "OPERATIVO", encapsulado: true,  odometro: 412300 },
  { placa: "V7K-842", tipo: "TRACTO", marca: "Volvo",      modelo: "FH 460",  anio: 2019, estado: "OPERATIVO", encapsulado: true,  odometro: 398120 },
  { placa: "B2M-513", tipo: "TRACTO", marca: "Scania",     modelo: "R 450",   anio: 2021, estado: "OPERATIVO", encapsulado: false, odometro: 210940 },
  { placa: "B2M-514", tipo: "TRACTO", marca: "Scania",     modelo: "R 450",   anio: 2021, estado: "TALLER",    encapsulado: false, odometro: 205600 },
  { placa: "C9P-207", tipo: "TRACTO", marca: "Freightliner", modelo: "CA 126", anio: 2017, estado: "OPERATIVO", encapsulado: true, odometro: 588400 },
  { placa: "D4T-330", tipo: "TOLVA",  marca: "Randon",     modelo: "SR BA",   anio: 2020, estado: "OPERATIVO", encapsulado: false, odometro: 0 },
  { placa: "D4T-331", tipo: "TOLVA",  marca: "Randon",     modelo: "SR BA",   anio: 2020, estado: "OPERATIVO", encapsulado: false, odometro: 0 },
  { placa: "E1R-908", tipo: "CISTERNA", marca: "Mercedes", modelo: "Actros",  anio: 2016, estado: "BAJA",      encapsulado: false, odometro: 703110 }
];

var PERSONAS = [
  { dni: "10000001", nombres: "Julio César",  apellidos: "Ramos Quispe",     cargo: "CONDUCTOR", licencia: "AIIIC", licenciaVence: "2027-03-14" },
  { dni: "10000002", nombres: "Elmer",        apellidos: "Ccahuana Puma",    cargo: "CONDUCTOR", licencia: "AIIIC", licenciaVence: "2026-09-02" },
  { dni: "10000003", nombres: "Wilber",       apellidos: "Mamani Choque",    cargo: "CONDUCTOR", licencia: "AIIIB", licenciaVence: "2026-08-11" },
  { dni: "10000004", nombres: "Rosa María",   apellidos: "Huamán Salas",     cargo: "CONDUCTOR", licencia: "AIIIC", licenciaVence: "2028-01-20" },
  { dni: "10000005", nombres: "Óscar",        apellidos: "Béjar Nina",       cargo: "CONDUCTOR", licencia: "AIIIC", licenciaVence: "2026-08-05" },
  { dni: "10000006", nombres: "Fredy",        apellidos: "Apaza Condori",    cargo: "CONDUCTOR", licencia: "AIIIC", licenciaVence: "2027-11-30" },
  { dni: "10000007", nombres: "Ana Lucía",    apellidos: "Torres Vilca",     cargo: "ADMINISTRATIVO", licencia: "", licenciaVence: "" }
];

// Rutas con historial de tarifa: la de mayo se renegoció el 15 de junio.
// Un viaje del 10 de junio DEBE seguir liquidándose con la tarifa vieja.
var RUTAS = [
  { ruta: "MATARANI - LAS BAMBAS", origen: "MATARANI", destino: "LAS BAMBAS", km: 612, moneda: "PEN",
    tarifa: 168.00, tarifa_desde: "2026-01-01",
    vigencias: [{ desde: "2026-06-15", tarifa: 181.50 }],
    conceptos: { estiba: true, toldeo: true, descarga: false } },
  { ruta: "LAS BAMBAS - MATARANI", origen: "LAS BAMBAS", destino: "MATARANI", km: 612, moneda: "PEN",
    tarifa: 174.00, tarifa_desde: "2026-01-01", vigencias: [],
    conceptos: { estiba: false, toldeo: true, descarga: true } },
  { ruta: "AREQUIPA - CONSTANCIA", origen: "AREQUIPA", destino: "CONSTANCIA", km: 498, moneda: "PEN",
    tarifa: 142.00, tarifa_desde: "2026-01-01", vigencias: [],
    conceptos: { estiba: true, toldeo: false, descarga: false } },
  { ruta: "MATARANI - ANTAPACCAY", origen: "MATARANI", destino: "ANTAPACCAY", km: 455, moneda: "USD",
    tarifa: 46.00, tarifa_desde: "2026-01-01", vigencias: [],
    conceptos: { estiba: true, toldeo: true, descarga: false } },
  { ruta: "AREQUIPA - MATARANI", origen: "AREQUIPA", destino: "MATARANI", km: 118, moneda: "PEN",
    tarifa: 58.00, tarifa_desde: "2026-01-01", vigencias: [],
    conceptos: { estiba: false, toldeo: false, descarga: false } }
];

// ---- Viajes [FICTICIO] ----------------------------------------------------
// El campo de fecha del hecho es fechaSalida (ver trazza-db.js: _campoFecha).
var VIAJES = [
  { placa: "V7K-841", ruta: "MATARANI - LAS BAMBAS", fechaSalida: "2026-06-08", fechaLlegada: "2026-06-10", carga: "CARGADO", tne: 31.2, guia: "T001-0004412", conductor: "10000001", estado: "CERRADO",
    viaticos: [{ fecha: "2026-06-08", lugar: "Matarani", concepto: "Almuerzo y peaje", monto: 78 }, { fecha: "2026-06-09", lugar: "Espinar", concepto: "Hospedaje", monto: 60 }], estiba: 120, toldeo: 80 },
  { placa: "V7K-841", ruta: "LAS BAMBAS - MATARANI", fechaSalida: "2026-06-11", fechaLlegada: "2026-06-13", carga: "VACIO", tne: 0, guia: "", conductor: "10000001", estado: "CERRADO",
    viaticos: [{ fecha: "2026-06-11", lugar: "Challhuahuacho", concepto: "Alimentación", monto: 65 }], toldeo: 0 },
  { placa: "B2M-513", ruta: "MATARANI - LAS BAMBAS", fechaSalida: "2026-06-19", fechaLlegada: "2026-06-21", carga: "CARGADO", tne: 30.8, guia: "T001-0004498", conductor: "10000002", estado: "CERRADO",
    viaticos: [{ fecha: "2026-06-19", lugar: "Matarani", concepto: "Alimentación", monto: 72 }, { fecha: "2026-06-20", lugar: "Yauri", concepto: "Hospedaje", monto: 60 }], estiba: 120, toldeo: 80 },
  { placa: "C9P-207", ruta: "MATARANI - ANTAPACCAY", fechaSalida: "2026-06-24", fechaLlegada: "2026-06-26", carga: "CARGADO", tne: 29.5, guia: "T001-0004530", conductor: "10000005", estado: "CERRADO",
    moneda: "USD", tc: 3.71,
    viaticos: [{ fecha: "2026-06-24", lugar: "Matarani", concepto: "Alimentación", monto: 70 }], estiba: 110, toldeo: 80 },
  { placa: "V7K-842", ruta: "AREQUIPA - CONSTANCIA", fechaSalida: "2026-07-03", fechaLlegada: "2026-07-05", carga: "CARGADO", tne: 32.0, guia: "T001-0004611", conductor: "10000003", estado: "LLEGO",
    viaticos: [{ fecha: "2026-07-03", lugar: "Arequipa", concepto: "Alimentación", monto: 68 }], estiba: 115 },
  { placa: "B2M-513", ruta: "MATARANI - LAS BAMBAS", fechaSalida: "2026-07-09", fechaLlegada: "2026-07-11", carga: "CARGADO", tne: 31.0, guia: "", conductor: "10000002", estado: "LLEGO",
    viaticos: [{ fecha: "2026-07-09", lugar: "Matarani", concepto: "Alimentación", monto: 74 }], estiba: 120, toldeo: 80 },
  { placa: "V7K-841", ruta: "AREQUIPA - MATARANI", fechaSalida: "2026-07-14", fechaLlegada: "2026-07-14", carga: "CARGADO", tne: 28.4, guia: "T001-0004660", conductor: "10000001", estado: "LLEGO",
    viaticos: [] },
  { placa: "C9P-207", ruta: "LAS BAMBAS - MATARANI", fechaSalida: "2026-07-18", fechaLlegada: "2026-07-20", carga: "VACIO", tne: 0, guia: "", conductor: "10000005", estado: "CERRADO",
    viaticos: [{ fecha: "2026-07-18", lugar: "Challhuahuacho", concepto: "Alimentación", monto: 66 }] },
  { placa: "V7K-842", ruta: "MATARANI - LAS BAMBAS", fechaSalida: "2026-07-25", fechaLlegada: "", carga: "CARGADO", tne: 31.5, guia: "", conductor: "10000004", estado: "EN_TRANSITO",
    viaticos: [{ fecha: "2026-07-25", lugar: "Matarani", concepto: "Alimentación", monto: 70 }], estiba: 120, toldeo: 80 },
  { placa: "B2M-513", ruta: "AREQUIPA - CONSTANCIA", fechaSalida: "2026-07-28", fechaLlegada: "", carga: "CARGADO", tne: 30.2, guia: "", conductor: "10000006", estado: "EN_TRANSITO",
    viaticos: [], estiba: 115 }
];

// ---- Gastos [FICTICIO] ----------------------------------------------------
// Se enganchan solos por placa + rango de fechas. Ninguno declara a qué viaje
// pertenece: eso lo decide el motor de atribución, y ese es el punto.
var COMBUSTIBLE = [
  { placa: "V7K-841", fecha: "2026-06-08", galones: 128.4, precioUnitario: 16.20, odometro: 410100, grifo: "Repsol Matarani" },
  { placa: "V7K-841", fecha: "2026-06-12", galones: 121.0, precioUnitario: 16.35, odometro: 411450, grifo: "Primax Espinar" },
  { placa: "B2M-513", fecha: "2026-06-19", galones: 133.7, precioUnitario: 16.10, odometro: 208300, grifo: "Repsol Matarani" },
  { placa: "C9P-207", fecha: "2026-06-24", galones: 141.2, precioUnitario: 16.40, odometro: 586200, grifo: "Petroperú Yura" },
  { placa: "V7K-842", fecha: "2026-07-03", galones: 118.9, precioUnitario: 16.55, odometro: 396800, grifo: "Primax Arequipa" },
  { placa: "B2M-513", fecha: "2026-07-09", galones: 130.5, precioUnitario: 16.48, odometro: 209900, grifo: "Repsol Matarani" },
  // Rendimiento imposible a propósito: 18 galones para 1 340 km. El guardarraíl
  // marca revisar:true y NO bloquea. Un sistema que impide registrar lo que
  // pasó de verdad consigue que la gente registre otra cosa.
  { placa: "V7K-841", fecha: "2026-07-14", galones: 18.0, precioUnitario: 16.60, odometro: 412790, grifo: "Grifo del km 48" },
  { placa: "V7K-842", fecha: "2026-07-25", galones: 126.3, precioUnitario: 16.70, odometro: 398050, grifo: "Repsol Matarani" },
  // Huérfano a propósito: esta unidad está de baja y no tiene viaje ese día.
  { placa: "E1R-908", fecha: "2026-07-16", galones: 60.0, precioUnitario: 16.30, odometro: 703200, grifo: "Primax Arequipa" }
];

var GNL = [
  { placa: "C9P-207", fecha: "2026-07-18", kilos: 210.0, precioUnitario: 2.35, estacion: "Naturgy Arequipa" }
];

var LAVADO = [
  { placa: "V7K-841", fecha: "2026-06-10", tipo: "COMPLETO", costoTotal: 95 },
  { placa: "B2M-513", fecha: "2026-06-21", tipo: "TOLVA",    costoTotal: 70 },
  { placa: "C9P-207", fecha: "2026-06-26", tipo: "EXTERIOR", costoTotal: 55 },
  { placa: "V7K-842", fecha: "2026-07-05", tipo: "COMPLETO", costoTotal: 95 },
  { placa: "B2M-513", fecha: "2026-07-11", tipo: "COMPLETO", costoTotal: 95 }
];

// Una falla correctiva dentro de la ventana de un viaje. Que reste o no del
// tramo NO lo decide esta pantalla: lo decide politica_costos.correctivoResta.
var FALLAS = [
  { placa: "B2M-514", fechaFalla: "2026-07-06", sistema: "FRENOS", descripcion: "Fuga en cámara de freno delantera derecha", costoTotal: 1240, estadoUnidad: "TALLER" },
  { placa: "V7K-842", fechaFalla: "2026-07-04", sistema: "ELECTRICO", descripcion: "Alternador no carga", costoTotal: 860, estadoUnidad: "OPERATIVO" }
];

// ---- Escritura ------------------------------------------------------------
function lote() {
  var b = db.batch(), n = 0;
  return {
    set: function (ref, data) { b.set(ref, data, { merge: true }); n++; },
    cerrar: function () { return n ? b.commit().then(function () { return n; }) : Promise.resolve(0); }
  };
}

function borrarEmpresa() {
  var cols = ["operaciones", "viajes", "mantenimiento", "personas", "config"];
  console.log("  · Borrando lo anterior de '" + EMPRESA + "'…");
  return cols.reduce(function (p, c) {
    return p.then(function () {
      return db.collection(c).where("empresaId", "==", EMPRESA).get().then(function (s) {
        if (s.empty) return 0;
        var b = db.batch();
        s.docs.forEach(function (d) { b.delete(d.ref); });
        return b.commit().then(function () { console.log("      " + c + ": " + s.size + " documentos"); });
      });
    });
  }, Promise.resolve());
}

function sembrar() {
  var L = lote();

  UNIDADES.forEach(function (u) {
    L.set(db.collection("operaciones").doc(clave(EMPRESA, "UNIDAD", NP(u.placa))),
      doc({ modulo: "unidades", placa: NP(u.placa), tipo: u.tipo, marca: u.marca, modelo: u.modelo,
            anio: u.anio, estado: u.estado, encapsulado: u.encapsulado, odometro: u.odometro,
            fecha: "2026-01-01", en_ruta: false, ubicacion: "PATIO" }));
  });

  PERSONAS.forEach(function (p) {
    L.set(db.collection("personas").doc(clave(EMPRESA, p.dni)),
      doc({ modulo: "personal", dni: p.dni, nombres: p.nombres, apellidos: p.apellidos,
            nombreCompleto: p.nombres + " " + p.apellidos, cargo: p.cargo,
            licencia: p.licencia, licenciaVence: p.licenciaVence, activo: true, fecha: "2026-01-01" }));
  });

  RUTAS.forEach(function (r) {
    L.set(db.collection("operaciones").doc(clave(EMPRESA, "RUTA", r.ruta)),
      doc({ modulo: "rutas", ruta: r.ruta, origen: r.origen, destino: r.destino, km: r.km,
            moneda: r.moneda, tarifa: r.tarifa, tarifa_desde: r.tarifa_desde,
            vigencias: r.vigencias, conceptos: r.conceptos, fecha: r.tarifa_desde }));
  });

  VIAJES.forEach(function (v) {
    var r = RUTAS.filter(function (x) { return x.ruta === v.ruta; })[0] || {};
    var id = clave(EMPRESA, NP(v.placa), v.fechaSalida, v.ruta);
    L.set(db.collection("viajes").doc(id), doc({
      modulo: "viajes", _campoFecha: "fechaSalida",
      placa: NP(v.placa), ruta: v.ruta, origen: r.origen || "", destino: r.destino || "",
      fechaSalida: v.fechaSalida, fechaLlegada: v.fechaLlegada || "",
      fecha: v.fechaSalida, periodo: v.fechaSalida.slice(0, 7),
      carga: v.carga, cargado: v.carga === "CARGADO", vacio: v.carga !== "CARGADO",
      tne: v.tne, guia: v.guia || "", conductor: v.conductor, estado: v.estado,
      moneda: v.moneda || r.moneda || "PEN", tc: v.tc || 0,
      // La tarifa se fotografía a la fecha del viaje. Los viajes ya cerrados
      // la llevan grabada; los abiertos se resuelven contra el maestro.
      tarifaUsada: v.estado === "CERRADO" ? tarifaEn(r, v.fechaSalida) : 0,
      conceptos: r.conceptos || {},
      viaticos: v.viaticos || [], viaticosEntregado: (v.viaticos || []).reduce(function (a, x) { return a + x.monto; }, 0) + 40,
      estiba: v.estiba || 0, toldeo: v.toldeo || 0, descarga: v.descarga || 0
    }));
  });

  COMBUSTIBLE.forEach(function (g, i) {
    L.set(db.collection("operaciones").doc(clave(EMPRESA, "COMB", NP(g.placa), g.fecha, i)),
      doc({ modulo: "combustible", placa: NP(g.placa), fecha: g.fecha, galones: g.galones,
            precioUnitario: g.precioUnitario, costoTotal: redondea(g.galones * g.precioUnitario),
            odometro: g.odometro, grifo: g.grifo }));
  });
  GNL.forEach(function (g, i) {
    L.set(db.collection("operaciones").doc(clave(EMPRESA, "GNL", NP(g.placa), g.fecha, i)),
      doc({ modulo: "gnl", placa: NP(g.placa), fecha: g.fecha, kilos: g.kilos,
            precioUnitario: g.precioUnitario, costoTotal: redondea(g.kilos * g.precioUnitario), estacion: g.estacion }));
  });
  LAVADO.forEach(function (g, i) {
    L.set(db.collection("operaciones").doc(clave(EMPRESA, "LAV", NP(g.placa), g.fecha, i)),
      doc({ modulo: "lavado", placa: NP(g.placa), fecha: g.fecha, tipo: g.tipo, costoTotal: g.costoTotal }));
  });
  FALLAS.forEach(function (f, i) {
    L.set(db.collection("mantenimiento").doc(clave(EMPRESA, "FALLA", NP(f.placa), f.fechaFalla, i)),
      doc({ modulo: "fallas", placa: NP(f.placa), fechaFalla: f.fechaFalla, fecha: f.fechaFalla,
            _campoFecha: "fechaFalla", sistema: f.sistema, descripcion: f.descripcion,
            costoTotal: f.costoTotal, estadoUnidad: f.estadoUnidad }));
  });

  // ---- Parámetros por periodo -------------------------------------------
  L.set(db.collection("config").doc(EMPRESA + "__tc_sunat"), doc({
    clave: "tc_sunat", tipo: "mapa", area: "contabilidad", defecto: 3.75,
    valores: { "2026-05": 3.74, "2026-06": 3.71, "2026-07": 3.68 }
  }));

  // La política de costos se siembra DECLARADA, no por defecto, para que la
  // demo no muestre el sello "POLÍTICA POR DEFECTO (nadie la declaró)".
  // El valor de correctivoResta es una decisión de negocio, no técnica:
  // aquí queda en false, que es como el sistema de origen lo venía calculando.
  L.set(db.collection("config").doc(EMPRESA + "__politica_costos"), doc({
    clave: "politica_costos", tipo: "escalar", area: "contabilidad",
    valor: {
      imputables: ["combustible", "gnl", "lavado", "viaticos", "estiba", "toldeo", "descarga", "peaje"],
      globales: ["mant_preventivo_mes", "alquileres"],
      correctivoResta: false, preventivoResta: true, incluirHistorico: false
    }
  }));

  L.set(db.collection("config").doc(EMPRESA + "__mant_preventivo_mes"), doc({
    clave: "mant_preventivo_mes", tipo: "mapa", area: "mantenimiento", defecto: 0,
    valores: { "2026-06": 18400, "2026-07": 21250 }
  }));

  return L.cerrar();
}

function tarifaEn(r, fecha) {
  var cands = [];
  if (r.tarifa) cands.push({ desde: r.tarifa_desde || "", tarifa: r.tarifa });
  (r.vigencias || []).forEach(function (v) { cands.push({ desde: v.desde || "", tarifa: v.tarifa }); });
  var val = 0, mejor = "";
  cands.forEach(function (c) { if (!c.desde || String(c.desde) <= String(fecha)) { if (c.desde >= mejor) { mejor = c.desde; val = c.tarifa; } } });
  if (!val && cands.length) {
    cands.sort(function (a, b) { return String(a.desde).localeCompare(String(b.desde)); });
    val = cands[0].tarifa;
  }
  return val;
}
function redondea(x) { return Math.round(x * 100) / 100; }

console.log("\n  Proyecto : " + svc.project_id);
console.log("  Empresa  : " + EMPRESA + "   [FICTICIO]\n");

(BORRAR ? borrarEmpresa() : Promise.resolve())
  .then(sembrar)
  .then(function (n) {
    console.log("\n  ✓ " + n + " documentos sembrados");
    console.log("      " + UNIDADES.length + " unidades · " + PERSONAS.length + " personas · " + RUTAS.length + " rutas");
    console.log("      " + VIAJES.length + " viajes (2 abiertos, 2 vacíos, 1 en dólares)");
    console.log("      " + (COMBUSTIBLE.length + GNL.length + LAVADO.length) + " gastos + " + FALLAS.length + " fallas");
    console.log("      3 parámetros por periodo (tc_sunat, politica_costos, mant_preventivo_mes)\n");
    console.log("  Todo es inventado. Ninguna placa, DNI o tarifa corresponde a nadie.\n");
    process.exit(0);
  })
  .catch(function (e) { morir("Falló: " + (e && e.message ? e.message : e)); });
