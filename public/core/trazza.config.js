/* ==========================================================================
   TRAZZA — Configuración de tenant (UN archivo por empresa cliente)
   --------------------------------------------------------------------------
   Este es el ÚNICO lugar donde debe vivir todo dato específico de una
   empresa (marca, credenciales Firebase, áreas habilitadas, módulos
   contratados). El motor compartido (trazza-auth.js, trazza-db.js, etc.)
   NUNCA debe tener nombres de empresa, RUC ni catálogos de área escritos
   a fuego: todo se lee desde window.TRAZZA_CONFIG.

   Cómo levantar un tenant nuevo: copia este archivo a
   /clientes/<slug>/trazza.config.js, reemplaza cada placeholder marcado
   "REEMPLAZAR" y referencia ese archivo (en vez de este) desde el <head>
   de cada página del tenant, ANTES de trazza-auth.js y trazza-db.js.
   ========================================================================== */
window.TRAZZA_CONFIG = {

  // ---- Identidad de marca (reemplaza los textos hardcodeados del motor) ----
  marca: {
    nombre: "Trazza",            // nombre corto mostrado en cabeceras y <title>
    razonSocial: "MISAGI S.A.C.",// razón social completa para reportes/PDFs
    ruc: "REEMPLAZAR",           // RUC de MISAGI — pégalo aquí antes de emitir cualquier PDF
    color: "#12161C",            // --basalt, el primario de la identidad Trazza
    logoUrl: "/core/logo.svg"    // reemplazar cuando exista el archivo de logo
  },

  // ---- Credenciales del proyecto Firebase del tenant (SDK compat 10.12.2) ----
  // La apiKey web NO es secreta (es pública por diseño); la seguridad real
  // la dan las Firestore Security Rules (ver firestore.rules) y App Check.
  firebase: {
    apiKey: "AIzaSyC_2pICWV_VWyAsfvvYxNuHxlbfi_Hlfbo",
    authDomain: "trazza-misagi.firebaseapp.com",
    projectId: "trazza-misagi",
    storageBucket: "trazza-misagi.firebasestorage.app",  // requiere plan Blaze para existir
    messagingSenderId: "430245008624",
    appId: "1:430245008624:web:e2004dc3581108e3855e35"
  },

  // ---- App Check (reCAPTCHA v3) para este tenant; vacío = App Check desactivado ----
  appCheckSiteKey: "",

  // ---- Identificador único del tenant: SE GRABA en cada documento Firestore ----
  // (campo empresaId) y se usa en TODAS las queries para aislar los datos.
  empresaId: "misagi",

  // ---- Cuenta principal del tenant ----------------------------------------
  // El correo del primer administrador: la cuenta que se crea antes que
  // ninguna otra y desde la que se dan de alta las demás. No otorga ningún
  // permiso por sí solo —los permisos viven en usuarios/{uid}.areas[] y los
  // aplica firestore.rules—; es el valor por defecto que toma
  // herramientas/crear-admin.js para no depender de que alguien lo teclee
  // bien. Un correo mal escrito aquí crea un admin al que nadie puede entrar.
  correoAdmin: "mateobartra@gmail.com",

  // ---- Catálogo de áreas del tenant (antes hardcodeado en auth.js:16-26) ----
  // Cada clave es el permiso que se guarda en usuarios/{uid}.areas[].
  areas: {
    operaciones:  { label: "Operaciones",          padre: "Flota" },   // gestión de viajes y programación
    mantenimiento:{ label: "Mantenimiento",        padre: "Flota" },   // taller, llantas, checklist
    rrhh:         { label: "Recursos Humanos",     padre: null },      // legajos, roster, asistencia
    imagen:       { label: "Imagen Institucional", padre: null },      // comunicación interna/externa
    contabilidad: { label: "Contabilidad",         padre: null },      // boletas, documentos contables
    ssoma:        { label: "Seguridad y Salud (SSOMA)", padre: null }, // incidentes, inspecciones
    comercial:    { label: "Comercial",            padre: null },      // clientes y ventas
    presupuesto:  { label: "Planeamiento y Presupuesto", padre: null },// presupuestos y planeamiento
    planificacion:{ label: "Planificación",        padre: null }       // planificación operativa
  },

  // ---- Rubros: capa de navegación (punto 4 del changelog) ------------------
  // Agrupa módulos hermanos SIN fusionar su código. En MISAGI, Combustible,
  // GNL y Lavado pasaron a navegarse como uno solo con una fila de rubro
  // encima; cada uno siguió siendo su propia página. El usuario percibe un
  // módulo con pestañas, el código sigue separado y desplegable por partes.
  // El orden de este array es el orden en pantalla.
  rubros: [
    { id: "gastos",    label: "Reporte de gastos", icono: "⛽" },
    { id: "taller",    label: "Taller",            icono: "🔧" },
    { id: "personas",  label: "Personas",          icono: "👷" }
  ],

  // ---- Catálogo de módulos (punto 3 del changelog) -------------------------
  // Data-driven, no escrito a mano en cada portal. Cada entrada:
  //   id         clave interna, se usa en el campo `modulo` de los documentos
  //   label      lo que lee la persona
  //   area       permiso requerido (debe existir en `areas` de arriba)
  //   url        ruta relativa de la app
  //   estado     "activo" | "proximamente" | "oculto"
  //   soloAdmin  true = ni siquiera aparece para quien no es admin
  //   rubro      id de `rubros` si pertenece a un grupo de pestañas
  //   desc       una línea; se pinta bajo el título en el portal
  //
  // Esto es la capa de feature-flags por tenant: "oculto" apaga un módulo
  // para un cliente sin tocar código ni desplegar nada distinto, y
  // "proximamente" permite mostrar el roadmap dentro del propio producto sin
  // prometer una fecha. Un módulo no contratado no se muestra NI AL ADMIN:
  // no es un permiso, es un límite de contrato.
  modulos: [
    { id: "programacion",  label: "Programación",        area: "operaciones",   url: "operaciones/programacion/",  estado: "activo",       desc: "Qué unidad sale, con quién y hacia dónde." },
    { id: "viajes",        label: "Viajes",              area: "operaciones",   url: "operaciones/viajes/",        estado: "activo",       desc: "Un tramo = un viaje. Aquí se liquida." },
    { id: "rutas",         label: "Rutas y tarifas",     area: "operaciones",   url: "operaciones/rutas/",         estado: "activo",       desc: "Maestro de rutas; la tarifa se fotografía a la fecha del viaje." },
    { id: "combustible",   label: "Combustible",         area: "operaciones",   url: "gastos/combustible/",        estado: "activo",       rubro: "gastos", desc: "Diésel: galones, precio y rendimiento." },
    { id: "gnl",           label: "GNL",                 area: "operaciones",   url: "gastos/gnl/",                estado: "activo",       rubro: "gastos", desc: "Gas natural licuado, solo para unidades habilitadas." },
    { id: "lavado",        label: "Lavado",              area: "operaciones",   url: "gastos/lavado/",             estado: "activo",       rubro: "gastos", desc: "Lavados por unidad y tipo." },
    { id: "estatus",       label: "Estatus de flota",    area: "mantenimiento", url: "mantenimiento/estatus/",     estado: "activo",       rubro: "taller", desc: "Fallas reportadas y unidades fuera de servicio." },
    { id: "ordenes",       label: "Órdenes de trabajo",  area: "mantenimiento", url: "mantenimiento/ot/",          estado: "activo",       rubro: "taller", desc: "OT correlativa por año, apertura y cierre." },
    { id: "neumaticos",    label: "Neumáticos",          area: "mantenimiento", url: "mantenimiento/neumaticos/",  estado: "activo",       rubro: "taller", desc: "Matriz por posición; manda la lectura mínima." },
    { id: "preventivo",    label: "Plan preventivo",     area: "mantenimiento", url: "mantenimiento/preventivo/",  estado: "activo",       rubro: "taller", desc: "MP programado vs ejecutado." },
    { id: "personal",      label: "Personal",            area: "rrhh",          url: "rrhh/personal/",             estado: "activo",       rubro: "personas", desc: "Maestro de personas. Clave: DNI." },
    { id: "roster",        label: "Roster de conductores", area: "rrhh",        url: "rrhh/roster/",               estado: "activo",       rubro: "personas", desc: "Grilla mensual; el grupo se deriva de los códigos." },
    { id: "asistencia",    label: "Asistencia",          area: "rrhh",          url: "rrhh/asistencia/",           estado: "activo",       rubro: "personas", desc: "Marcas diarias por persona." },
    { id: "boletas",       label: "Boletas",             area: "rrhh",          url: "rrhh/boletas/",              estado: "activo",       soloAdmin: true, desc: "Boletas de pago por periodo." },
    { id: "epp",           label: "EPP · Kardex",        area: "ssoma",         url: "ssoma/epp/",                 estado: "activo",       desc: "Entregas y stock; el histórico no mueve saldo." },
    { id: "documentos",    label: "Documentos",          area: "contabilidad",  url: "contabilidad/documentos/",   estado: "activo",       desc: "Guías, facturas y vencimientos." },
    { id: "utilidad",      label: "Rentabilidad",        area: "contabilidad",  url: "gerencia/utilidad/",         estado: "activo",       soloAdmin: true, desc: "Utilidad por unidad y por periodo, con la política a la vista." },
    { id: "consistencia",  label: "Consistencia de datos", area: "operaciones", url: "gerencia/consistencia/",     estado: "activo",       soloAdmin: true, desc: "Qué registros están fuera de los totales y por qué." },
    { id: "comercial",     label: "Comercial",           area: "comercial",     url: "comercial/",                 estado: "proximamente", desc: "Clientes, cotizaciones y contratos." },
    { id: "presupuesto",   label: "Presupuesto",         area: "presupuesto",   url: "presupuesto/",               estado: "proximamente", desc: "Metas por periodo contra ejecución real." },
    { id: "imagen",        label: "Imagen institucional", area: "imagen",       url: "imagen/",                    estado: "oculto",       desc: "Comunicación interna. Apagado por defecto." }
  ],

  // ---- Diccionario de códigos del roster (punto 1 del changelog) ----------
  // clase: "trabajo" | "descanso" | "ausencia" | "transito"
  // Es lo que alimenta la barra de estado tipo Excel (TRAZZA.catalogo.resumen)
  // y la leyenda de colores. Cambiarlo por cliente es cambiar este objeto,
  // no tocar la grilla.
  rosterCodigos: {
    H1: { label: "Hudbay turno 1",   clase: "trabajo",   bg: "#12897A", fg: "#FFFFFF" },
    H2: { label: "Hudbay turno 2",   clase: "trabajo",   bg: "#16B39C", fg: "#12161C" },
    T:  { label: "Tintaya",          clase: "trabajo",   bg: "#C0703A", fg: "#FFFFFF" },
    C:  { label: "Constancia",       clase: "trabajo",   bg: "#B8820F", fg: "#12161C" },
    A:  { label: "Antapaccay",       clase: "trabajo",   bg: "#A93529", fg: "#FFFFFF" },
    R1: { label: "Raciemsa turno 1", clase: "trabajo",   bg: "#3E4956", fg: "#EBEFF3" },
    R2: { label: "Raciemsa turno 2", clase: "trabajo",   bg: "#2B3441", fg: "#EBEFF3" },
    CV: { label: "Carro vacío",      clase: "trabajo",   bg: "#8B95A1", fg: "#12161C" },
    ET: { label: "En tránsito",      clase: "transito",  bg: "#59636F", fg: "#EBEFF3" },
    D:  { label: "Descanso",         clase: "descanso",  bg: "#EBEFF3", fg: "#59636F" },
    V:  { label: "Vacaciones",       clase: "descanso",  bg: "#D9DFE6", fg: "#59636F" },
    F:  { label: "Falta",            clase: "ausencia",  bg: "#A93529", fg: "#FFFFFF" },
    M:  { label: "Descanso médico",  clase: "ausencia",  bg: "#B8820F", fg: "#12161C" }
  },

  // ---- Reglas de agrupación del roster (punto 1) --------------------------
  // El grupo de un conductor NO es un campo: se cuenta cuántos códigos de
  // cada patrón tiene ese mes y gana el mayoritario. Si un conductor pasa a
  // otra operación, cambia de grupo solo. Cero configuración manual.
  // Empate: gana el grupo declarado primero (determinista a propósito).
  rosterGrupos: [
    { id: "minas",    label: "HUDBAY / OTRAS MINAS", patron: "^[HTCA]" },
    { id: "raciemsa", label: "RACIEMSA",             patron: "^R" }
  ],

  // ---- Mantenimiento: umbrales y avisos -----------------------------------
  // Los tres puntos de profundidad de un neumático se clasifican por el
  // MÍNIMO, no por el promedio: 12/12/4 mm no es un neumático a 9.3 mm de
  // vida, es un neumático gastado en un punto, y ese punto es el que
  // revienta. Los cortes van aquí para que un cliente con otro criterio de
  // contrato (algunas mineras exigen 8 mm) no necesite un despliegue.
  //
  // El PLAN PREVENTIVO no está aquí a propósito: vive en la colección
  // `config` (plan_preventivo) porque cambia por periodo y lo edita el
  // taller, no el desarrollador. En MISAGI estaba hardcodeado para siete
  // placas y además se leía de una colección que no existe — ese es el
  // origen de las dos hojas de Excel en blanco. Ver trazza-mantenimiento.js.
  mantenimiento: {
    neumatico: { baja: 6, reencauche: 9 },   // mm: <6 BAJA · 6–9 REENCAUCHE · ≥9 OPERATIVO
    avisoDias: 15,                            // "por vencer" desde 15 días antes
    avisoKm: 1000,                            // "por vencer" desde 1 000 km antes
    causal: { maxDias: 60, maxKm: 10000 }     // ventana MP → falla: las dos a la vez
  },

  // ---- Catálogos cerrados por defecto (punto 7) ---------------------------
  // Valores permitidos de campos que el módulo de consistencia audita. Se
  // pueden ampliar por tenant desde la colección `config` (cat_<campo>) sin
  // desplegar nada. Aquí viven los de arranque.
  catalogos: {
    tipoLavado:   ["INTERIOR", "EXTERIOR", "COMPLETO", "TOLVA"],
    tipoUnidad:   ["TRACTO", "TOLVA", "CARRETA", "CAMIONETA", "CISTERNA"],
    estadoUnidad: ["OPERATIVO", "TALLER", "BAJA"],
    moneda:       ["PEN", "USD"]
  },

  // ---- Rangos plausibles: los guardarraíles de captura --------------------
  // NO bloquean el guardado. Marcan el registro con revisar:true y un motivo.
  // Un sistema que impide registrar lo que pasó de verdad consigue que la
  // gente registre otra cosa. El de rendimiento es, en la práctica, un
  // detector de robo de combustible en vivo.
  rangos: {
    precioGalon:  { min: 8,   max: 30, motivo: "Precio por galón fuera de la banda de mercado." },
    precioKgGnl:  { min: 1,   max: 4,  motivo: "Precio por kg de GNL fuera de la banda de mercado." },
    rendimiento:  { min: 1.2, max: 12, motivo: "km/gal imposible: o falta un abastecimiento, o el odómetro está mal, o falta combustible." },
    saltoOdometro:{ max: 4000,          motivo: "Salto de odómetro grande entre dos registros: puede faltar uno intermedio." }
  }
};
