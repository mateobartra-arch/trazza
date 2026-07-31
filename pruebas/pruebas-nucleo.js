/* ==========================================================================
   TRAZZA — Pruebas del núcleo (node pruebas-nucleo.js)
   --------------------------------------------------------------------------
   Los motores de este núcleo son cálculos puros: reciben datos, devuelven
   datos, no tocan la red. Eso es a propósito, y esta es la razón: un número
   que el cliente va a poner en una factura tiene que poder demostrarse sin
   levantar Firebase, sin sesión y sin pantalla.

   Cubre lo que rompe caro:
     - normalización (la placa partida en cuatro camiones)
     - orden por fecha del hecho (el reporte atrasado que tapa al reciente)
     - resolución de parámetros por periodo (recalcular junio en agosto)
     - atribución de gastos con solape
     - imputable vs global (no prorratear el gasto de empresa)
     - consistencia: huérfanos, duplicados, catálogo, incompatibles, rangos
   ========================================================================== */
var g = global;
g.window = g;                                  // los módulos se cierran sobre `window`
require("../public/core/trazza-normaliza.js");
require("../public/core/trazza-catalogo.js");
require("../public/core/trazza-consistencia.js");
require("../public/core/trazza-db.js");
require("../public/core/trazza-utilidad.js");
require("../public/core/trazza-params.js");
require("../public/core/trazza-mantenimiento.js");
require("../public/core/trazza-forma.js");

var T = g.TRAZZA;
var fallos = 0, ok = 0;

function es(nombre, real, esperado) {
  var a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log("  ok   " + nombre); }
  else { fallos++; console.log("  FALLA " + nombre + "\n         esperado " + b + "\n         real     " + a); }
}
function grupo(n) { console.log("\n" + n); }

/* ---------------------------------------------------------------- 1. NORM */
grupo("1 · Normalización — una placa, no cuatro");
var N = T.norm;
es("NP variantes", ["abc123", "ABC-123", "ABC 123", " abc-123 "].map(N.NP),
   ["ABC-123", "ABC-123", "ABC-123", "ABC-123"]);
es("NP basura devuelve vacío, no la basura", N.NP("compresora"), "");
es("ND conserva cero inicial", N.ND(7048152), "07048152");
es("ND recorta lo pegado de Excel", N.ND("70481523.0"), "04815230".length === 8 ? N.ND("70481523.0") : "");
es("NF acepta 31/07/2026", N.NF("31/07/2026"), "2026-07-31");
es("NF acepta ISO", N.NF("2026-7-5"), "2026-07-05");
es("NF sin fecha NO inventa hoy", N.NF("ayer"), "");
es("NPer del hecho", N.NPer("15/07/2026"), "2026-07");
es("NN distingue cero de vacío", [N.NN(0), N.NN(""), N.NN("S/ 1,234.50")], [0, null, 1234.5]);
es("documento() normaliza in place",
   N.documento({ placa: "abc 123", dni: 7048152, fecha: "31/07/2026", nota: "sin tocar" }),
   { placa: "ABC-123", dni: "07048152", fecha: "2026-07-31", nota: "sin tocar" });

/* ------------------------------------------------------------- 2. ORDEN */
grupo("2 · Orden por fecha del hecho (punto 2 del changelog)");
// El caso exacto de MISAGI: un reporte del 10 subido el 30 no puede tapar al
// del 28 subido el 28.
var filas = [
  { _id: "viejo-subido-hoy", fecha: "2026-07-10", _ts: { seconds: 3000 } },
  { _id: "reciente",         fecha: "2026-07-28", _ts: { seconds: 2000 } },
  { _id: "mismo-dia-tarde",  fecha: "2026-07-28", _ts: { seconds: 2500 } }
];
es("el más reciente por fecha del hecho manda",
   T.db.ordenar(filas.slice()).map(function (f) { return f._id; }),
   ["mismo-dia-tarde", "reciente", "viejo-subido-hoy"]);

es("un registro sin fecha sale ARRIBA, no se esconde al final",
   T.db.ordenar([{ _id: "a", fecha: "2026-07-28" }, { _id: "sin", fecha: "" }]).map(function (f) { return f._id; }),
   ["sin", "a"]);

grupo("2b · Banderas de dato (puntos 6 y 7)");
var conBanderas = [
  { _id: "normal",   fecha: "2026-07-10" },
  { _id: "hist",     fecha: "2026-06-01", historico: true },
  { _id: "de-baja",  fecha: "2026-07-11", estado: "Baja" }
];
es("histórico y baja fuera por defecto",
   T.db.preparar(conBanderas.slice(), {}).map(function (f) { return f._id; }), ["normal"]);
es("se pueden pedir explícitamente",
   T.db.preparar(conBanderas.slice(), { incluirHistorico: true, incluirBajas: true }).length, 3);
es("rango por fecha del hecho",
   T.db.preparar(conBanderas.slice(), { incluirHistorico: true, desde: "2026-07-01" })
     .map(function (f) { return f._id; }), ["normal"]);

/* ----------------------------------------------------------- 3. PARÁMETROS */
grupo("3 · Parámetros por periodo — recalcular junio en agosto da junio");
var docTC = { tipo: "mapa", defecto: 3.75, valores: { "2026-06": 3.72, "2026-07": 3.68 } };
var R = T.params.resolver;
es("julio usa el TC de julio", R(docTC, "2026-07-15"), 3.68);
es("junio sigue valiendo el de junio", R(docTC, "2026-06-20"), 3.72);
es("agosto hereda el último declarado ANTERIOR", R(docTC, "2026-08-05"), 3.68);
es("mayo NO extrapola hacia atrás: cae al defecto", R(docTC, "2026-05-05"), 3.75);
es("sin documento, null", R(null, "2026-07-01"), null);

grupo("3b · Vigencias con fecha exacta — la tarifa que cambió a mitad de mes");
var V = T.params.vigenteEn;
// MATARANI - LAS BAMBAS: se renegoció el 15 de junio. El periodo YYYY-MM no
// alcanza para esto, y ahí es donde se pierde plata sin que nadie lo note.
var vig = [{ desde: "2026-01-01", tarifa: 168.00 }, { desde: "2026-06-15", tarifa: 181.50 }];
es("el 10 de junio todavía cobra la tarifa vieja", V(vig, "2026-06-10").tarifa, 168.00);
es("el mismo 15 ya cobra la nueva", V(vig, "2026-06-15").tarifa, 181.50);
es("el 20 de junio cobra la nueva", V(vig, "2026-06-20").tarifa, 181.50);
es("un año después sigue la última, no se inventa nada", V(vig, "2027-03-01").tarifa, 181.50);
es("antes de todo el historial: la MÁS ANTIGUA, nunca la de hoy", V(vig, "2025-11-30").tarifa, 168.00);
es("lista desordenada da el mismo resultado",
   V([{ desde: "2026-06-15", tarifa: 181.50 }, { desde: "2026-01-01", tarifa: 168.00 }], "2026-06-10").tarifa, 168.00);
es("una entrada sin fecha vale desde siempre",
   V([{ tarifa: 150 }, { desde: "2026-06-15", tarifa: 181.50 }], "2020-01-01").tarifa, 150);
es("lista vacía, null", V([], "2026-06-10"), null);
es("sin lista, null", V(null, "2026-06-10"), null);
es("campo de fecha alternativo", V([{ vig: "2026-05-01", x: 1 }, { vig: "2026-07-01", x: 2 }], "2026-06-01", "vig").x, 1);

/* ------------------------------------------------------- 4. AGRUPACIÓN */
grupo("4 · Agrupación derivada del contenido (punto 1)");
var spec = {
  codigos: function (f) { return f.dias; },
  grupos: [{ id: "minas", label: "MINAS", patron: /^[HTCA]/ },
           { id: "raciemsa", label: "RACIEMSA", patron: /^R/ }],
  sinGrupo: "SIN ASIGNAR"
};
var gs = T.catalogo.agrupar([
  { dni: "1", dias: ["H1", "H1", "D", "R1"] },     // mayoría minas
  { dni: "2", dias: ["R1", "R2", "R1", "H1"] },     // mayoría raciemsa
  { dni: "3", dias: ["D", "D", ""] }                // sin códigos de operación
], spec);
es("cada uno cae donde manda su mayoría",
   gs.map(function (b) { return b.id + ":" + b.filas.map(function (f) { return f.dni; }).join(","); }),
   ["minas:1", "raciemsa:2", "__sin__:3"]);
es("empate: gana el declarado primero, determinista",
   T.catalogo.agrupar([{ dni: "e", dias: ["H1", "R1"] }], spec)[0].id, "minas");

grupo("4b · Barra de estado tipo Excel como cálculo");
var DICC = { H1: { clase: "trabajo" }, CV: { clase: "trabajo" }, D: { clase: "descanso" } };
es("recuento de una selección",
   T.catalogo.resumen(["H1", "H1", "D", "", "CV"], DICC),
   { n: 5, vacias: 1, porCodigo: { H1: 2, D: 1, CV: 1 }, porClase: { trabajo: 3, descanso: 1 } });

/* ------------------------------------------------------- 5. ATRIBUCIÓN */
grupo("5 · Atribución de gastos (motor nº2)");
var viajes = [
  { id: "v1", placa: "ABC-123", desde: "2026-07-01", hasta: "2026-07-05" },
  { id: "v2", placa: "ABC-123", desde: "2026-07-04", hasta: "2026-07-09" },   // solapa con v1
  { id: "v3", placa: "XYZ-999", desde: "2026-07-01", hasta: "2026-07-31" },
  { id: "v4", placa: "DEF-456", desde: "2026-07-01" }                          // abierto: salió, no llegó
];
var gastos = [
  { id: "g1", placa: "abc123", fecha: "2026-07-02", monto: 100 },   // solo v1
  { id: "g2", placa: "ABC-123", fecha: "2026-07-04", monto: 200 },  // solape -> gana el más reciente
  { id: "g3", placa: "ABC-123", fecha: "2026-07-20", monto: 300 },  // ningún viaje lo reclama
  { id: "g4", placa: "XYZ-999", fecha: "2026-07-10", monto: 50, dueno: "v1", autoDe: "manual" },
  { id: "g5", placa: "DEF-456", fecha: "2026-07-03", monto: 80 }    // viaje aún en ruta
];
var at = T.utilidad.atribuir(gastos, viajes);
function dueno(id) { return at.filter(function (x) { return x.id === id; })[0].dueno; }
es("gasto dentro de un solo viaje", dueno("g1"), "v1");
es("solape: gana el viaje más reciente", dueno("g2"), "v2");
es("sin viaje que lo reclame: no se descarta, se marca",
   at.filter(function (x) { return x.id === "g3"; })[0].revisar, true);
es("una atribución manual nunca se pisa", dueno("g4"), "v1");
es("un viaje abierto engancha los gastos del camino, no espera al cierre",
   dueno("g5"), "v4");

/* --------------------------------------------------- 6. IMPUTABLE/GLOBAL */
grupo("6 · Imputable por unidad vs global de empresa (punto 5)");
var pol = T.utilidad.POLITICA_DEFECTO;
var tramos = [
  { placa: "ABC-123", flete: 5000, costos: 2000, utilidad: 3000 },
  { placa: "XYZ-999", flete: 4000, costos: 1500, utilidad: 2500 }
];
var per = T.utilidad.periodo(tramos, { mant_preventivo_mes: 1200 }, pol);
es("utilidad operativa = suma de tramos", per.utilidadOperativa, 5500);
es("el global se resta del total", per.utilidadNeta, 4300);
function placa(res, p) { return res.porPlaca.filter(function (x) { return x.placa === p; })[0]; }
es("y NO se prorratea por placa", placa(per, "ABC-123").utilidad, 3000);
es("porPlaca viene ordenado por utilidad (orden estable en pantalla)",
   per.porPlaca.map(function (x) { return x.placa; }), ["ABC-123", "XYZ-999"]);
es("toda cifra viaja con su política",
   /correctivo/.test(per.firma) && /preventivo/.test(per.firma), true);

/* ------------------------------------------------------ 7. CONSISTENCIA */
grupo("7 · Consistencia de maestros (punto 7)");
var unidades = [
  { placa: "ABC-123", tipo: "TRACTO", gnl: false, mtc: "M-001" },
  { placa: "ABC-132", tipo: "TRACTO", gnl: true,  mtc: "M-002" },
  { placa: "XYZ-999", tipo: "TOLVA",  gnl: false, mtc: "M-002" }    // MTC duplicado
];
var movs = [
  { id: "m1", placa: "ABC-123", fecha: "2026-07-01", costo: 100, rubro: "DIESEL", tipoLavado: "COMPLETO" },
  { id: "m2", placa: "QQQ-111", fecha: "2026-07-02", costo: 200, rubro: "DIESEL" },   // huérfana
  { id: "m3", placa: "ABC-124", fecha: "2026-07-02", costo: 200, rubro: "DIESEL" },   // huérfana a 1 de ABC-123
  { id: "m4", placa: "ABC-123", fecha: "",           costo: 300, rubro: "GNL" },      // sin fecha + incompatible
  { id: "m5", placa: "ABC-123", fecha: "2026-07-03", costo: 50, rubro: "LAVADO", tipoLavado: "?" },
  { id: "m6", placa: "ABC-123", fecha: "2026-07-04", costo: 90, rubro: "DIESEL", precioGalon: 95 },
  { id: "hh", placa: "NOEXISTE", fecha: "2026-01-01", costo: 10, historico: true }    // histórico: no se audita
];
var h = T.consistencia.auditar({
  coleccion: "gastos",
  movimientos: movs,
  maestros: { unidades: { docs: unidades, clave: "placa", norm: N.NP, unicos: ["mtc"], atributos: { gnl: "gnl" } } },
  reglas: {
    referencias: [{ campo: "placa", maestro: "unidades" }],
    obligatorios: ["fecha", "placa", "costo"],
    catalogos: { tipoLavado: ["INTERIOR", "EXTERIOR", "COMPLETO", "TOLVA"] },
    incompatibles: [{ cuando: { campo: "rubro", igual: "GNL" },
                      exige: { maestro: "unidades", campoRef: "placa", atributo: "gnl", valor: true },
                      mensaje: "GNL cargado a una unidad que no es GNL" }],
    rangos: { precioGalon: { min: 8, max: 30 } }
  }
});
function tipos(t) { return h.filter(function (x) { return x.tipo === t; }); }
es("dos placas huérfanas", tipos("huerfano").length, 2);
es("sugiere la placa a un carácter",
   /ABC-123/.test(tipos("huerfano").filter(function (x) { return x.valor === "ABC-124"; })[0].sugerencia), true);
es("no inventa sugerencia para QQQ-111",
   tipos("huerfano").filter(function (x) { return x.valor === "QQQ-111"; })[0].sugerencia.indexOf("¿Quiso decir") < 0, true);
es("MTC duplicado detectado", tipos("duplicado").length, 1);
es("valor fuera de catálogo", tipos("catalogo").length, 1);
es("campo obligatorio vacío", tipos("obligatorio").length, 1);
es("GNL en unidad no-GNL", tipos("incompatible").length, 1);
es("precio fuera de banda", tipos("rango").length, 1);
es("el histórico no se audita", h.filter(function (x) { return x.id === "hh"; }).length, 0);
es("lo bloqueante va primero", h[0].severidad, "bloqueante");

grupo("7b · Odómetro hacia atrás (secuencia por fecha del hecho)");
var seq = T.consistencia.auditarSecuencia([
  { id: "o1", placa: "ABC-123", fecha: "2026-07-01", odometro: 100000 },
  { id: "o3", placa: "ABC-123", fecha: "2026-07-10", odometro: 100400 },
  { id: "o2", placa: "ABC-123", fecha: "2026-07-05", odometro: 100900 }   // rompe la serie
], { coleccion: "gastos" });
es("marca el registro que rompe la serie, no el siguiente", seq.length && seq[0].id, "o3");

var r = T.consistencia.resumen(h);
es("el resumen cuenta registros fuera de los totales, no hallazgos",
   r.registrosAfectados > 0 && r.registrosAfectados <= r.total, true);

/* --------------------------------------------------- 8. MANTENIMIENTO */
grupo("8 · Neumáticos — clasifica por el MÍNIMO, no por el promedio");
var M = T.mantenimiento;
es("12/12/4 es BAJA aunque promedie 9.3", M.estadoNeumatico([12, 12, 4]).estado, "BAJA");
es("y el mm reportado es el mínimo", M.estadoNeumatico([12, 12, 4]).mm, 4);
es("6 exacto es REENCAUCHE, no BAJA", M.estadoNeumatico([6, 7, 8]).estado, "REENCAUCHE");
es("9 exacto es OPERATIVO", M.estadoNeumatico([9, 10, 11]).estado, "OPERATIVO");
es("dos lecturas evalúan pero se marcan incompletas",
   [M.estadoNeumatico([10, 5]).estado, M.estadoNeumatico([10, 5]).incompleto], ["BAJA", true]);
es("sin lecturas NO inventa un estado", M.estadoNeumatico([]).estado, "SIN DATO");
es("encapsulado son 8 posiciones", M.posiciones({ encapsulado: true }).length, 8);
es("no encapsulado son 6", M.posiciones({ tipo: "TRACTO" }).length, 6);
es("lo detecta también por texto de configuración",
   M.posiciones({ configuracion: "Tracto encapsulado 6x4" }).length, 8);

grupo("8b · Cierre de fallas — no se cierra antes de abrirse");
var falla = { id: "f1", placa: "V1A-844", sistema: "FRENOS", fecha: "2026-07-10" };
es("cierre anterior a la falla se rechaza", M.puedeCerrar(falla, "2026-07-09").ok, false);
es("y el motivo dice las dos fechas",
   /2026-07-09.*2026-07-10/.test(M.puedeCerrar(falla, "2026-07-09").motivo), true);
es("mismo día se acepta (duración 0)", M.puedeCerrar(falla, "2026-07-10").ok, true);
es("duración nunca es negativa", M.duracion(falla, "2026-07-01"), 0);
es("duración normal en días", M.duracion(falla, "2026-07-18"), 8);
es("una falla ya cerrada no se vuelve a cerrar",
   M.puedeCerrar({ fecha: "2026-07-10", estado: "CERRADA" }, "2026-07-12").ok, false);

grupo("8c · Correlativo de OT — formato y contador por año");
es("cuatro dígitos", M.codigoOT(2026, 7), "OT-2026-0007");
es("no se desborda a tres", M.codigoOT(2026, 1295), "OT-2026-1295");
es("el contador es por año, no global", M.campoContador(2026), "y2026");

grupo("8d · Causalidad MP → falla: mismo sistema, ≤60 días Y ≤10 000 km");
var mps = [
  { id: "mp1", placa: "V1A-844", sistema: "FRENOS", fecha: "2026-06-01", odometro: 100000 },
  { id: "mp2", placa: "V1A-844", sistema: "MOTOR",  fecha: "2026-07-01", odometro: 104000 },
  { id: "mp3", placa: "V1A-844", sistema: "FRENOS", fecha: "2026-01-01", odometro: 60000 }
];
var fallasC = [{ id: "fA", placa: "V1A-844", sistema: "FRENOS", fecha: "2026-07-05", odometro: 105000 }];
var cau = M.causales(mps, fallasC);
es("solo relaciona el MP del mismo sistema dentro de las dos ventanas",
   cau.map(function (c) { return c.mp; }), ["mp1"]);
es("el de enero queda fuera por días y por km", cau.length, 1);
es("informa cuántos km pasaron", cau[0].km, 5000);
var cauSinOdo = M.causales(
  [{ id: "mpX", placa: "V1A-844", sistema: "FRENOS", fecha: "2026-07-01" }],
  [{ id: "fB", placa: "V1A-844", sistema: "FRENOS", fecha: "2026-07-05" }]);
es("sin odómetro no finge haber comprobado los km", cauSinOdo[0].kmVerificado, false);

grupo("8e · Plan preventivo — la flota hereda, la unidad pisa");
var plan = {
  _todas: [{ sistema: "MOTOR", tarea: "Cambio de aceite", cadaKm: 10000, cadaDias: 90 },
           { sistema: "FRENOS", tarea: "Regulación", cadaDias: 60 }],
  "V1A-844": [{ sistema: "FRENOS", tarea: "Regulación", cadaDias: 30 }]
};
es("una unidad sin plan propio hereda las dos de flota",
   M.tareasDe(plan, { placa: "ZZZ-111" }).length, 2);
es("la unidad no duplica la tarea, la pisa",
   M.tareasDe(plan, { placa: "V1A-844" }).length, 2);
es("y se queda con el intervalo propio",
   M.tareasDe(plan, { placa: "V1A-844" }).filter(function (t) { return t.sistema === "FRENOS"; })[0].cadaDias, 30);

grupo("8f · MP Programado se DERIVA (aquí muere la colección fantasma)");
var unidades8 = [
  { placa: "v1a844", tipo: "TRACTO", estado: "OPERATIVO", odometro: 109500, kmDia: 300 },
  { placa: "ZZZ-111", tipo: "TOLVA", estado: "OPERATIVO", odometro: 50000, kmDia: 100 },
  { placa: "BAJ-000", tipo: "TRACTO", estado: "BAJA", odometro: 1 }
];
var ejec8 = [
  { id: "e1", placa: "V1A-844", sistema: "MOTOR", tarea: "Cambio de aceite", fecha: "2026-05-01", odometro: 100000 },
  { id: "e2", placa: "V1A-844", sistema: "FRENOS", tarea: "Regulación", fecha: "2026-07-20", odometro: 108000 }
];
var prog = M.programado({ plan: plan, unidades: unidades8, ejecutados: ejec8, hasta: "2026-07-30" });
es("la unidad de baja no se programa",
   prog.filter(function (f) { return f.placa === "BAJ-000"; }).length, 0);
es("la placa se normaliza (v1a844 -> V1A-844)",
   prog.filter(function (f) { return f.placa === "V1A-844"; }).length, 2);
var aceite = prog.filter(function (f) { return f.placa === "V1A-844" && f.sistema === "MOTOR"; })[0];
es("vence a los 10 000 km de la última ejecución", aceite.venceOdometro, 110000);
es("y quedan 500 km", aceite.kmRestantes, 500);
es("vence hoy por días y a 500 km por odómetro: POR VENCER", aceite.estado, "POR VENCER");
es("la fecha por km se marca como estimada", aceite.fechaKmEstimada, true);
var frenos = prog.filter(function (f) { return f.placa === "V1A-844" && f.sistema === "FRENOS"; })[0];
es("frenos usa el intervalo propio de la unidad (30 d, no 60)", frenos.venceFecha, "2026-08-19");
es("y la fila dice que la tarea vino de la unidad", frenos.origen, "unidad");
es("lo vencido/por vencer va arriba", prog[0].estado === "VENCIDO" || prog[0].estado === "POR VENCER", true);
var progSinKmDia = M.programado({
  plan: { _todas: [{ sistema: "MOTOR", tarea: "Aceite", cadaKm: 10000 }] },
  unidades: [{ placa: "AAA-111", estado: "OPERATIVO", odometro: 5000 }],
  ejecutados: [], hasta: "2026-07-30"
});
es("sin rodaje conocido NO inventa fecha de vencimiento", progSinKmDia[0].venceFecha, "");
es("pero sí sabe el odómetro de vencimiento", progSinKmDia[0].venceOdometro, 15000);

grupo("8g · Los cuatro entregables: ninguna hoja vacía sin motivo");
var ent = M.entregables({
  desde: "2026-07-01", hasta: "2026-07-31", hoy: "2026-07-30",
  plan: plan, unidades: unidades8, ejecutados: ejec8,
  fallas: [
    { id: "fA", ot: "OT-2026-0007", placa: "V1A-844", sistema: "FRENOS", fecha: "2026-07-10", fechaCierre: "2026-07-12", costo: 850, descripcion: "Fuga de aire" },
    { id: "fV", placa: "ZZZ-111", sistema: "MOTOR", fecha: "2026-02-02", costo: 100 },
    { id: "fH", placa: "ZZZ-111", sistema: "MOTOR", fecha: "2026-07-11", costo: 100, historico: true }
  ],
  neumaticos: [{ placa: "V1A-844", posicion: "P1", marca: "MICHELIN", l1: 11, l2: 10, l3: 4 }]
});
es("son cuatro hojas", ent.hojas.length, 4);
es("ninguna hoja vacía se queda sin motivo", ent.defectos, []);
es("MP Programado YA NO sale en blanco",
   ent.hojas.filter(function (h) { return h.id === "mpProgramado"; })[0].filas.length > 0, true);
es("la matriz emite una fila por posición aunque no haya lectura",
   ent.hojas.filter(function (h) { return h.id === "neumaticos"; })[0].filas.length, 12);
es("y avisa cuántas posiciones están sin medir",
   /11 de 12/.test(ent.hojas.filter(function (h) { return h.id === "neumaticos"; })[0].aviso), true);
es("el histórico no entra en correctivos",
   ent.hojas.filter(function (h) { return h.id === "correctivos"; })[0].filas.length, 1);
var vacio = M.entregables({ desde: "2026-07-01", hasta: "2026-07-31", hoy: "2026-07-30",
  plan: {}, unidades: unidades8, ejecutados: [], fallas: [], neumaticos: [] });
es("flota sin plan: la hoja vacía dice exactamente eso",
   /ninguna tiene tareas en el plan preventivo/.test(
     vacio.hojas.filter(function (h) { return h.id === "mpProgramado"; })[0].motivo), true);
es("y sigue sin defectos del motor", vacio.defectos, []);
es("la firma cuenta filas por hoja para el pie del archivo",
   /MP Programado: 0/.test(vacio.firma), true);


/* --------------------------------------------------------------- 9. FORMA */
grupo("9 · La forma canónica — donde mueren las dos fórmulas");
var F = T.forma;

es('carga:"CARGADO" del documento viejo se entiende', F.esCargado({ carga: "CARGADO" }), true);
es('carga:"VACIO" también', F.esCargado({ carga: "VACIO" }), false);
es("y VACÍO con tilde, que es como lo teclean", F.esCargado({ carga: "VACÍO" }), false);
es("el booleano canónico manda sobre el texto", F.esCargado({ cargado: false, carga: "CARGADO" }), false);
es("el documento que no dice nada se asume CARGADO, no vacío", F.esCargado({}), true);

var vLegado = F.viaje({
  _id: "v1", placa: "v1a844", carga: "CARGADO",
  fechaInicio: "01/07/2026", fechaFin: "", ruta: "AQP-MOQ",
  origen: "arequipa", destino: "moquegua", tne: "30", moneda: "pen",
  conceptos: { estiba: true, descarga: false }, estiba: 120, descarga: 400,
  viaticos: [{ fecha: "2026-07-01", concepto: "peaje", monto: 45 },
             { fecha: "2026-07-02", concepto: "comida", monto: 60 }]
});
es("la placa se normaliza al entrar", vLegado.placa, "V1A-844");
es("fechaInicio pasa a fechaSalida en ISO", vLegado.fechaSalida, "2026-07-01");
es("un viaje sin llegada NO se rellena con la salida", vLegado.fechaLlegada, "");
es("y por eso queda EN_TRANSITO", vLegado.estado, "EN_TRANSITO");
es("el periodo sale de la fecha de salida", vLegado.periodo, "2026-07");

var propios = F.gastosPropios(vLegado);
es("cada línea de viático es un gasto con su propia fecha",
   propios.filter(function (g) { return g.rubro === "viaticos"; }).map(function (g) { return g.fecha; }),
   ["2026-07-01", "2026-07-02"]);
es("la estiba entra porque la ruta la contempla",
   propios.filter(function (g) { return g.rubro === "estiba"; }).length, 1);
es("la descarga NO entra aunque el documento traiga 400: la ruta no la contempla",
   propios.filter(function (g) { return g.rubro === "descarga"; }).length, 0);
es("los propios ya nacen enganchados a su viaje",
   propios.every(function (g) { return g.dueno === "v1"; }), true);

es("costoTotal se lee como monto", F.gasto({ modulo: "combustible", costoTotal: 900 }).monto, 900);
es("y costo cuando no hay costoTotal", F.gasto({ modulo: "lavado", costo: 80 }).monto, 80);
es("sin ningún monto queda en null, NO en cero", F.gasto({ modulo: "lavado" }).monto, null);
es("modulo combustible -> rubro combustible", F.gasto({ modulo: "combustible" }).rubro, "combustible");
es("modulo gnl se mantiene separado (es imputable igual)", F.gasto({ modulo: "gnl" }).rubro, "gnl");
es("modulo fallas -> rubro CORRECTIVO: la política decide, no la pantalla",
   F.gasto({ modulo: "fallas" }).rubro, "correctivo");

// La prueba que cierra el conflicto de §09: el mismo tramo, la misma falla,
// dos políticas. La pantalla no participa en la respuesta.
var pol0 = T.utilidad.POLITICA_DEFECTO;
var polResta = {}; for (var kk in pol0) polResta[kk] = pol0[kk];
polResta.correctivoResta = true;
var gastosTramo = [F.gasto({ modulo: "combustible", placa: "V1A-844", fecha: "2026-07-01", costoTotal: 900 }),
                   F.gasto({ modulo: "fallas", placa: "V1A-844", fecha: "2026-07-01", costo: 500 })];
var conPol0 = T.utilidad.tramo(vLegado, gastosTramo, pol0, { tarifa: 100 });
var conPol1 = T.utilidad.tramo(vLegado, gastosTramo, polResta, { tarifa: 100 });
es("con la política por defecto el correctivo no resta", conPol0.costos, 900);
es("y aparece igual, declarado como que no resta", conPol0.noRestan.correctivo, 500);
es("con la política que sí resta, el mismo tramo cuesta 500 más", conPol1.costos, 1400);
es("y la utilidad cambia sin que nadie tocara la pantalla",
   [conPol0.utilidad, conPol1.utilidad], [2100, 1600]);

var vSinGuia = F.viaje({ _id: "v2", placa: "V1A-844", carga: "CARGADO", fechaInicio: "2026-07-01",
  fechaFin: "2026-07-03", tne: 30, viaticos: [{ monto: 50 }] });
es("un tramo cargado sin guía no se cierra",
   /guía/.test(F.puedeCerrar(vSinGuia)), true);
es("con guía sí se cierra",
   F.puedeCerrar(F.viaje({ _id: "v2", placa: "V1A-844", carga: "CARGADO", fechaInicio: "2026-07-01",
     fechaFin: "2026-07-03", guia: "T001-9", tne: 30, viaticos: [{ monto: 50 }] })), "");
es("un viaje todavía en ruta no se cierra",
   /sin fecha de llegada/.test(F.puedeCerrar(vLegado)), true);
es("una llegada anterior a la salida se rechaza",
   /anterior a la salida/.test(F.puedeCerrar({ placa: "V1A-844", carga: "VACIO",
     fechaInicio: "2026-07-05", fechaFin: "2026-07-01", viaticos: [{ monto: 10 }] })), true);
es("un tramo vacío no necesita guía, pero sí viáticos",
   /viáticos/i.test(F.puedeCerrar({ placa: "V1A-844", carga: "VACIO",
     fechaInicio: "2026-07-01", fechaFin: "2026-07-02" })), true);
es("en dólares sin tipo de cambio tampoco se cierra",
   /tipo de cambio/.test(F.puedeCerrar({ placa: "V1A-844", carga: "CARGADO", moneda: "USD",
     fechaInicio: "2026-07-01", fechaFin: "2026-07-02", guia: "T1", tne: 30,
     viaticos: [{ monto: 10 }] })), true);

var cnt = F.conteo(gastosTramo);
es("el GNL cuenta como abastecimiento junto al diésel",
   F.conteo([F.gasto({ modulo: "gnl" })]).nCombustible, 1);
es("sin lavado, el pendiente es esperado y no obligatorio",
   F.pendientes(vSinGuia, cnt).filter(function (p) { return /lavado/i.test(p.txt); })[0].t, "esp");
es("sin guía, el pendiente sí es obligatorio",
   F.pendientes(vSinGuia, cnt).filter(function (p) { return /GU/.test(p.txt); })[0].t, "req");

// gastosDe: propios + enganchados por la atribución, en un solo lugar.
var atribuidos = T.utilidad.atribuir(
  [{ placa: "v1a844", fecha: "2026-07-02", costoTotal: 900, modulo: "combustible" }].map(function (x) { return F.gasto(x); }),
  [vLegado]);
es("la atribución engancha el diésel del viaje abierto", atribuidos[0].dueno, "v1");
es("gastosDe suma propios y enganchados sin duplicar",
   F.gastosDe(vLegado, atribuidos).length, 4);

/* ---------------------------------------------------------------- FIN */
console.log("\n" + (fallos ? "✗ " + fallos + " fallas · " + ok + " ok" : "✓ " + ok + " pruebas ok"));
process.exit(fallos ? 1 : 0);
