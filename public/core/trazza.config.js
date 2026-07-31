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

   QUÉ ES TRAZZA, PARA QUE ESTE ARCHIVO SE LEA BIEN
   -----------------------------------------------
   Trazza es un ERP de operación de flota, no una herramienta de viajes con
   accesorios. El catálogo de abajo es el mapa completo del producto: nueve
   grupos, y dentro de cada grupo las ventanas. Un tramo liquidado es UN
   módulo dentro de ese mapa —el más visible, no el único—. Por eso el orden
   de la aplicación es INGRESO -> PORTAL -> MÓDULO, y por eso ningún portal
   escribe módulos a mano: los lee de aquí.

   Y por eso existe el grupo MAESTROS. Un ERP se sostiene o se cae en si los
   maestros son fuente única: Personas con clave DNI, Unidades con clave
   placa, Rutas con su tarifa fechada. Sin eso, cada módulo inventa su propia
   verdad y a fin de mes ningún número cuadra con ningún otro.
   ========================================================================== */
window.TRAZZA_CONFIG = {

  // ---- Identidad de marca (reemplaza los textos hardcodeados del motor) ----
  // Nada de esto puede escribirse en el motor ni en las pantallas. La pantalla
  // de ingreso y el portal leen de aquí; si este bloque está en blanco, el
  // producto se ve como producto y no como el sistema de una sola empresa.
  marca: {
    nombre: "Trazza",            // nombre corto mostrado en cabeceras y <title>
    razonSocial: "REEMPLAZAR",   // razón social completa del cliente, para reportes/PDFs
    ruc: "REEMPLAZAR",           // RUC del cliente — pégalo aquí antes de emitir cualquier PDF
    color: "#12161C",            // --basalt, el primario de la identidad Trazza
    logoUrl: "/core/logo.svg"    // reemplazar cuando exista el archivo de logo
  },

  // ---- Credenciales del proyecto Firebase del tenant (SDK compat 10.12.2) ----
  // La apiKey web NO es secreta (es pública por diseño); la seguridad real
  // la dan las Firestore Security Rules (ver firestore.rules) y App Check.
  //
  // Los identificadores de abajo son INFRAESTRUCTURA, no marca: un projectId
  // de Firebase no se puede renombrar, y rehacerlo significaría rehacer Auth
  // y Firestore desde cero. Se quedan como están; no son la razón social de
  // nadie y no se muestran en ninguna pantalla.
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
  empresaId: "demo",

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
  // `orden` fija la secuencia en el riel y en la rejilla del portal: primero
  // lo que una persona usa todos los días, al final lo que se consulta.
  areas: {
    miespacio:    { label: "Mi espacio",          padre: null, orden: 1 },  // lo propio de cada persona
    operaciones:  { label: "Operaciones",         padre: "Flota", orden: 2 },
    mantenimiento:{ label: "Mantenimiento",       padre: "Flota", orden: 3 },
    maestros:     { label: "Maestros",            padre: null, orden: 4 },  // fuente única de verdad
    rrhh:         { label: "Recursos Humanos",    padre: null, orden: 5 },
    contabilidad: { label: "Contabilidad",        padre: null, orden: 6 },
    ssoma:        { label: "Seguridad y Salud (SSOMA)", padre: null, orden: 7 },
    planificacion:{ label: "Planificación",       padre: null, orden: 8 },
    comercial:    { label: "Comercial",           padre: null, orden: 9 },
    presupuesto:  { label: "Planeamiento y Presupuesto", padre: null, orden: 10 },
    administracion:{ label: "Administración",     padre: null, orden: 11 }  // gobierno del sistema
  },

  // ---- Rubros: capa de navegación (punto 4 del changelog) ------------------
  // Agrupa módulos hermanos SIN fusionar su código. Combustible, GNL y Lavado
  // se navegan como uno solo con una fila de rubro encima; cada uno sigue
  // siendo su propia página. El usuario percibe un módulo con pestañas, el
  // código sigue separado y desplegable por partes. El portal pinta UNA
  // tarjeta por rubro, con los miembros como chips.
  // El orden de este array es el orden en pantalla.
  rubros: [
    { id: "gastos", label: "Reporte de gastos", icono: "⛽", desc: "Combustible, GNL y lavado. Solo lectura: se carga por «Registrar gasto»." }
  ],

  // ---- Catálogo de módulos (punto 3 del changelog) -------------------------
  // Data-driven, no escrito a mano en cada portal. Cada entrada:
  //   id         clave interna, se usa en el campo `modulo` de los documentos
  //   label      lo que lee la persona
  //   area       permiso requerido (debe existir en `areas` de arriba)
  //   url        ruta relativa de la app
  //   estado     "activo" | "proximamente" | "oculto"
  //   soloAdmin  true = ni siquiera aparece para quien no es admin
  //   todos      true = basta con haber iniciado sesión; NO exige el permiso
  //              del área. Es la diferencia entre requireLogin y requireAccess:
  //              un conductor tiene que poder ver SU boleta sin tener permiso
  //              sobre todo Recursos Humanos.
  //   rubro      id de `rubros` si pertenece a un grupo de pestañas
  //   desc       una línea; se pinta bajo el título en el portal
  //
  // Esto es la capa de feature-flags por tenant: "oculto" apaga un módulo
  // para un cliente sin tocar código ni desplegar nada distinto, y
  // "proximamente" permite mostrar el roadmap dentro del propio producto sin
  // prometer una fecha. Un módulo no contratado no se muestra NI AL ADMIN:
  // no es un permiso, es un límite de contrato.
  modulos: [

    /* ---------- MI ESPACIO — todo el que entra, sin permisos de área ------- */
    { id: "misdatos",   label: "Mis datos",    area: "miespacio", url: "miespacio/datos/",      estado: "activo", todos: true, desc: "Tu información y solicitar cambios." },
    { id: "mistareas",  label: "Mis tareas",   area: "miespacio", url: "miespacio/tareas/",     estado: "activo", todos: true, desc: "Tareas que te asignaron." },
    { id: "misboletas", label: "Mis boletas",  area: "miespacio", url: "miespacio/boletas/",    estado: "activo", todos: true, desc: "Tus boletas de pago." },
    { id: "micts",      label: "Mi CTS",       area: "miespacio", url: "miespacio/cts/",        estado: "activo", todos: true, desc: "Tus depósitos de CTS." },
    { id: "miroster",   label: "Mi roster",    area: "miespacio", url: "miespacio/roster/",     estado: "activo", todos: true, desc: "Tus días trabajados." },
    { id: "misvacaciones", label: "Vacaciones", area: "miespacio", url: "miespacio/vacaciones/", estado: "activo", todos: true, desc: "Saldo y solicitar vacaciones." },

    /* ---------- FLOTA · OPERACIONES --------------------------------------- */
    { id: "programacion", label: "Programación diaria", area: "operaciones", url: "operaciones/programacion/", estado: "activo", desc: "Qué unidad sale, con quién y hacia dónde." },
    { id: "viajes",       label: "Viajes y liquidación", area: "operaciones", url: "operaciones/viajes/",     estado: "activo", desc: "Un tramo = un viaje. Aquí se liquida." },
    { id: "seguimiento",  label: "Seguimiento de unidades", area: "operaciones", url: "operaciones/seguimiento/", estado: "activo", desc: "Calendario por unidad: vueltas, taller y disponibilidad." },
    { id: "roster",       label: "Roster",             area: "operaciones", url: "operaciones/roster/",       estado: "activo", desc: "Grilla mensual; el grupo se deriva de los códigos." },
    { id: "gasto",        label: "Registrar gasto",    area: "operaciones", url: "operaciones/gasto/",        estado: "activo", desc: "La única puerta de gastos. Enruta por placa, con foto y guardarraíles." },
    { id: "combustible",  label: "Combustible",        area: "operaciones", url: "gastos/combustible/",       estado: "activo", rubro: "gastos", desc: "Diésel: galones, precio y rendimiento." },
    { id: "gnl",          label: "GNL",                area: "operaciones", url: "gastos/gnl/",               estado: "activo", rubro: "gastos", desc: "Gas natural licuado, solo para unidades habilitadas." },
    { id: "lavado",       label: "Lavado",             area: "operaciones", url: "gastos/lavado/",            estado: "activo", rubro: "gastos", desc: "Lavados por unidad y tipo." },
    { id: "documentos",   label: "Gestión documentaria", area: "operaciones", url: "operaciones/documentos/", estado: "activo", desc: "Documentos y vencimientos de unidades y conductores." },

    /* ---------- FLOTA · MANTENIMIENTO ------------------------------------- */
    { id: "estatus",     label: "Estatus de flota",   area: "mantenimiento", url: "mantenimiento/estatus/",     estado: "activo", desc: "Estado, llantas y mantenimiento de toda la flota." },
    { id: "ordenes",     label: "Órdenes de trabajo", area: "mantenimiento", url: "mantenimiento/ot/",          estado: "activo", desc: "OT correlativa por año, apertura y cierre." },
    { id: "neumaticos",  label: "Neumáticos",         area: "mantenimiento", url: "mantenimiento/neumaticos/",  estado: "activo", desc: "Matriz por posición; manda la lectura mínima." },
    { id: "preventivo",  label: "Plan preventivo",    area: "mantenimiento", url: "mantenimiento/preventivo/",  estado: "activo", desc: "MP programado contra ejecutado." },
    { id: "entregables", label: "Entregables de mantenimiento", area: "mantenimiento", url: "mantenimiento/entregables/", estado: "activo", desc: "Los formatos que exige el cliente, con vista previa antes de descargar." },

    /* ---------- MAESTROS — fuente única de verdad ------------------------- */
    { id: "unidades", label: "Unidades",         area: "maestros", url: "maestros/unidades/", estado: "activo", desc: "Tractos, tolvas y carretas. Clave: la placa." },
    { id: "personal", label: "Personas",         area: "maestros", url: "maestros/personas/", estado: "activo", desc: "Directorio único: conductores y administrativos. Clave: el DNI." },
    { id: "rutas",    label: "Rutas y tarifas",  area: "maestros", url: "maestros/rutas/",    estado: "activo", desc: "Tarifa por TNE y moneda; se fotografía a la fecha del viaje." },
    { id: "talleres", label: "Talleres",         area: "maestros", url: "maestros/talleres/", estado: "activo", desc: "Alimenta el desplegable «Taller» del reporte de fallas." },

    /* ---------- RECURSOS HUMANOS ----------------------------------------- */
    { id: "asistencia", label: "Asistencia",       area: "rrhh", url: "rrhh/asistencia/", estado: "activo", desc: "Marcaje de entrada y salida." },
    { id: "legajos",    label: "Personal (legajos)", area: "rrhh", url: "rrhh/personal/",  estado: "activo", desc: "Legajo completo: contratos, EMO, licencias." },
    { id: "boletas",    label: "Boletas y planilla", area: "rrhh", url: "rrhh/boletas/",   estado: "activo", soloAdmin: true, desc: "Genera las boletas de pago del periodo." },
    { id: "cts",        label: "CTS",              area: "rrhh", url: "rrhh/cts/",        estado: "activo", soloAdmin: true, desc: "Liquidación de CTS del personal." },

    /* ---------- CONTABILIDAD --------------------------------------------- */
    { id: "viaticos",     label: "Viáticos por viaje", area: "contabilidad", url: "contabilidad/viaticos/", estado: "activo", desc: "Los viáticos de cada tramo, tal como vienen de la hoja." },
    { id: "guias",        label: "Resumen de guías",   area: "contabilidad", url: "contabilidad/guias/",    estado: "activo", desc: "La guía es el DNI del tramo cargado." },
    { id: "cobrar",       label: "Cuentas por cobrar", area: "contabilidad", url: "contabilidad/cobrar/",   estado: "activo", desc: "Facturas por cliente: por cobrar, factoring, pagadas y detracción." },
    { id: "contabilidad", label: "Contabilidad",       area: "contabilidad", url: "contabilidad/",          estado: "proximamente", desc: "Libros, comprobantes y reportes." },

    /* ---------- SSOMA ----------------------------------------------------- */
    { id: "epp",        label: "EPP · Kardex y entregas", area: "ssoma", url: "ssoma/epp/",    estado: "activo", desc: "Stock de EPP, compras y entrega a cada trabajador." },
    { id: "gastosSsoma", label: "Gastos SSOMA",           area: "ssoma", url: "ssoma/gastos/", estado: "activo", desc: "Gastos de seguridad y salud." },
    { id: "ssoma",      label: "SSOMA",                   area: "ssoma", url: "ssoma/",        estado: "proximamente", desc: "Incidentes, inspecciones y capacitaciones." },

    /* ---------- PLANIFICACIÓN -------------------------------------------- */
    { id: "plan", label: "Plan mensual", area: "planificacion", url: "planificacion/plan/", estado: "activo", desc: "Plan de trabajo del mes contra lo que realmente pasó." },

    /* ---------- COMERCIAL / PRESUPUESTO ---------------------------------- */
    { id: "comercial",   label: "Comercial",   area: "comercial",   url: "comercial/",   estado: "proximamente", desc: "Clientes, cotizaciones y contratos." },
    { id: "presupuesto", label: "Presupuesto", area: "presupuesto", url: "presupuesto/", estado: "proximamente", desc: "Metas por periodo contra ejecución real." },

    /* ---------- ADMINISTRACIÓN — el gobierno del sistema ------------------ */
    { id: "tablero",      label: "Tablero gerencial",    area: "administracion", url: "gerencia/tablero/",      estado: "activo", soloAdmin: true, desc: "Indicadores de flota, costos, mantenimiento y metas." },
    { id: "utilidad",     label: "Rentabilidad",         area: "administracion", url: "gerencia/utilidad/",     estado: "activo", soloAdmin: true, desc: "Ingresos, gastos y utilidad por unidad, con la política a la vista." },
    { id: "accesos",      label: "Accesos del personal", area: "administracion", url: "gerencia/accesos/",      estado: "activo", soloAdmin: true, desc: "Crear y gestionar los ingresos del equipo." },
    { id: "enlaces",      label: "Accesos directos",     area: "administracion", url: "gerencia/enlaces/",      estado: "activo", desc: "Enlaces a carpetas y documentos, y quién los ve." },
    { id: "alertas",      label: "Alertas y vencimientos", area: "administracion", url: "gerencia/alertas/",    estado: "activo", desc: "Documentos, EMO, mantenimiento y correctivos por vencer." },
    { id: "solicitudes",  label: "Solicitudes",          area: "administracion", url: "gerencia/solicitudes/",  estado: "activo", desc: "Aprobar vacaciones y cambios del personal." },
    { id: "tareas",       label: "Tareas (delegar)",     area: "administracion", url: "gerencia/tareas/",       estado: "activo", desc: "Delegar y dar seguimiento a las tareas del equipo." },
    { id: "consistencia", label: "Consistencia de datos", area: "administracion", url: "gerencia/consistencia/", estado: "activo", soloAdmin: true, desc: "Qué registros están fuera de los totales y por qué." },
    { id: "respaldo",     label: "Respaldo de la base",  area: "administracion", url: "gerencia/respaldo/",     estado: "activo", soloAdmin: true, desc: "Descargar toda la información del sistema." }
  ],

  // ---- Diccionario de códigos del roster (punto 1 del changelog) ----------
  // clase: "trabajo" | "descanso" | "ausencia" | "transito"
  // Es lo que alimenta la barra de estado tipo Excel (TRAZZA.catalogo.resumen)
  // y la leyenda de colores. Cambiarlo por cliente es cambiar este objeto,
  // no tocar la grilla. Los códigos de trabajo son los DESTINOS del cliente:
  // aquí van genéricos a propósito, porque nombrar operaciones reales en el
  // motor es exactamente lo que este archivo existe para evitar.
  rosterCodigos: {
    O1: { label: "Operación 1",      clase: "trabajo",   bg: "#12897A", fg: "#FFFFFF" },
    O2: { label: "Operación 2",      clase: "trabajo",   bg: "#16B39C", fg: "#12161C" },
    O3: { label: "Operación 3",      clase: "trabajo",   bg: "#C0703A", fg: "#FFFFFF" },
    O4: { label: "Operación 4",      clase: "trabajo",   bg: "#B8820F", fg: "#12161C" },
    O5: { label: "Operación 5",      clase: "trabajo",   bg: "#A93529", fg: "#FFFFFF" },
    S1: { label: "Servicio 1",       clase: "trabajo",   bg: "#3E4956", fg: "#EBEFF3" },
    S2: { label: "Servicio 2",       clase: "trabajo",   bg: "#2B3441", fg: "#EBEFF3" },
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
    { id: "operaciones", label: "OPERACIONES", patron: "^O" },
    { id: "servicios",   label: "SERVICIOS",   patron: "^S" }
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
  // taller, no el desarrollador. En el sistema de origen estaba escrito a
  // fuego para un puñado de placas y además se leía de una colección que no
  // existía — ese es el origen de las dos hojas de Excel en blanco. Ver
  // trazza-mantenimiento.js.
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
