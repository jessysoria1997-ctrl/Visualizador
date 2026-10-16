/* ============================================================================
   asignacion.js — SECCIÓN «ESCAÑOS–ASIGNACIÓN»

   Aquí vive el **Simulador de Escaños Electorales**, incrustado en
   `asignacion/simulador.html`, y alrededor el tablero que le dice qué
   repartir: territorio, concejalía, circunscripción, padrón y participación.

   El recorrido es por pasos, cada uno aparece cuando el anterior está hecho:

     1. Provincia y cantón (panel lateral o mapa).
     2. Concejalía: solo las que de verdad elige ese cantón —urbanos, rurales
        o las dos—, con sus escaños.
     3. Circunscripción: solo en los cantones que eligen a sus concejales
        urbanos por circunscripción, una por botón y con su nombre EXACTO,
        el del Excel de escaños del cliente (data/circunscripciones.json,
        campo nombreOficial; ver preparar_nombres_circunscripciones.py).

   Con el distrito completo, el simulador se llena solo con las listas y los
   candidatos inscritos para 2027, sin votos, y con los escaños que se eligen
   (los que inscribió cada lista). Se escribe el porcentaje de cada lista y el
   reparto D'Hondt sale solo.

   El **mapa electoral** acompaña cada paso: la provincia con los escaños de
   cada cantón y, al elegir cantón, sus parroquias pintadas según la
   circunscripción que las elige, con los límites de cada una trazados sobre
   la cartografía parroquial del proyecto.

   Encima del simulador va el bloque de **participación**: parte del padrón
   vigente y descuenta ausentismo, nulos y blancos para llegar a los votos
   válidos sobre los que se aplican los porcentajes. Cada cambio pasa solo al
   simulador, sin perder los porcentajes de cada lista.

   El puente escribe el borrador que el simulador lee al arrancar
   (localStorage, clave `simuladorEscanos.v1.borrador`) y recarga el marco al
   cambiar de distrito. La participación viaja en vivo por postMessage.
   ========================================================================== */

/* Las únicas dignidades que se reparten en escaños. El orden es el del panel. */
const ASIG_DIGNIDADES = ['CONCEJALES_URBANOS', 'CONCEJALES_RURALES'];

/* La última elección: de ella salen SOLO los porcentajes de partida de la
   participación (ausentismo, nulos y blancos). Las listas, los candidatos y
   los escaños son los inscritos para la elección que se simula. */
const ASIG_ANIO = 2023;
const ASIG_ANIO_SIM = 2027;

/* Un color por tarjeta de participación, para que el bloque se lea de un golpe.
   El color viste la tarjeta —barra, fondo y etiqueta—, no la cifra: los cuatro
   números que se escriben van en negro y solo los dos resultados van
   pintados, para que se vea de un vistazo qué se teclea y qué se calcula. */
const PART_COLOR = {
  electores:  '#2A72C8',   /* azul     · el padrón del que se parte */
  ausentismo: '#D4553C',   /* coral    · lo que no vota */
  emitidos:   '#566070',   /* pizarra  · calculado: los que sí votaron */
  nulos:      '#1A8F62',   /* verde */
  blancos:    '#AE6E0C',   /* ámbar */
  votos:      'var(--acento)' /* el lila de concejales · la cifra que reparte */
};

/* Colores del mapa electoral, los mismos en el panel, la leyenda y la ficha.
   Las circunscripciones urbanas llevan tonos separados entre sí (azul,
   violeta, naranja tostado, petróleo) y ninguno se parece al verde de las
   parroquias rurales, para que dos vecinas no se confundan. */
const COLOR_URBANO = '#2A72C8';
const COLOR_RURAL = '#1A8F62';
const COLOR_SIN = '#B9B4A9';
const CIRC_COLORES = ['#2563B8', '#7B4AC7', '#C2410C', '#0F7C8C', '#A3376B'];

/* Dónde guarda el simulador lo que tiene en pantalla (ver su almacen.js). */
const ASIG_CLAVE_BORRADOR = 'simuladorEscanos.v1.borrador';
const ASIG_PAGINA = 'asignacion/simulador.html';

const ASIG = {
  /* El distrito que se analiza. `dignidad` vacía = concejalía sin elegir.
     `circ` es la circunscripción elegida y `circDe` el cantón en que se eligió:
     la circunscripción 2 de un cantón no es la 2 de otro. */
  origen: { dignidad: '', anio: null, provK: '', cantK: '', parrK: '', circ: 0, circDe: '' },
  /* Participación: ausentismo sobre el padrón; nulos y blancos sobre los
     votos emitidos. */
  part: { electores: 0, ausentismo: 0, nulos: 0, blancos: 0 },
  tocado: {},        // qué campos escribió el usuario: esos no se recalculan
  montado: false,
  cargado: null,     // qué hay en el simulador, para contarlo en la cabecera
  escanosPrueba: null, // escaños que se prueban en el simulador si no son los del distrito
  mapaProv: null     // el mapa de la sección, para no rehacerlo cada vez
};

/* Cuántos concejales elige cada cantón (data/escanos.json). */
const ESCANOS = { anio: null, tabla: {}, circuns: {}, cargado: false };

/** Descarga la tabla de escaños una sola vez. */
async function cargarEscanos() {
  if (ESCANOS.cargado) return;
  ESCANOS.cargado = true;
  try {
    const r = await fetch('data/escanos.json', { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    ESCANOS.anio = j.anio;
    ESCANOS.tabla = j.escanos || {};
    ESCANOS.circuns = j.circunscripciones || {};
  } catch (e) {
    console.warn('[Dashboard] tabla de escaños no disponible:', e);
  }
}

/**
 * Escaños de la tabla oficial (data/escanos.json) para un cantón o, con
 * `circN`, para esa circunscripción. Es solo el respaldo: lo que se reparte es
 * lo que dice el registro de inscripción (escanosParaSimular). Los de cada
 * circunscripción se toman de `escanosExcel`, emparejado por NOMBRE con el
 * Excel; el orden de las filas del Excel no sirve (en Quito va CENTRO, NORTE,
 * SUR, que no es el de sus números).
 */
function escanosTabla(dignidad, provK, cantK, circN) {
  const t = (ESCANOS.tabla || {})[dignidad];
  if (!t || !provK || !cantK) return null;
  const n = t[provK + '|' + cantK];
  if (!Number.isInteger(n)) return null;
  if (circN && dignidad === 'CONCEJALES_URBANOS') {
    const c = circunscripcionesDelCanton(provK, cantK).find(x => x.n === circN);
    return c && Number.isInteger(c.escanosExcel) ? c.escanosExcel : null;
  }
  return n;
}

/* Cantones que eligen sus concejales urbanos por circunscripción, con el
   padrón, las parroquias y el nombre oficial de cada una
   (data/circunscripciones.json). */
const CIRCUNS = { fuente: '', anio: null, nombres: null, cantones: {}, cargado: false };

async function cargarCircunscripciones() {
  if (CIRCUNS.cargado) return;
  CIRCUNS.cargado = true;
  try {
    const r = await fetch('data/circunscripciones.json', { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    CIRCUNS.fuente = j.fuente || '';
    CIRCUNS.anio = j.anio || null;
    CIRCUNS.nombres = j.nombres || null;
    CIRCUNS.cantones = j.cantones || {};
  } catch (e) {
    console.warn('[Dashboard] circunscripciones no disponibles:', e);
  }
}

/** Las circunscripciones urbanas del cantón, o [] si elige en una sola. */
function circunscripcionesDelCanton(provK, cantK) {
  if (!provK || !cantK) return [];
  const d = (CIRCUNS.cantones || {})[provK + '|' + cantK];
  return (d && Array.isArray(d.urbanas)) ? d.urbanas : [];
}

/** Lo que no cuadra entre el Excel y el registro en ese cantón. */
function avisosExcel(provK, cantK) {
  const d = (CIRCUNS.cantones || {})[provK + '|' + cantK];
  return (d && d.excel) || null;
}

/**
 * El nombre de una circunscripción, LITERAL: el del Excel de escaños del
 * cliente o, si no figura ahí, el del registro de inscripción 2027. Nunca se
 * pasa a minúsculas, ni se le añaden tildes, ni se abrevia.
 */
function nombreCircun(c) {
  return (c && (c.nombreOficial || c.nombreRegistro || c.nombre)) || '';
}

/** Color de una circunscripción urbana, por su número. */
function colorCircun(n) {
  return CIRC_COLORES[((n || 1) - 1) % CIRC_COLORES.length];
}

/** El número que lleva una circunscripción en el registro de preinscritos
    («CIRCUNSCRIPCION URBANA 2» → 2). 0 si la fila no trae ninguna. */
function numeroCircun(texto) {
  const m = String(texto == null ? '' : texto).match(/(\d+)\s*$/);
  return m ? parseInt(m[1], 10) : 0;
}

/** «Quito», «Quito y Rumiñahui», «A, B y C»: una lista que se lee. */
function enumerar(xs) {
  if (xs.length < 2) return xs[0] || '';
  return xs.slice(0, -1).join(', ') + ' y ' + xs[xs.length - 1];
}

/** La circunscripción elegida, si la dignidad y el cantón la tienen. */
function circunActiva() {
  const o = ASIG.origen;
  if (o.dignidad !== 'CONCEJALES_URBANOS' || !o.circ) return null;
  return circunscripcionesDelCanton(o.provK, o.cantK).find(c => c.n === o.circ) || null;
}

/** Escaños de cada circunscripción en la tabla oficial, en el orden de sus
    números, o null si el cantón no se parte. */
function circunsDelCanton(dignidad, provK, cantK) {
  if (dignidad !== 'CONCEJALES_URBANOS') return null;
  const cs = circunscripcionesDelCanton(provK, cantK);
  if (cs.length < 2) return null;
  const v = cs.map(c => c.escanosExcel);
  return v.every(Number.isInteger) ? v : null;
}

/** Nombre corto de la dignidad («Concejales urbanos»). */
function etiquetaDignidad(dig) {
  return (typeof HIST !== 'undefined' && HIST.etiquetas && HIST.etiquetas[dig]) ||
    ((CONFIG.dignidadesHistorico || []).find(x => x.id === dig) || {}).etiqueta || dig;
}


/* ============================================================================
   ENTRADA
   ========================================================================== */

/** La llama activarSeccion() al abrir la pestaña. */
async function abrirAsignacion() {
  const o = ASIG.origen;
  /* El padrón urbano y el rural salen de los recintos y de la capa
     parroquial: se piden antes de calcular nada. */
  await Promise.all([
    cargarEscanos(),
    cargarCircunscripciones(),
    (typeof cargarRecintos === 'function') ? cargarRecintos() : null,
    (typeof cargarParroquias === 'function' && !TERRITORIO.parroquiasPorCant.size)
      ? cargarParroquias() : null
  ].filter(Boolean));
  if (!ASIG.montado) {
    const a = (typeof alcanceClaves === 'function') ? alcanceClaves() : null;
    if (a) { o.provK = a.provK; o.cantK = a.cantK || ''; }
  }
  /* El territorio se comparte con las otras dos secciones: se entra con el que
     venía de allá, salvo que aquí ya se hubiera elegido otro. */
  const f = (typeof SEC !== 'undefined' && SEC.filtros) ? SEC.filtros.historico : null;
  let otroTerritorio = false;
  if (f && f.provK && (f.provK !== o.provK || f.cantK !== o.cantK)) {
    if (o.cantK !== f.cantK) ASIG.tocado = {};
    o.provK = f.provK;
    o.cantK = f.cantK || '';
    otroTerritorio = true;
  }
  o.parrK = '';                         // los concejales se eligen por cantón
  /* Si ya estaba montada y el territorio cambió en otra sección, se rehace
     todo como si se hubiera elegido aquí. Si no cambió, se deja el simulador
     como estaba, con los porcentajes que se hubieran escrito. */
  if (ASIG.montado && document.getElementById('a-marco')) {
    if (otroTerritorio) { alCambiarOrigen(); return; }
    o.anio = anioDeTrabajo();
    construirPanelAsignacion();
    renderAsignacion();
    /* La pestaña estuvo oculta: Leaflet necesita remedir su contenedor. */
    if (ASIG.mapaProv) setTimeout(() => { try { ASIG.mapaProv.map.invalidateSize(); } catch (e) { /* sin mapa */ } }, 30);
    return;
  }
  ajustarSeleccion();
  o.anio = anioDeTrabajo();
  recalcularParticipacion();
  construirPanelAsignacion();
  renderAsignacion();
}


/* ============================================================================
   ESTRUCTURA ELECTORAL DEL CANTÓN

   Qué concejalías elige cada cantón y, en los urbanos, en qué
   circunscripciones. Sale de los datos reales —el registro de inscripción y
   la tabla oficial de escaños—, nunca de una lista fija: Durán, por ejemplo,
   no elige concejales rurales, y Quito elige los urbanos en tres
   circunscripciones.
   ========================================================================== */

/**
 * Las concejalías que elige el cantón, con sus escaños, su padrón y, en los
 * urbanos de los cantones grandes, sus circunscripciones. Una concejalía
 * aparece si el registro de inscripción trae listas o la tabla oficial trae
 * escaños; si no, no se ofrece.
 */
function opcionesDelCanton(provK, cantK) {
  if (!provK || !cantK) return [];
  return dignidadesAsignacion().map(dig => {
    const esc = escanosParaSimular(dig, provK, cantK, 0);
    if (!esc && !listasPreinscritas(dig, provK, cantK, 0).length) return null;
    const circs = dig === 'CONCEJALES_URBANOS'
      ? circunscripcionesDelCanton(provK, cantK).map(c => {
          const e = escanosParaSimular(dig, provK, cantK, c.n);
          return { n: c.n, nombre: nombreCircun(c), color: colorCircun(c.n),
                   escanos: e ? e.n : null, electores: padronDistrito(dig, provK, cantK, c.n), datos: c };
        })
      : [];
    return {
      dignidad: dig, etiqueta: etiquetaDignidad(dig),
      escanos: esc ? esc.n : null, fuente: esc ? esc.fuente : null,
      color: dig === 'CONCEJALES_URBANOS' ? COLOR_URBANO : COLOR_RURAL,
      electores: padronDistrito(dig, provK, cantK, 0),
      circs
    };
  }).filter(Boolean);
}

/**
 * Deja la concejalía y la circunscripción de acuerdo con el cantón: suelta lo
 * que ya no le corresponde y, si el cantón elige una sola concejalía, la
 * marca, porque no hay nada que preguntar. La circunscripción nunca se elige
 * sola: si hay varias, se pide.
 */
function ajustarSeleccion() {
  const o = ASIG.origen;
  if (!o.provK || !o.cantK) { o.circ = 0; return; }
  const ops = opcionesDelCanton(o.provK, o.cantK);
  if (o.dignidad && !ops.some(x => x.dignidad === o.dignidad)) o.dignidad = '';
  if (!o.dignidad && ops.length === 1) o.dignidad = ops[0].dignidad;
  const op = ops.find(x => x.dignidad === o.dignidad);
  const circs = op ? op.circs : [];
  if (o.circ && (o.circDe !== o.provK + '|' + o.cantK || !circs.some(c => c.n === o.circ))) {
    o.circ = 0;
    o.circDe = '';
  }
}

/** Qué falta por elegir para tener un distrito completo, o '' si ya está. */
function faltaDistrito() {
  const o = ASIG.origen;
  if (!o.provK) return 'provincia';
  if (!o.cantK) return 'canton';
  if (!o.dignidad) return 'dignidad';
  if (o.dignidad === 'CONCEJALES_URBANOS' &&
      circunscripcionesDelCanton(o.provK, o.cantK).length && !circunActiva()) return 'circ';
  return '';
}

const ASIG_NIVEL_TXT = { provincia: 'una provincia', canton: 'un cantón',
                         dignidad: 'la concejalía', circ: 'una circunscripción' };

/** Las dignidades de concejales con datos para este usuario. */
function dignidadesAsignacion() {
  return ASIG_DIGNIDADES.filter(id => (HIST.votos[id] || []).length);
}

/** Cambia la concejalía o la circunscripción (desde el panel o el mapa). */
function seleccionarDistrito(dig, circN) {
  const o = ASIG.origen;
  const n = dig === 'CONCEJALES_URBANOS' ? (circN || 0) : 0;
  if (o.dignidad === dig && (o.circ || 0) === n) return;
  o.dignidad = dig;
  o.circ = n;
  o.circDe = n ? o.provK + '|' + o.cantK : '';
  /* Otro distrito, otro padrón: la participación vuelve a salir de cero. */
  ASIG.tocado = {};
  alCambiarOrigen();
}

/** Sube de nivel desde la ruta de la cabecera o el botón del mapa. */
function irANivel(nivel) {
  const o = ASIG.origen;
  if (nivel === 'pais') { o.provK = ''; o.cantK = ''; }
  else if (nivel === 'provincia') { o.cantK = ''; }
  else if (nivel === 'canton') { o.dignidad = ''; o.circ = 0; o.circDe = ''; }
  else if (nivel === 'dignidad') { o.circ = 0; o.circDe = ''; }
  ASIG.tocado = {};
  alCambiarOrigen();
}


/* ============================================================================
   PARTICIPACIÓN

   De cuántos electores se parte y cuántos votos válidos quedan. Cada
   porcentaje va sobre su propia base, como en los datos oficiales: el
   ausentismo sobre el padrón; los nulos y los blancos sobre los emitidos.

       electores − ausentes              = votos emitidos
       emitidos − nulos − blancos        = votos válidos

   Los porcentajes de partida salen de la última elección en ese territorio:
   los ausentes son los electores del padrón menos quienes votaron entonces, y
   los nulos y los blancos los de aquella elección. Solo eso se toma de ella:
   las listas y los escaños son los inscritos. Cualquiera de los cuatro campos
   se puede escribir, y cada cambio pasa solo al simulador.
   ========================================================================== */

/**
 * Padrón de un distrito: el urbano o el rural del cantón y, con una
 * circunscripción, la parte que le toca del urbano en la proporción del
 * distributivo del CNE. A los concejales urbanos los eligen solo las
 * parroquias urbanas y a los rurales solo las rurales: usar el padrón del
 * cantón entero inflaría el ausentismo (en Quito, del 19 % al 43 %).
 */
function padronDistrito(dig, provK, cantK, circN) {
  const partes = padronPorTipo(provK, cantK);
  if (!partes) return null;
  const base = dig === 'CONCEJALES_URBANOS' ? partes.urbano : partes.rural;
  if (circN && dig === 'CONCEJALES_URBANOS') {
    const c = circunscripcionesDelCanton(provK, cantK).find(x => x.n === circN);
    return c ? Math.round(base * (c.parte || 0)) : null;
  }
  return base;
}

/**
 * Padrón que elige la dignidad elegida, con la circunscripción elegida. Si los
 * recintos o la capa parroquial no están cargados todavía, se devuelve el
 * padrón del cantón y la ayuda de pantalla lo dice.
 */
function electoresDelCanton(dignidad, provK, cantK) {
  if (!provK || !cantK) return { n: 0, tipo: null };
  const completo = (typeof ELECTORES !== 'undefined' && ELECTORES.disponible)
    ? (ELECTORES.cantones[provK + '|' + cantK] || 0) : 0;
  const quiere = dignidad === 'CONCEJALES_URBANOS' ? true
               : dignidad === 'CONCEJALES_RURALES' ? false : null;
  if (quiere === null) return { n: completo, tipo: null, cantonal: completo };
  const partes = padronPorTipo(provK, cantK);
  if (!partes) return { n: completo, tipo: null, cantonal: completo };
  const base = quiere ? partes.urbano : partes.rural;
  /* `cantonal` es el padrón urbano (o rural) del cantón entero, que es la base
     de los porcentajes de la última elección. */
  const c = circunActiva();
  if (c && quiere) {
    return { n: padronDistrito(dignidad, provK, cantK, c.n), tipo: 'urbano', circ: c, cantonal: base };
  }
  return { n: base, tipo: quiere ? 'urbano' : 'rural', cantonal: base };
}

/* Padrón urbano y rural de cada cantón; se arma una vez y se guarda. */
const PADRON_TIPO = new Map();

function padronPorTipo(provK, cantK) {
  const clave = provK + '|' + cantK;
  if (PADRON_TIPO.has(clave)) return PADRON_TIPO.get(clave);
  if (typeof RECINTOS === 'undefined' || !RECINTOS.datos ||
      typeof TERRITORIO === 'undefined' || !TERRITORIO.parroquiasPorCant.size ||
      typeof resolverParroquia !== 'function') return null;

  let urbano = 0, rural = 0, sinTipo = 0;
  RECINTOS.datos.lista.forEach(r => {
    if (r.provK !== provK || r.cantK !== cantK) return;
    const geo = TERRITORIO.porParrK.get(
      provK + '|' + cantK + '|' + resolverParroquia(provK, cantK, normalizarTexto(r.parroquia)));
    /* El tipo es el campo «estado» de la capa parroquial del CNE: URBANA o
       RURAL. */
    const estado = geo && geo.feature && geo.feature.properties
      ? normalizarTexto(geo.feature.properties.estado || '') : '';
    if (estado === 'URBANA') urbano += r.electores || 0;
    else if (estado === 'RURAL') rural += r.electores || 0;
    else sinTipo += r.electores || 0;
  });
  const out = (urbano + rural) ? { urbano, rural, sinTipo } : null;
  PADRON_TIPO.set(clave, out);
  return out;
}

/** El año de la serie que se está usando, o null. */
function anioDeOrigen() {
  const serie = serieDeOrigen();
  if (!serie.length) return null;
  return (serie.find(x => x.anio === ASIG.origen.anio) || serie[serie.length - 1]);
}

/**
 * Rellena los campos que el usuario no ha tocado con los datos de la
 * elección. Los que escribió se respetan.
 */
function recalcularParticipacion(forzar) {
  const o = ASIG.origen;
  const p = ASIG.part;
  const t = forzar ? {} : ASIG.tocado;
  if (forzar) ASIG.tocado = {};

  const padron = electoresDelCanton(o.dignidad, o.provK, o.cantK);
  ASIG.tipoPadron = padron.tipo;
  if (!t.electores) p.electores = padron.n || 0;

  const s = anioDeOrigen();
  const E = p.electores;
  /* Los datos de la última elección son del cantón entero. Con una
     circunscripción elegida el padrón es solo su parte, así que el ausentismo
     se toma como la TASA del cantón y no como una resta entre el padrón de la
     circunscripción y los votos de todo el cantón. */
  const Ec = padron.cantonal || E;
  ASIG.sinReferencia = !s;
  if (!s || !E) {
    if (!t.ausentismo) p.ausentismo = 0;
    if (!t.nulos) p.nulos = 0;
    if (!t.blancos) p.blancos = 0;
    return;
  }
  const emitidos = s.validos + s.nulos + s.blancos;
  if (!t.ausentismo) p.ausentismo = Math.max(0, (Ec - emitidos) * 100 / Ec);
  if (!t.nulos) p.nulos = emitidos ? s.nulos * 100 / emitidos : 0;
  if (!t.blancos) p.blancos = emitidos ? s.blancos * 100 / emitidos : 0;
}

/** La cuenta completa, tal como se muestra. */
function cuentaParticipacion() {
  const p = ASIG.part;
  const E = Math.max(0, Math.round(p.electores) || 0);
  const pct = (x) => Math.max(0, Number(x) || 0);
  const pa = Math.min(100, pct(p.ausentismo));
  const pn = pct(p.nulos), pb = pct(p.blancos);
  /* Cada cantidad se redondea una sola vez y el último paso es una resta: así
     no sobra ni falta un voto. */
  const ausentes = Math.round(E * pa / 100);
  const emitidos = E - ausentes;
  const nulos = Math.round(emitidos * pn / 100);
  const blancos = Math.round(emitidos * pb / 100);
  const validos = emitidos - nulos - blancos;
  const pv = 100 - pn - pb;            // % de válidos sobre los emitidos
  const pp = 100 - pa;                 // participación sobre el padrón
  return { E, pa, pn, pb, pv, pp, ausentes, emitidos, nulos, blancos, validos,
           valido: pv >= 0 && E > 0 && emitidos >= 0 };
}

/** Serie del histórico para la dignidad elegida, o [] si no hay datos. */
function serieDeOrigen() {
  const o = ASIG.origen;
  if (typeof serieHistorica !== 'function' || !o.dignidad || !(o.dignidad in HIST.votos)) return [];
  if (!o.provK || !o.cantK) return [];   // el reparto es de un cantón
  try { return serieHistorica(o.dignidad, o.provK, o.cantK, ''); }
  catch (e) { console.warn('[Dashboard] asignación:', e); return []; }
}

/** El año del que salen los porcentajes de partida de la participación: la
    última elección. No decide nada más: listas y escaños son los inscritos. */
function anioDeTrabajo() {
  const serie = serieDeOrigen();
  if (!serie.length) return ASIG_ANIO;
  return serie.some(s => s.anio === ASIG_ANIO) ? ASIG_ANIO : serie[serie.length - 1].anio;
}


/* ============================================================================
   PANEL LATERAL · por pasos

   01 Territorio (provincia y cantón). 02 Concejalía y 03 Circunscripción solo
   aparecen cuando hay cantón, y solo con las opciones que ese cantón tiene.
   ========================================================================== */

function construirPanelAsignacion() {
  const cont = document.getElementById('filtros-asignacion');
  if (!cont) return;
  const o = ASIG.origen;

  /* Provincia o cantón nuevos: el padrón y las listas son otros, así que la
     participación vuelve a salir de cero aunque se hubiera escrito. */
  const alTerritorio = () => { ASIG.tocado = {}; alCambiarOrigen(); };
  /* Territorio con el mismo control del histórico —respeta el alcance del
     usuario— pero sin parroquia: los concejales se eligen por cantón. */
  const terr = selectoresTerritorio(o, alTerritorio, 'a', { sinParroquia: true });
  const ops = (o.provK && o.cantK) ? opcionesDelCanton(o.provK, o.cantK) : [];
  const op = ops.find(x => x.dignidad === o.dignidad) || null;
  const circs = op ? op.circs : [];
  const canton = o.cantK ? ambitoTexto({ provK: o.provK, cantK: o.cantK }) : '';
  const nEsc = (n) => n != null ? `${fmtNum(n)} ${n === 1 ? 'escaño' : 'escaños'}` : 'Escaños por confirmar';

  const botonOp = (x) => `
    <button type="button" class="dig-btn asig-op${x.dignidad === o.dignidad ? ' activo' : ''}"
            data-d="${x.dignidad}" style="--dig-color:${x.color}" aria-pressed="${x.dignidad === o.dignidad}">
      <span class="dig-nombre">${escaparHTML(x.etiqueta.toUpperCase())}</span>
      <span class="dig-nivel">${nEsc(x.escanos)}${x.circs.length
        ? ` · ${x.circs.length} circunscripciones` : ''}</span>
    </button>`;

  const botonCirc = (c) => `
    <button type="button" class="dig-btn asig-op asig-op--circ${c.n === o.circ ? ' activo' : ''}"
            data-c="${c.n}" style="--dig-color:${c.color}" aria-pressed="${c.n === o.circ}">
      <span class="asig-op-fila"><i class="asig-op-punto" aria-hidden="true"></i>
        <span class="dig-nombre">${escaparHTML(c.nombre)}</span></span>
      <span class="dig-nivel">${nEsc(c.escanos)}${c.electores ? ` · ${fmtNum(c.electores)} electores` : ''}</span>
    </button>`;

  cont.innerHTML = `
    <section class="bloque">
      <h2 class="bloque-tit"><i class="ix">01</i> Territorio</h2>
      <p class="bloque-ayuda">Elige la provincia y el cantón. Después aparecen sus concejalías
        y, si las tiene, sus circunscripciones.</p>
      ${terr.html}
    </section>
    ${o.cantK ? `<section class="bloque">
      <h2 class="bloque-tit"><i class="ix">02</i> Concejalía</h2>
      <p class="bloque-ayuda">${ops.length > 1
        ? `${escaparHTML(canton)} elige concejales urbanos y rurales: elige cuáles simular.`
        : ops.length === 1
          ? `${escaparHTML(canton)} solo elige ${escaparHTML(ops[0].etiqueta.toLowerCase())}.`
          : `No hay concejalías con datos para ${escaparHTML(canton)}.`}</p>
      <div class="dig-grupo" id="a-dig">${ops.map(botonOp).join('')}</div>
    </section>` : ''}
    ${circs.length ? `<section class="bloque">
      <h2 class="bloque-tit"><i class="ix">03</i> Circunscripción</h2>
      <p class="bloque-ayuda">${escaparHTML(canton)} elige sus concejales urbanos en
        ${circs.length} circunscripciones, cada una con sus propios escaños, listas y
        candidatos.${o.circ ? '' : ' <b>Elige una para simularla.</b>'}</p>
      <div class="dig-grupo" id="a-circs">${circs.map(botonCirc).join('')}</div>
    </section>` : ''}`;

  terr.cablear();
  cont.querySelectorAll('#a-dig [data-d]').forEach(b => {
    b.onclick = () => {
      if (o.dignidad === b.dataset.d) return;
      seleccionarDistrito(b.dataset.d, 0);
    };
  });
  cont.querySelectorAll('#a-circs [data-c]').forEach(b => {
    b.onclick = () => seleccionarDistrito('CONCEJALES_URBANOS', parseInt(b.dataset.c, 10) || 0);
  });
}

/** Abre o cierra el panel con las listas y los candidatos inscritos. */
function alternarPreinscritas(btn) {
  const panel = document.getElementById('a-preinscritas');
  if (!panel) return;
  const abrir = panel.hidden;
  if (abrir) panel.innerHTML = htmlPreinscritas();
  panel.hidden = !abrir;
  ASIG.prePanelAbierto = abrir;
  btn.setAttribute('aria-expanded', abrir ? 'true' : 'false');
  btn.textContent = abrir ? 'Ocultar listas preinscritas' : 'Ver listas preinscritas';
}

/** El panel abierto se queda con las listas del filtro nuevo. */
function refrescarPreinscritas() {
  const btnPre = document.getElementById('a-ver-pre');
  const panelPre = document.getElementById('a-preinscritas');
  if (btnPre && panelPre && ASIG.prePanelAbierto) {
    panelPre.innerHTML = htmlPreinscritas();
    panelPre.hidden = false;
    btnPre.setAttribute('aria-expanded', 'true');
    btnPre.textContent = 'Ocultar listas preinscritas';
  }
}

/** El registro de preinscritos de este filtro, tal como está: cada lista con
    su organización y sus candidatos en su orden de inscripción. */
function htmlPreinscritas() {
  const o = ASIG.origen, circ = circunActiva();
  if (faltaDistrito()) {
    return `<p class="pre-vacio">Elige ${ASIG_NIVEL_TXT[faltaDistrito()]} para ver sus listas inscritas.</p>`;
  }
  const listas = preinscritosDeOrigen();
  const ambito = ambitoTexto({ provK: o.provK, cantK: o.cantK });
  const etq = etiquetaDignidad(o.dignidad);
  if (!listas.length) {
    return `<p class="pre-vacio">No hay listas inscritas para ${escaparHTML(etq.toLowerCase())}
      en ${escaparHTML(circ ? nombreCircun(circ) : ambito)}.</p>`;
  }
  const nCand = listas.reduce((a, x) => a + x.candidatos.length, 0);
  return `
    <p class="pre-cab">${escaparHTML(ambito)}${circ ? ` · <span class="asig-circ-nom">${escaparHTML(nombreCircun(circ))}</span>` : ''}
      <span class="pre-dig">${escaparHTML(etq)}</span></p>
    <p class="pre-nota">${fmtNum(listas.length)} ${listas.length === 1 ? 'lista' : 'listas'}
      ${nCand ? ' · ' + fmtNum(nCand) + (nCand === 1 ? ' candidato' : ' candidatos') : ''}.
      Son los registros del padrón de preinscritos de este tablero, sin añadir ni corregir ninguno.</p>
    <ol class="pre-listas">
      ${listas.map(x => `<li class="pre-lista">
        <p class="pre-org">${x.lista ? `<span class="pre-num">Lista ${escaparHTML(x.lista)}</span>` : ''}
          <span class="pre-partido">${escaparHTML(tituloCase(x.partido))}</span>
          <span class="pre-cuenta">${x.candidatos.length
            ? fmtNum(x.candidatos.length) + (x.candidatos.length === 1 ? ' candidato' : ' candidatos')
            : fmtNum(x.n) + ' registros'}</span></p>
        ${x.candidatos.length ? `<ol class="pre-cands">
          ${x.candidatos.map(c => `<li><span class="pre-orden">${c.orden}</span>
            <span class="pre-dato"><span class="pre-nom">${escaparHTML(tituloCase(c.nombre))}</span>
            ${c.suplente ? `<span class="pre-sup">Suplente: ${escaparHTML(tituloCase(c.suplente))}</span>` : ''}</span></li>`).join('')}
        </ol>` : '<p class="pre-sin">Los candidatos de esta lista se inscriben por circunscripción.</p>'}
      </li>`).join('')}
    </ol>`;
}

/** Cambió la provincia, el cantón, la concejalía o la circunscripción: se
    rehace la sección y, con el distrito completo, el simulador se carga con
    las listas inscritas. */
function alCambiarOrigen() {
  const o = ASIG.origen;
  ajustarSeleccion();
  o.anio = anioDeTrabajo();
  recalcularParticipacion();
  construirPanelAsignacion();
  /* Con un solo cantón posible, pintarMapaAsig() lo elige y vuelve a llamar a
     esta función, que ya lo deja todo hecho: no se repite. */
  if (pintarMapaAsig() === 'delegado') return;
  pintarParticipacion();
  refrescarPreinscritas();
  if (ASIG.montado) {
    if (faltaDistrito()) retirarSimulador(textoEspera()); else simularAsignacion(true);
  }
  actualizarCabeceraAsignacion();
}


/* ============================================================================
   EL PUENTE

   El simulador guarda y recupera lo que tiene en pantalla en localStorage.
   Al cambiar de distrito se escribe ahí el escenario nuevo —las listas
   inscritas, sin votos— y se recarga el marco. La participación viaja en vivo
   por postMessage para no borrar los porcentajes que ya se escribieron.
   ========================================================================== */

/** Origen al que se mandan los mensajes: el mismo servidor del tablero. */
function destinoMensajes() {
  const o = window.location.origin;
  return (o && o !== 'null') ? o : '*';
}

/* Lo que dice el sitio del simulador mientras no hay nada que repartir. */
const ASIG_ESPERA_TXT = 'Elige la provincia y el cantón —en el panel de la izquierda o en el ' +
  'mapa—, después la concejalía y, si la tiene, la circunscripción. El simulador se llena ' +
  'con sus listas y sus candidatos inscritos.';

/** Qué falta, dicho para el sitio del simulador. */
function textoEspera() {
  const f = faltaDistrito(), o = ASIG.origen;
  if (!f) return '';
  const canton = o.cantK ? ambitoTexto({ provK: o.provK, cantK: o.cantK }) : '';
  if (f === 'dignidad') {
    return `Elige la concejalía de ${canton} —en el panel de la izquierda o en el mapa— para cargar ` +
      'sus listas inscritas en el simulador.';
  }
  if (f === 'circ') {
    return `${canton} elige sus concejales urbanos por circunscripción. Elige una —en el panel ` +
      'o en el mapa— para cargar sus listas y sus candidatos.';
  }
  return ASIG_ESPERA_TXT;
}

/** Enseña el simulador o el aviso que ocupa su sitio, con su texto. */
function mostrarMarco(ver, texto) {
  const marco = document.getElementById('a-marco');
  const espera = document.getElementById('a-espera');
  const txt = document.getElementById('a-espera-txt');
  if (marco) marco.hidden = !ver;
  if (espera) espera.hidden = !!ver;
  if (txt && !ver) txt.textContent = texto || ASIG_ESPERA_TXT;
}

/** true si el cantón elegido no elige esta dignidad (no hay listas ni
    escaños). La selección por pasos ya no la ofrece; queda como resguardo. */
function noEligeDignidad() {
  if (faltaDistrito()) return false;
  return !escanosDeOrigen() && !preinscritosDeOrigen().length;
}

/** El aviso para ese caso, con el nombre del cantón y de la dignidad. */
function textoNoElige() {
  const o = ASIG.origen;
  const etq = etiquetaDignidad(o.dignidad).toLowerCase();
  return `${ambitoTexto({ provK: o.provK, cantK: o.cantK })} no elige ${etq}: no hay listas ` +
    'inscritas ni escaños para esta dignidad. Elige otra concejalía u otro cantón.';
}

/** Deja un escenario escrito para el simulador y recarga el marco. */
function ponerEnSimulador(escenario) {
  ASIG.escanosPrueba = null;
  try {
    localStorage.setItem(ASIG_CLAVE_BORRADOR, JSON.stringify({
      trabajo: escenario, base: escenario, esEjemplo: false,
      ui: { decimales: 0, rangoSliders: 0.5 }
    }));
  } catch (e) {
    if (typeof avisar === 'function') avisar('El navegador no deja guardar datos; escribe las listas en el simulador');
    return false;
  }
  const marco = document.getElementById('a-marco');
  if (marco) {
    marco.src = ASIG_PAGINA + '?v=' + CONFIG.version + '&t=' + Date.now();
    mostrarMarco(true);
  }
  return true;
}

/** Sin distrito completo no hay listas que repartir: el simulador se descarga
    y en su sitio queda el aviso, para no dejar a la vista otro territorio. */
function retirarSimulador(texto) {
  ASIG.cargado = null;
  ASIG.escanosPrueba = null;
  const marco = document.getElementById('a-marco');
  if (marco && marco.getAttribute('src') && marco.getAttribute('src') !== 'about:blank') {
    marco.src = 'about:blank';
  }
  mostrarMarco(false, texto);
}

/**
 * Pasa al simulador abierto la cuenta de participación: los votos válidos
 * sobre los que se aplican los porcentajes, y los blancos y los nulos. Si la
 * cuenta no deja votos válidos no se manda nada: el bloque de participación
 * ya avisa de que hay que corregirla.
 */
function enviarParticipacion() {
  const marco = document.getElementById('a-marco');
  if (!marco || marco.hidden || !marco.contentWindow || faltaDistrito()) return;
  const c = cuentaParticipacion();
  if (!c.valido || !(c.validos > 0)) return;
  try {
    marco.contentWindow.postMessage({
      tipo: 'tablero/participacion', validos: c.validos, blancos: c.blancos, nulos: c.nulos
    }, destinoMensajes());
  } catch (e) {
    /* El marco se está recargando: al arrancar pide la cuenta él mismo. */
  }
}

/** El simulador avisa cuando termina de arrancar y entonces se le manda la
    participación de ese momento: cubre los cambios hechos mientras cargaba. */
function escucharAlSimulador() {
  if (ASIG.escuchando) return;
  ASIG.escuchando = true;
  window.addEventListener('message', (e) => {
    const marco = document.getElementById('a-marco');
    if (!marco || e.source !== marco.contentWindow) return;
    const destino = destinoMensajes();
    if (destino !== '*' && e.origin !== destino) return;
    const d = e.data;
    if (d && typeof d === 'object' && d.tipo === 'simulador/listo') enviarParticipacion();
    /* El selector de escaños del simulador: si se prueba otro número que el
       del distrito, la cabecera lo dice. */
    if (d && typeof d === 'object' && d.tipo === 'simulador/escanos') {
      const n = Math.round(Number(d.escanos)), b = Math.round(Number(d.base));
      ASIG.escanosPrueba = n > 0 && b > 0 && n !== b ? n : null;
      actualizarCabeceraAsignacion();
    }
  });
}


/* ============================================================================
   LISTAS, CANDIDATOS Y ESCAÑOS INSCRITOS
   ========================================================================== */

/**
 * Las listas realmente inscritas para esa dignidad en ese territorio, con los
 * candidatos de cada una, sacadas del registro de preinscritos del propio
 * tablero. No se inventa ni se completa nada.
 *
 * `circ` es el número de circunscripción (0 = todo el cantón). Con una
 * elegida solo entran sus registros. Sin elegir ninguna, una lista que se
 * presenta en varias circunscripciones se agrupa pero se deja sin candidatos,
 * porque cada circunscripción inscribe los suyos.
 */
function listasPreinscritas(dignidad, provK, cantK, circ) {
  if (typeof DATOS === 'undefined' || !Array.isArray(DATOS.registros)) return [];
  const pedida = parseInt(circ, 10) || 0;
  const vistas = new Map();
  DATOS.registros.forEach(r => {
    if (r.dignidad !== dignidad || r.provK !== provK || r.cantK !== cantK) return;
    if (!r.partido) return;
    const nc = numeroCircun(r.circunscripcion);
    if (pedida && nc !== pedida) return;
    const clave = (r.lista || '') + '|' + normalizarTexto(r.partido);
    if (!vistas.has(clave)) {
      vistas.set(clave, {
        lista: r.lista || '', partido: r.partido, circ: r.circunscripcion || '',
        n: 0, circs: new Set(), candidatos: []
      });
    }
    const v = vistas.get(clave);
    v.n++;
    v.circs.add(nc);
    if (r.nombre) {
      v.candidatos.push({ orden: r.orden || 0, nombre: r.nombre, suplente: r.suplente || '' });
    }
  });
  const salida = [...vistas.values()];
  salida.forEach(x => {
    x.variasCircuns = x.circs.size > 1;
    delete x.circs;
    if (x.variasCircuns) { x.candidatos = []; return; }
    /* En el orden en que la organización los inscribió: ese ORDEN es el que
       decide a quién le toca cada escaño que gane la lista. */
    x.candidatos.sort((a, b) => (a.orden || 999) - (b.orden || 999) ||
      a.nombre.localeCompare(b.nombre));
    x.candidatos.forEach((c, i) => { if (!c.orden) c.orden = i + 1; });
  });
  return salida.sort((a, b) =>
    (parseInt(a.lista, 10) || 999) - (parseInt(b.lista, 10) || 999) ||
    a.partido.localeCompare(b.partido));
}

/**
 * Cuántos escaños se eligen según el registro de preinscritos: cada lista
 * inscribe tantos candidatos principales como escaños hay que llenar, así que
 * el número de candidatos de una lista ES el número de escaños. Si alguna
 * inscribió menos, se toma el mayor y se marca que el registro no viene parejo.
 */
function escanosDeInscritos(listas) {
  const cuentas = (listas || []).map(x => (x.candidatos || []).length).filter(n => n > 0);
  if (!cuentas.length) return null;
  const n = Math.max.apply(null, cuentas);
  return { n: n, parejo: cuentas.every(c => c === n), listas: cuentas.length };
}

/* Escaños por territorio según el registro, calculados una vez por base de
   preinscritos: la vista provincial los pide para cada cantón. */
const ESC_INSCRITOS = { base: null, memo: new Map() };

/**
 * Escaños que se eligen en un cantón —o, con `circN`, en una de sus
 * circunscripciones— según el registro de inscripción, o null si el registro
 * no trae candidatos para ese filtro. En los cantones que eligen a sus urbanos
 * por circunscripción, el total del cantón es la SUMA de lo que elige cada una.
 */
function escanosInscritos(dignidad, provK, cantK, circN) {
  if (!provK || !cantK) return null;
  const regs = (typeof DATOS !== 'undefined') ? DATOS.registros : null;
  if (ESC_INSCRITOS.base !== regs) { ESC_INSCRITOS.base = regs; ESC_INSCRITOS.memo = new Map(); }
  const clave = [dignidad, provK, cantK, circN || 0].join('|');
  if (ESC_INSCRITOS.memo.has(clave)) return ESC_INSCRITOS.memo.get(clave);

  let out = null;
  const circs = dignidad === 'CONCEJALES_URBANOS' ? circunscripcionesDelCanton(provK, cantK) : [];
  if (circs.length && !circN) {
    const partes = circs.map(c => escanosInscritos(dignidad, provK, cantK, c.n));
    if (partes.every(x => x && x.n)) {
      out = { n: partes.reduce((a, x) => a + x.n, 0), parejo: partes.every(x => x.parejo),
              partes: partes.map(x => x.n) };
    }
  } else {
    out = escanosDeInscritos(listasPreinscritas(dignidad, provK, cantK, circN || 0));
  }
  ESC_INSCRITOS.memo.set(clave, out);
  return out;
}

/**
 * Los escaños que reparte la simulación: los del registro de inscripción y,
 * solo si el registro no trae candidatos para ese filtro, los de la tabla
 * oficial. `fuente` dice de cuál de las dos salió el número.
 */
function escanosParaSimular(dignidad, provK, cantK, circN) {
  const e = escanosInscritos(dignidad, provK, cantK, circN);
  if (e && e.n) return { n: e.n, fuente: 'inscritos', parejo: e.parejo, partes: e.partes || null };
  const t = escanosTabla(dignidad, provK, cantK, circN);
  if (t != null) {
    return { n: t, fuente: 'tabla', parejo: true,
             partes: circN ? null : circunsDelCanton(dignidad, provK, cantK) };
  }
  return null;
}

/** Los de la dignidad, el territorio y la circunscripción elegidos. */
function escanosDeOrigen() {
  const o = ASIG.origen, c = circunActiva();
  if (!o.dignidad) return null;
  return escanosParaSimular(o.dignidad, o.provK, o.cantK, c ? c.n : 0);
}

/** Las listas preinscritas del distrito elegido. */
function preinscritosDeOrigen() {
  const o = ASIG.origen, c = circunActiva();
  if (!o.dignidad) return [];
  return listasPreinscritas(o.dignidad, o.provK, o.cantK, c ? c.n : 0);
}

/**
 * Carga en el simulador las listas inscritas del distrito, con sus candidatos
 * y sin votos: se escribe el porcentaje de cada una y el reparto sale solo.
 * Se llama sola al completar o cambiar el distrito.
 */
function simularAsignacion(callado) {
  const o = ASIG.origen, circ = circunActiva();
  if (faltaDistrito()) { retirarSimulador(textoEspera()); return; }
  if (noEligeDignidad()) { retirarSimulador(textoNoElige()); return; }
  const reales = preinscritosDeOrigen();
  const c = cuentaParticipacion();
  const listas = reales.length
    ? reales.map((x, i) => ({
        id: 'p' + i,
        nombre: (x.lista ? 'Lista ' + x.lista + ' · ' : '') + tituloCase(x.partido),
        votos: 0, color: i,
        /* De aquí sale la adjudicación individual: la lista, la organización y
           los candidatos tal como están inscritos. */
        lista: x.lista, partido: tituloCase(x.partido),
        candidatos: x.candidatos.map(k => ({
          orden: k.orden, nombre: tituloCase(k.nombre), suplente: tituloCase(k.suplente)
        }))
      }))
    : [{ id: 'n1', nombre: 'Lista 1', votos: 0, color: 0 },
       { id: 'n2', nombre: 'Lista 2', votos: 0, color: 1 },
       { id: 'n3', nombre: 'Lista 3', votos: 0, color: 2 }];
  const esc = escanosDeOrigen();
  const vacio = {
    listas,
    escanos: (esc && esc.n) || 7,
    metodo: 'dhondt', umbral: 0, baseModo: 'listas',
    blancos: c.blancos, nulos: c.nulos,
    desempate: 'mayor_votos', participante: 'lista',
    /* Los votos válidos sobre los que se aplican los porcentajes. */
    validosDisponibles: Math.max(0, c.validos),
    origen: {
      ambito: ambitoTexto({ provK: o.provK, cantK: o.cantK }),
      dignidad: etiquetaDignidad(o.dignidad),
      /* Nombre LITERAL de la circunscripción (Excel del cliente o registro). */
      circunscripcion: circ ? nombreCircun(circ) : '',
      fuente: 'Registro de preinscritos',
      escanosDe: esc && esc.fuente === 'inscritos' ? 'inscritos' : 'tabla2023',
      escanosParejo: !esc || esc.parejo !== false
    }
  };
  if (!ponerEnSimulador(vacio)) return;
  const nCand = reales.reduce((a, x) => a + x.candidatos.length, 0);
  ASIG.cargado = {
    etq: etiquetaDignidad(o.dignidad),
    ambito: ambitoTexto({ provK: o.provK, cantK: o.cantK }),
    circ: circ ? nombreCircun(circ) : '',
    listas: reales.length, candidatos: nCand,
    escanos: vacio.escanos, fuenteEscanos: esc ? esc.fuente : null
  };
  actualizarCabeceraAsignacion();
  if (callado || typeof avisar !== 'function') return;
  avisar(reales.length
    ? `${fmtNum(reales.length)} listas inscritas` + (nCand ? ` y ${fmtNum(nCand)} candidatos` : '') +
      ': pon los porcentajes'
    : 'No hay listas inscritas para este filtro: se dejan listas en blanco');
}


/* ============================================================================
   VISTA
   Orden de la pantalla: cabecera con la ruta del distrito · mapa electoral ·
   participación · listas inscritas · simulador (porcentajes, resumen,
   distribución por organización, sensibilidad, estabilidad y explicación).
   ========================================================================== */

function renderAsignacion() {
  const vista = document.getElementById('vista-asignacion');
  if (!vista) return;
  temaSeccion(ASIG.origen.dignidad || 'CONCEJALES_URBANOS');

  /* El marco se monta una sola vez: recargarlo en cada render borraría lo que
     el cliente lleve escrito. */
  if (ASIG.montado && document.getElementById('a-marco')) {
    actualizarCabeceraAsignacion();
    return;
  }

  vista.innerHTML = `
    <section class="tarjeta sec-cabecera asig-cab">
      <h2 class="tarjeta-tit">Asignación de escaños · método D'Hondt</h2>
      <nav class="asig-ruta" id="a-ruta" aria-label="Distrito que se analiza"></nav>
      <p class="tarjeta-sub" id="a-sub">—</p>
    </section>

    <section class="tarjeta sec-tarjeta" id="a-mapa-tarjeta"></section>

    <section class="tarjeta sec-tarjeta" id="a-participacion"></section>

    <section class="tarjeta sec-tarjeta" id="a-listas">
      <div class="pre-barra">
        <div>
          <h3 class="pre-tit">Listas preinscritas</h3>
          <p class="pre-sub" id="a-pre-sub">Las organizaciones y los candidatos inscritos en el distrito elegido.</p>
        </div>
        <button class="btn btn-sec" type="button" id="a-ver-pre"
                aria-expanded="false" aria-controls="a-preinscritas">Ver listas preinscritas</button>
      </div>
      <div class="pre-panel" id="a-preinscritas" hidden></div>
    </section>

    <section class="tarjeta asig-marco-caja">
      <div class="asig-espera" id="a-espera">
        <p class="asig-espera-tit">Simulador de escaños</p>
        <p class="asig-espera-txt" id="a-espera-txt">${ASIG_ESPERA_TXT}</p>
      </div>
      <!-- Sin src: no se carga nada hasta que haya un distrito, para que nunca
           quede a la vista un borrador guardado de otro territorio. -->
      <iframe id="a-marco" class="asig-marco" title="Simulador de escaños electorales" hidden></iframe>
    </section>`;

  ASIG.montado = true;
  const btnPre = document.getElementById('a-ver-pre');
  if (btnPre) btnPre.onclick = () => alternarPreinscritas(btnPre);
  escucharAlSimulador();
  pintarMapaAsig();
  pintarParticipacion();
  /* Al abrir la pestaña con el distrito completo, sus listas inscritas entran
     solas en el simulador. pintarMapaAsig() puede haber elegido ya el único cantón
     del usuario y cargado el simulador; no se carga dos veces. */
  if (faltaDistrito()) retirarSimulador(textoEspera());
  else if (!ASIG.cargado) simularAsignacion(true);
  actualizarCabeceraAsignacion();
}


/* ============================================================================
   MAPA ELECTORAL

   Un solo mapa que acompaña la selección:
     · Provincia: sus cantones, con un círculo que dice cuántos concejales
       elige cada uno. Un clic baja al cantón.
     · Cantón: sus parroquias, pintadas según la circunscripción que las elige
       (y las rurales, que eligen juntas a los concejales rurales). El límite
       de cada circunscripción se traza con los bordes de sus parroquias: la
       capa parroquial conserva la topología, así que un tramo que comparten
       dos parroquias de distinta circunscripción ES el límite entre ellas.
       Cuando una parroquia se reparte entre dos circunscripciones (Milagro,
       Durán, Quevedo…), el límite pasa por dentro de ella y la cartografía no
       lo trae: se pinta rayada con los colores de las dos y se dice.
   ========================================================================== */

const PROV_COLOR = { urbano: '#2A72C8', rural: '#1A8F62' };

/** Los cantones de la provincia con sus escaños y su geometría. */
function cantonesDeProvincia(provK) {
  const feats = ((DATOS.geo.cantones || {}).features || []).filter(x => x.__provK === provK);
  return feats.map(f => {
    const eu = escanosParaSimular('CONCEJALES_URBANOS', provK, f.__key, 0);
    const er = escanosParaSimular('CONCEJALES_RURALES', provK, f.__key, 0);
    const u = eu ? eu.n : 0, r = er ? er.n : 0;
    return { feature: f, key: f.__key, nombre: f.__nombre, urbano: u, rural: r, total: u + r,
             circuns: eu && eu.partes && eu.partes.length > 1 ? eu.partes : null };
  }).sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre));
}

/** Padrón 2027 de la provincia. En las carpetas de un solo cantón el total
    provincial no se publica, así que se suman los cantones que sí están. */
function padronDeProvincia(provK) {
  const p = (ELECTORES.provincias || {})[provK];
  if (p) return p;
  let s = 0;
  Object.entries(ELECTORES.cantones || {}).forEach(([k, v]) => {
    if (k.startsWith(provK + '|')) s += v || 0;
  });
  return s;
}

/** Arma la tarjeta del mapa una vez; después solo se reescriben sus partes. */
function asegurarArmazonMapa(caja) {
  if (document.getElementById('a-mapa')) return;
  soltarMapaProvincia();
  caja.innerHTML = `
    <header class="tabla-cab asig-mapa-cab">
      <div>
        <h2 class="tarjeta-tit" id="a-mapa-tit">Mapa electoral</h2>
        <p class="tarjeta-sub" id="a-mapa-sub"></p>
      </div>
      <div class="asig-mapa-acc">
        <button type="button" class="btn btn-sec asig-volver" id="a-mapa-volver" hidden></button>
        <span class="res-sello" id="a-mapa-sello"></span>
      </div>
    </header>
    <div class="prov-fila asig-mapa-fila">
      <div class="prov-mapa" id="a-mapa"></div>
      <div class="prov-tarjetas" id="a-mapa-panel"></div>
    </div>
    <div class="asig-ficha" id="a-mapa-ficha" hidden></div>`;
  document.getElementById('a-mapa-volver').onclick = () => irANivel('provincia');
}

/** Pinta el mapa del nivel que toca. Devuelve 'delegado' si eligió solo el
    único cantón del usuario (y ya se rehízo todo desde alCambiarOrigen). */
function pintarMapaAsig() {
  const caja = document.getElementById('a-mapa-tarjeta');
  if (!caja) return;
  const o = ASIG.origen;
  if (!o.provK) {
    soltarMapaProvincia();
    caja.innerHTML = `
      <header class="tabla-cab"><div>
        <h2 class="tarjeta-tit">Mapa electoral</h2>
        <p class="tarjeta-sub">Cuántos concejales elige cada cantón y, dentro de cada cantón, qué
          parroquias forman cada circunscripción.</p>
      </div></header>
      <p class="sec-vacio">Elige una provincia en el panel de la izquierda.</p>`;
    return;
  }
  const filas = cantonesDeProvincia(o.provK);
  /* Si el usuario solo tiene un cantón —las carpetas por cantón— no tiene
     sentido pedirle que lo elija: se abre su análisis directamente. */
  if (!o.cantK && filas.length === 1) {
    o.cantK = filas[0].key;
    alCambiarOrigen();
    return 'delegado';
  }
  asegurarArmazonMapa(caja);
  if (o.cantK) pintarVistaCanton(filas);
  else pintarVistaProvincia(filas);
}

/** Suelta el mapa antes de rehacer el armazón que lo contiene. */
function soltarMapaProvincia() {
  if (ASIG.mapaProv) {
    try { ASIG.mapaProv.map.remove(); } catch (e) { /* ya no estaba */ }
    ASIG.mapaProv = null;
  }
}

/** El mapa de la sección, creado una vez por provincia. */
function asegurarMapa() {
  const cont = document.getElementById('a-mapa');
  if (!cont || typeof L === 'undefined') return null;
  const o = ASIG.origen;
  if (ASIG.mapaProv && (ASIG.mapaProv.provK !== o.provK || ASIG.mapaProv.contenedor !== cont)) {
    soltarMapaProvincia();
  }
  if (!ASIG.mapaProv) {
    /* zoomSnap fraccionario: el encuadre se ajusta de verdad al casco urbano
       en vez de quedarse un nivel entero más lejos. */
    const map = L.map('a-mapa', {
      zoomControl: true, attributionControl: true, minZoom: 5, maxZoom: 15,
      zoomSnap: .25, zoomDelta: .5,
      scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false
    }).setView(CONFIG.vistaEcuador.centro, CONFIG.vistaEcuador.zoom);
    cont.style.background = CONFIG.mapaBase.color;
    if (map.attributionControl) map.attributionControl.addAttribution(CONFIG.mapaBase.credito);
    ASIG.mapaProv = { map, provK: o.provK, contenedor: cont, capa: null, pines: null,
                      canton: null };
  }
  return ASIG.mapaProv;
}

/** Recalcula el tamaño del mapa y encuadra unos límites. */
function encuadrarAsig(M, limites, margen) {
  setTimeout(() => {
    try {
      M.map.invalidateSize();
      if (limites && limites.isValid()) M.map.fitBounds(limites, { padding: [margen || 22, margen || 22], animate: false });
    } catch (e) { /* el marco aún no se ve */ }
  }, 60);
}

/* ── Nivel provincia ─────────────────────────────────────────────────────── */

function pintarVistaProvincia(filas) {
  const o = ASIG.origen;
  const tit = document.getElementById('a-mapa-tit');
  const sub = document.getElementById('a-mapa-sub');
  const sello = document.getElementById('a-mapa-sello');
  const volver = document.getElementById('a-mapa-volver');
  const ficha = document.getElementById('a-mapa-ficha');
  if (tit) tit.textContent = 'Escaños de concejales · ' + ambitoTexto({ provK: o.provK });
  if (sub) sub.textContent = `Cuántos concejales elige cada cantón en ${ASIG_ANIO_SIM}. ` +
    'Haz clic en un cantón para ver sus circunscripciones y simular su asignación.';
  if (sello) sello.textContent = `${fmtNum(filas.length)} ${filas.length === 1 ? 'cantón' : 'cantones'}`;
  if (volver) volver.hidden = true;
  if (ficha) { ficha.hidden = true; ficha.innerHTML = ''; }

  const tot = filas.reduce((a, x) => a + x.total, 0);
  const urb = filas.reduce((a, x) => a + x.urbano, 0);
  const rur = filas.reduce((a, x) => a + x.rural, 0);
  const pct = (n) => tot ? dec(n * 100 / tot, 1) + ' %' : '—';
  const padron = padronDeProvincia(o.provK);
  const conCirc = filas.filter(x => x.circuns).length;
  const tarjeta = (et, val, pie, color, clase) => `
    <div class="prov-tarjeta${clase ? ' ' + clase : ''}"${color ? ` style="--part-color:${color}"` : ''}>
      <p class="prov-et">${et}</p>
      <p class="prov-val">${val}</p>
      <p class="prov-pie">${pie}</p>
    </div>`;
  const panel = document.getElementById('a-mapa-panel');
  if (panel) {
    panel.innerHTML = `
      ${tarjeta('Escaños de la provincia', fmtNum(tot), `Concejales que se eligen en ${ASIG_ANIO_SIM}`, '', 'prov-total')}
      <div class="prov-par">
        ${tarjeta('Urbanos', fmtNum(urb), pct(urb) + ' del total', PROV_COLOR.urbano)}
        ${tarjeta('Rurales', fmtNum(rur), pct(rur) + ' del total', PROV_COLOR.rural)}
      </div>
      ${tarjeta('Cantones', fmtNum(filas.length), conCirc
        ? `${fmtNum(conCirc)} ${conCirc === 1 ? 'elige' : 'eligen'} sus urbanos por circunscripción`
        : 'Ninguno se parte en circunscripciones', '', 'prov-ancha')}
      ${tarjeta('Electores', padron ? fmtNum(padron) : '—', 'Padrón vigente, 2027', '', 'prov-ancha')}
      <p class="prov-leyenda">
        <span><i style="background:${PROV_COLOR.urbano}"></i>Urbanos</span>
        <span><i style="background:${PROV_COLOR.rural}"></i>Rurales</span>
        <span class="prov-pista">El número de cada cantón es el total de su concejo; el anillo
          se parte entre urbanos (azul) y rurales (verde). Un anillo punteado marca los
          cantones que eligen sus urbanos por circunscripción.</span>
      </p>`;
  }
  dibujarMapaProvincia(filas);
}

/** Quita del mapa las capas del nivel cantón. */
function quitarCapasCanton(M) {
  if (M.canton) {
    ['capa', 'bordes', 'halo', 'resalte', 'pines'].forEach(k => {
      if (M.canton[k]) { try { M.map.removeLayer(M.canton[k]); } catch (e) { /* ya no estaba */ } }
    });
    M.canton = null;
  }
}

/** El mapa de la provincia con un marcador de escaños sobre cada cantón. */
function dibujarMapaProvincia(filas) {
  if (!filas.length) return;
  const M = asegurarMapa();
  if (!M) return;
  const o = ASIG.origen;
  quitarCapasCanton(M);
  const rampa = CONFIG.paleta.CONCEJALES_URBANOS.rampa;
  const max = Math.max(1, ...filas.map(x => x.total));

  if (!M.capa) {
    M.capa = L.geoJSON({ type: 'FeatureCollection', features: filas.map(x => x.feature) }, {
      style: () => ({ fill: true, stroke: true, fillOpacity: .9, color: '#FFFFFF', weight: .9, opacity: .95 })
    });
    M.pines = L.layerGroup();
  }
  if (!M.map.hasLayer(M.capa)) M.capa.addTo(M.map);
  if (!M.map.hasLayer(M.pines)) M.pines.addTo(M.map);

  const porClave = new Map(filas.map(x => [x.key, x]));
  const globo = (x) => `
    <div class="tt"><div class="tt-titulo">${escaparHTML(tituloCase(x.nombre))}</div>
      <div class="tt-sub">${escaparHTML(ambitoTexto({ provK: o.provK }))}</div>
      <div class="tt-metricas">
        <div><span>Urbanos</span><b>${fmtNum(x.urbano)}</b></div>
        <div><span>Rurales</span><b>${fmtNum(x.rural)}</b></div>
        <div><span>Total del concejo</span><b>${fmtNum(x.total)}</b></div>
      </div>
      ${x.circuns ? `<div class="tt-sub">Los urbanos en ${x.circuns.length} circunscripciones:
        ${x.circuns.join(' + ')}</div>` : ''}
      <div class="tt-pie"><span class="tt-chip">Clic para ver sus circunscripciones</span></div></div>`;

  const elegir = (clave) => {
    if (o.cantK === clave) return;
    o.cantK = clave;
    ASIG.tocado = {};
    alCambiarOrigen();
  };

  M.capa.eachLayer(l => {
    const x = porClave.get(l.feature.__key);
    if (!x) return;
    const t = max > 0 ? x.total / max : 0;
    l.setStyle({ fillColor: x.total ? colorDegradado(rampa, .18 + t * .82) : CONFIG.paleta.sinDatos,
                 color: '#FFFFFF', weight: .9, fillOpacity: .9 });
    l.unbindTooltip();
    l.bindTooltip(() => globo(x), { sticky: true, direction: 'top', className: 'tt-wrap', opacity: 1 });
    l.off('mouseover').off('mouseout').off('click');
    l.on('mouseover', e => e.target.setStyle({ weight: 2.2, color: '#141413' }));
    l.on('mouseout', e => e.target.setStyle({ weight: .9, color: '#FFFFFF' }));
    l.on('click', () => elegir(x.key));
  });

  /* El número es el total del concejo, en un círculo cuya ÁREA es
     proporcional a él; el anillo se parte entre urbanos y rurales. */
  M.pines.clearLayers();
  filas.forEach(x => {
    const capa = M.capa.getLayers().find(l => l.feature.__key === x.key);
    if (!capa) return;
    const n = x.total;
    const d = n ? Math.round(26 + 34 * Math.sqrt(n / max)) : 22;
    const pu = n ? Math.round(x.urbano * 100 / n) : 100;
    const html = `<div class="esc-pin${n ? '' : ' vacio'}${x.circuns ? ' con-circ' : ''}"
      style="--d:${d}px;--pu:${pu}%;--cu:${n ? PROV_COLOR.urbano : '#B9B5AC'};--cr:${n ? PROV_COLOR.rural : '#B9B5AC'}"
      ><b>${fmtNum(n)}</b></div>`;
    const pin = L.marker(capa.getBounds().getCenter(), {
      icon: L.divIcon({ html, className: 'esc-pin-caja', iconSize: [d, d], iconAnchor: [d / 2, d / 2] }),
      interactive: true, keyboard: false
    });
    pin.bindTooltip(() => globo(x), { sticky: true, direction: 'top', className: 'tt-wrap', opacity: 1 });
    pin.on('click', () => elegir(x.key));
    pin.addTo(M.pines);
  });
  encuadrarAsig(M, M.capa.getBounds(), 22);
}

/* ── Nivel cantón: parroquias y circunscripciones ───────────────────────── */

/** Los polígonos de un Polygon o MultiPolygon de GeoJSON. */
function poligonosDe(geom) {
  if (!geom) return [];
  if (geom.type === 'Polygon') return [geom.coordinates];
  if (geom.type === 'MultiPolygon') return geom.coordinates;
  return [];
}

/** Área (en grados², solo para comparar) y centro de masa de un anillo. */
function centroAnillo(r) {
  let A = 0, X = 0, Y = 0;
  for (let i = 0; i + 1 < r.length; i++) {
    const x1 = r[i][0], y1 = r[i][1], x2 = r[i + 1][0], y2 = r[i + 1][1];
    const c = x1 * y2 - x2 * y1;
    A += c; X += (x1 + x2) * c; Y += (y1 + y2) * c;
  }
  if (!A) return null;
  return { area: Math.abs(A) / 2, lon: X / (3 * A), lat: Y / (3 * A) };
}

/** ¿Cae el punto dentro del anillo? (rayo horizontal) */
function dentroAnillo(lon, lat, r) {
  let dentro = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
    if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) dentro = !dentro;
  }
  return dentro;
}

/**
 * Un punto que cae DENTRO de la parroquia, para poner su marcador: el centro
 * de masa de su polígono mayor si queda dentro; si no (formas en media luna),
 * el centro del tramo más ancho de la horizontal que pasa por ese centro.
 */
function puntoInterior(f) {
  let mejor = null;
  poligonosDe(f.geometry).forEach(poly => {
    const c = centroAnillo(poly[0]);
    if (c && (!mejor || c.area > mejor.c.area)) mejor = { c, anillo: poly[0] };
  });
  if (!mejor) return null;
  const { c, anillo } = mejor;
  if (dentroAnillo(c.lon, c.lat, anillo)) return { lat: c.lat, lon: c.lon, area: c.area };
  const xs = [];
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const xi = anillo[i][0], yi = anillo[i][1], xj = anillo[j][0], yj = anillo[j][1];
    if ((yi > c.lat) !== (yj > c.lat)) xs.push((xj - xi) * (c.lat - yi) / (yj - yi) + xi);
  }
  xs.sort((a, b) => a - b);
  let ancho = -1, lon = c.lon;
  for (let k = 0; k + 1 < xs.length; k += 2) {
    if (xs[k + 1] - xs[k] > ancho) { ancho = xs[k + 1] - xs[k]; lon = (xs[k] + xs[k + 1]) / 2; }
  }
  return { lat: c.lat, lon, area: c.area };
}

/**
 * La estructura electoral del cantón sobre su cartografía: qué distritos tiene
 * (cada circunscripción urbana, o las parroquias urbanas si elige en una sola,
 * y las parroquias rurales) y a cuál pertenece cada parroquia. Las parroquias
 * de cada circunscripción son las del distributivo del CNE.
 */
function distritosDelCanton(provK, cantK) {
  const parrs = TERRITORIO.parroquiasPorCant.get(provK + '|' + cantK) || [];
  const estado = (f) => normalizarTexto((f.properties || {}).estado || '');
  const ops = opcionesDelCanton(provK, cantK);
  const urb = ops.find(x => x.dignidad === 'CONCEJALES_URBANOS');
  const rur = ops.find(x => x.dignidad === 'CONCEJALES_RURALES');
  const porParr = new Map();            // clave de parroquia → [id de distrito]
  const meter = (k, id) => { if (!porParr.has(k)) porParr.set(k, []); if (!porParr.get(k).includes(id)) porParr.get(k).push(id); };
  const distritos = [];

  if (urb) {
    const datos = circunscripcionesDelCanton(provK, cantK);
    if (datos.length) {
      datos.forEach(c => {
        const op = urb.circs.find(x => x.n === c.n) || {};
        const claves = [], sinCapa = [];
        (c.parroquias || []).forEach(p => {
          const k = resolverParroquia(provK, cantK, normalizarTexto(p));
          if (k) { if (!claves.includes(k)) claves.push(k); } else sinCapa.push(p);
        });
        claves.forEach(k => meter(k, 'u' + c.n));
        distritos.push({ id: 'u' + c.n, dignidad: 'CONCEJALES_URBANOS', circ: c.n,
          nombre: nombreCircun(c), esCircun: true, color: colorCircun(c.n),
          escanos: op.escanos != null ? op.escanos : null, electores: op.electores,
          claves, sinCapa, datos: c });
      });
    } else {
      const claves = parrs.filter(f => estado(f) === 'URBANA').map(f => f.__key);
      claves.forEach(k => meter(k, 'u'));
      distritos.push({ id: 'u', dignidad: 'CONCEJALES_URBANOS', circ: 0, nombre: 'Parroquias urbanas',
        esCircun: false, color: COLOR_URBANO, escanos: urb.escanos, electores: urb.electores,
        claves, sinCapa: [] });
    }
  }
  if (rur) {
    const claves = parrs.filter(f => estado(f) === 'RURAL').map(f => f.__key);
    claves.forEach(k => meter(k, 'r'));
    distritos.push({ id: 'r', dignidad: 'CONCEJALES_RURALES', circ: 0, nombre: 'Parroquias rurales',
      esCircun: false, color: COLOR_RURAL, escanos: rur.escanos, electores: rur.electores,
      claves, sinCapa: [] });
  }
  /* Las parroquias que se reparten entre varias circunscripciones. */
  const compartidas = new Map();
  porParr.forEach((ids, k) => { if (ids.length > 1) compartidas.set(k, ids.slice().sort()); });
  return { parrs, distritos, porParr, compartidas };
}

/** El distrito que corresponde a la selección, o null. */
function distritoElegido(D) {
  const o = ASIG.origen;
  if (!o.dignidad) return null;
  if (o.dignidad === 'CONCEJALES_RURALES') return D.distritos.find(d => d.id === 'r') || null;
  const circs = D.distritos.filter(d => d.dignidad === 'CONCEJALES_URBANOS');
  if (circs.length === 1 && !circs[0].esCircun) return circs[0];
  return circs.find(d => d.circ === o.circ) || null;
}

/**
 * Los tramos de borde de las parroquias del cantón, cada uno con las
 * parroquias que lo comparten. La capa conserva la topología —dos vecinas
 * comparten exactamente los mismos vértices—, así que un tramo de dos
 * parroquias es su límite común y uno de una sola es el borde del cantón.
 */
function tramosDe(parrs) {
  const mapa = new Map();
  parrs.forEach((f, i) => poligonosDe(f.geometry).forEach(poly => poly.forEach(r => {
    for (let k = 0; k + 1 < r.length; k++) {
      const a = r[k], b = r[k + 1];
      const ka = a[0] + ',' + a[1], kb = b[0] + ',' + b[1];
      if (ka === kb) continue;
      const clave = ka < kb ? ka + '|' + kb : kb + '|' + ka;
      let t = mapa.get(clave);
      if (!t) { t = { a, b, p: [] }; mapa.set(clave, t); }
      if (!t.p.includes(i)) t.p.push(i);
    }
  })));
  return [...mapa.values()];
}

/** Un patrón de rayas con los colores de las circunscripciones que comparten
    una parroquia, dentro del SVG del mapa. Devuelve el `fill` que lo usa. */
function patronRayas(M, colores) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = M.map.getPanes().overlayPane.querySelector('svg');
  if (!svg) return colores[0];
  const id = 'asig-rayas-' + colores.map(c => c.replace('#', '')).join('-');
  let defs = svg.querySelector('defs');
  if (!defs) { defs = document.createElementNS(NS, 'defs'); svg.insertBefore(defs, svg.firstChild); }
  if (!defs.querySelector('#' + id)) {
    const w = 6 * colores.length;
    const pat = document.createElementNS(NS, 'pattern');
    pat.setAttribute('id', id);
    pat.setAttribute('patternUnits', 'userSpaceOnUse');
    pat.setAttribute('width', String(w));
    pat.setAttribute('height', String(w));
    pat.setAttribute('patternTransform', 'rotate(45)');
    colores.forEach((c, i) => {
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', String(i * 6)); r.setAttribute('y', '0');
      r.setAttribute('width', '6'); r.setAttribute('height', String(w));
      r.setAttribute('fill', c);
      pat.appendChild(r);
    });
    defs.appendChild(pat);
  }
  return 'url(#' + id + ')';
}

/** El nivel cantón: tarjeta, panel, ficha y mapa. */
function pintarVistaCanton(filas) {
  const o = ASIG.origen;
  const D = distritosDelCanton(o.provK, o.cantK);
  const sel = distritoElegido(D);
  const canton = ambitoTexto({ provK: o.provK, cantK: o.cantK });
  const circs = D.distritos.filter(d => d.esCircun);
  const tit = document.getElementById('a-mapa-tit');
  const sub = document.getElementById('a-mapa-sub');
  const sello = document.getElementById('a-mapa-sello');
  const volver = document.getElementById('a-mapa-volver');
  if (tit) tit.textContent = 'Mapa electoral · ' + canton;
  if (sub) sub.textContent = circs.length
    ? `Las parroquias de ${canton}, pintadas según la circunscripción que las elige. Haz clic en una para simularla.`
    : `Las parroquias de ${canton}: las urbanas eligen a los concejales urbanos y las rurales a los rurales. Haz clic para simular.`;
  if (sello) {
    const nu = D.parrs.filter(f => normalizarTexto((f.properties || {}).estado || '') === 'URBANA').length;
    const nr = D.parrs.length - nu;
    sello.textContent = (circs.length ? `${circs.length} circunscripciones · ` : '') +
      `${fmtNum(D.parrs.length)} parroquias` + (nu && nr ? ` (${nu} urb. · ${nr} rur.)` : '');
  }
  if (volver) { volver.hidden = filas.length <= 1; volver.textContent = '← ' + ambitoTexto({ provK: o.provK }); }
  pintarPanelCanton(D, sel);
  pintarFichaCanton(D, sel);
  dibujarMapaCanton(D, sel);
}

/** El panel a la derecha del mapa: los distritos del cantón y la leyenda. */
function pintarPanelCanton(D, sel) {
  const panel = document.getElementById('a-mapa-panel');
  if (!panel) return;
  const nEsc = (n) => n != null ? `${fmtNum(n)} ${n === 1 ? 'escaño' : 'escaños'}` : '—';
  const grupos = ASIG_DIGNIDADES.map(dig => ({
    dig, ds: D.distritos.filter(d => d.dignidad === dig)
  })).filter(g => g.ds.length);
  const total = (ds) => ds.reduce((a, d) => a + (d.escanos || 0), 0);
  const fila = (d) => `
    <button type="button" class="asig-dist${sel && sel.id === d.id ? ' activo' : ''}" data-dist="${d.id}"
            style="--c:${d.color}" aria-pressed="${!!(sel && sel.id === d.id)}">
      <i class="asig-dist-color" aria-hidden="true"></i>
      <span class="asig-dist-txt">
        <span class="asig-dist-nom${d.esCircun ? ' asig-circ-nom' : ''}">${escaparHTML(d.nombre)}</span>
        <span class="asig-dist-det">${fmtNum(d.claves.length + d.sinCapa.length)} ${d.claves.length + d.sinCapa.length === 1 ? 'parroquia' : 'parroquias'}${d.electores ? ' · ' + fmtNum(d.electores) + ' electores' : ''}</span>
      </span>
      <b class="asig-dist-esc">${nEsc(d.escanos)}</b>
    </button>`;
  const hayCompartidas = D.compartidas.size > 0;
  panel.innerHTML = `
    ${grupos.map(g => `<div class="asig-grupo">
      <p class="asig-grupo-tit">${escaparHTML(etiquetaDignidad(g.dig))}<span>${nEsc(total(g.ds))}</span></p>
      ${g.ds.map(fila).join('')}
    </div>`).join('') || '<p class="sec-vacio">Sin concejalías con datos en este cantón.</p>'}
    <div class="asig-leyenda">
      <p class="asig-leyenda-tit">Cómo leer el mapa</p>
      <p><i class="asig-ley-linea asig-ley-linea--circ"></i>Límite de circunscripción o del cantón</p>
      <p><i class="asig-ley-linea asig-ley-linea--parr"></i>Límite entre parroquias</p>
      ${hayCompartidas ? '<p><i class="asig-ley-rayas"></i>Parroquia repartida entre dos circunscripciones: la cartografía no traza el límite que pasa por dentro</p>' : ''}
      <p class="asig-leyenda-fuente">Parroquias: capa del CNE del proyecto. Composición de cada
        circunscripción: distributivo del CNE (${CIRCUNS.anio || 2026}).</p>
    </div>`;
  panel.querySelectorAll('[data-dist]').forEach(b => {
    b.onclick = () => {
      const d = D.distritos.find(x => x.id === b.dataset.dist);
      if (d) seleccionarDistrito(d.dignidad, d.circ);
    };
  });
}

/** La ficha bajo el mapa: el distrito elegido, con su nombre exacto y sus
    parroquias, o el resumen del cantón si todavía no hay ninguno. */
function pintarFichaCanton(D, sel) {
  const ficha = document.getElementById('a-mapa-ficha');
  if (!ficha) return;
  const o = ASIG.origen;
  const canton = ambitoTexto({ provK: o.provK, cantK: o.cantK });
  const provincia = ambitoTexto({ provK: o.provK });
  const nombreParr = (k) => {
    const g = TERRITORIO.porParrK.get(o.provK + '|' + o.cantK + '|' + k);
    return tituloCase((g && g.feature && g.feature.__nombre) || k);
  };
  const nombreDist = (id) => (D.distritos.find(d => d.id === id) || {}).nombre || id;
  const nEsc = (n) => n != null ? `${fmtNum(n)} ${n === 1 ? 'escaño' : 'escaños'}` : '—';
  ficha.hidden = false;

  if (!sel) {
    const urb = D.distritos.filter(d => d.dignidad === 'CONCEJALES_URBANOS');
    const rur = D.distritos.find(d => d.dignidad === 'CONCEJALES_RURALES');
    const tUrb = urb.reduce((a, d) => a + (d.escanos || 0), 0);
    ficha.innerHTML = `
      <div class="asig-ficha-cab" style="--c:#45433D">
        <p class="asig-ficha-et">${escaparHTML(canton)} · ${escaparHTML(provincia)}</p>
        <p class="asig-ficha-res">${urb.length ? `<b>${nEsc(tUrb)}</b> urbanos${urb.some(d => d.esCircun)
            ? ` en ${urb.length} circunscripciones` : ''}` : ''}${urb.length && rur ? ' y ' : ''}${rur
            ? `<b>${nEsc(rur.escanos)}</b> rurales` : ''}.</p>
        <p class="asig-ficha-sub">${faltaDistrito() === 'circ'
          ? 'Elige una circunscripción en el mapa, en el panel de la derecha o en el de la izquierda.'
          : 'Elige la concejalía en el mapa, en el panel de la derecha o en el de la izquierda.'}</p>
      </div>`;
    return;
  }

  const propias = sel.claves.filter(k => !D.compartidas.has(k));
  const repartidas = sel.claves.filter(k => D.compartidas.has(k));
  const ex = avisosExcel(o.provK, o.cantK);
  const datos = sel.datos || null;
  const notas = [];
  if (sel.esCircun && datos && datos.fuenteNombre !== 'excel') {
    notas.push('Esta circunscripción no figura en el Excel de escaños: el nombre es el del registro de inscripción 2027.');
  }
  repartidas.forEach(k => {
    const otros = D.compartidas.get(k).filter(id => id !== sel.id).map(nombreDist);
    notas.push(`La parroquia ${escaparHTML(nombreParr(k))} se reparte con
      ${otros.map(n => `<span class="asig-circ-nom">${escaparHTML(n)}</span>`).join(' y ')}: el límite
      pasa por dentro de la parroquia y la cartografía disponible no lo traza. En el mapa va rayada.`);
  });
  if (sel.sinCapa.length) {
    notas.push(`${enumerar(sel.sinCapa.map(p => escaparHTML(tituloCase(p))))} ${sel.sinCapa.length === 1
      ? 'no tiene' : 'no tienen'} polígono en la capa parroquial: ${sel.sinCapa.length === 1 ? 'cuenta' : 'cuentan'}
      en la circunscripción pero no se ${sel.sinCapa.length === 1 ? 'dibuja' : 'dibujan'}.`);
  }
  if (sel.esCircun && ex && ex.avisos && ex.avisos.length) {
    ex.avisos.filter(a => a.indexOf(sel.nombre) === 0 || a.indexOf('El Excel') === 0)
      .forEach(a => notas.push(escaparHTML(a)));
  }
  const parroquias = propias.map(k => ({ k, n: nombreParr(k), rep: false }))
    .concat(repartidas.map(k => ({ k, n: nombreParr(k), rep: true })))
    .concat(sel.sinCapa.map(p => ({ k: '', n: tituloCase(p), rep: false, sin: true })))
    .sort((a, b) => a.n.localeCompare(b.n));

  ficha.innerHTML = `
    <div class="asig-ficha-cab" style="--c:${sel.color}">
      <p class="asig-ficha-et">${sel.esCircun ? 'Circunscripción seleccionada' : 'Distrito seleccionado'}</p>
      <h3 class="asig-ficha-nom${sel.esCircun ? ' asig-circ-nom' : ''}">${escaparHTML(sel.nombre)}</h3>
      <p class="asig-ficha-sub">${escaparHTML(etiquetaDignidad(sel.dignidad))} · ${escaparHTML(canton)} · ${escaparHTML(provincia)}</p>
    </div>
    <dl class="asig-ficha-datos">
      <div><dt>Escaños ${ASIG_ANIO_SIM}</dt><dd>${sel.escanos != null ? fmtNum(sel.escanos) : '—'}</dd></div>
      <div><dt>Electores</dt><dd>${sel.electores ? fmtNum(sel.electores) : '—'}</dd></div>
      <div><dt>Parroquias</dt><dd>${fmtNum(parroquias.length)}</dd></div>
    </dl>
    <div class="asig-ficha-parr">
      <p class="asig-ficha-mini">${sel.esCircun ? 'Parroquias que la integran' : 'Parroquias que lo integran'}</p>
      <ul class="asig-parr">${parroquias.map(p => `<li class="asig-parr-chip${p.rep ? ' rep' : ''}${p.sin ? ' sin' : ''}"
        >${escaparHTML(p.n)}${p.rep ? ' <small>(compartida)</small>' : ''}${p.sin ? ' <small>(sin polígono)</small>' : ''}</li>`).join('')}</ul>
    </div>
    ${notas.length ? `<ul class="asig-ficha-notas">${notas.map(n => `<li>${n}</li>`).join('')}</ul>` : ''}`;
}

/** Dibuja (o repinta) el cantón: parroquias, límites y marcadores. */
function dibujarMapaCanton(D, sel) {
  const M = asegurarMapa();
  if (!M) return;
  const o = ASIG.origen;
  const clave = o.provK + '|' + o.cantK;
  /* Fuera las capas de la provincia; el cantón se arma una vez y después
     solo se repinta según lo que esté elegido. */
  if (M.capa && M.map.hasLayer(M.capa)) M.map.removeLayer(M.capa);
  if (M.pines && M.map.hasLayer(M.pines)) M.map.removeLayer(M.pines);
  if (M.canton && M.canton.clave !== clave) quitarCapasCanton(M);

  if (!M.canton) {
    const parrs = D.parrs;
    if (!parrs.length) return;
    const capa = L.geoJSON({ type: 'FeatureCollection', features: parrs }, {
      style: () => ({ fill: true, stroke: true, color: '#FFFFFF', weight: .7, opacity: .9,
                      fillColor: COLOR_SIN, fillOpacity: .5 })
    }).addTo(M.map);
    const indice = new Map(parrs.map((f, i) => [f.__key, i]));
    const tramos = tramosDe(parrs);
    M.canton = { clave, capa, indice, tramos, bordes: null, halo: null, resalte: null, pines: null, firma: '' };
  }
  const C = M.canton;
  const grupo = (k) => (D.porParr.get(k) || []).slice().sort().join('+') || 'ninguno';
  const grupoDe = D.parrs.map(f => grupo(f.__key));
  const enSel = sel ? new Set(sel.claves.map(k => C.indice.get(k)).filter(i => i != null)) : null;
  const modalidad = o.dignidad;

  /* Relleno: el color del distrito; rayas si la parroquia es compartida;
     gris si no elige nada. La opacidad dice qué se está mirando. */
  C.capa.eachLayer(l => {
    const f = l.feature, k = f.__key;
    const ids = D.porParr.get(k) || [];
    const ds = ids.map(id => D.distritos.find(d => d.id === id)).filter(Boolean);
    let fill = COLOR_SIN;
    if (ds.length === 1) fill = ds[0].color;
    else if (ds.length > 1) fill = patronRayas(M, ds.map(d => d.color));
    const i = C.indice.get(k);
    let op = .58;
    if (sel) op = enSel.has(i) ? .78 : (ds.some(d => d.dignidad === sel.dignidad) ? .26 : .1);
    else if (modalidad) op = ds.some(d => d.dignidad === modalidad) ? .62 : .12;
    if (!ds.length) op = Math.min(op, .3);
    l.setStyle({ fillColor: fill, fillOpacity: op, color: '#FFFFFF', weight: .7, opacity: .9 });
    l.unbindTooltip();
    const estado = normalizarTexto((f.properties || {}).estado || '');
    l.bindTooltip(() => `
      <div class="tt"><div class="tt-titulo">${escaparHTML(tituloCase(f.__nombre))}</div>
        <div class="tt-sub">Parroquia ${estado === 'URBANA' ? 'urbana' : estado === 'RURAL' ? 'rural' : ''}</div>
        ${ds.length ? `<div class="tt-sub">${ds.length > 1 ? 'Repartida entre ' : ''}${ds.map(d =>
          `<b class="asig-circ-nom">${escaparHTML(d.nombre)}</b>`).join(' y ')}</div>` : '<div class="tt-sub">Sin concejalía con datos</div>'}
        <div class="tt-pie"><span class="tt-chip">${ds.length === 1 ? 'Clic para simularla' : ds.length > 1 ? 'Elige la circunscripción en el panel' : ''}</span></div></div>`,
      { sticky: true, direction: 'top', className: 'tt-wrap', opacity: 1 });
    l.off('click');
    if (ds.length === 1) l.on('click', () => seleccionarDistrito(ds[0].dignidad, ds[0].circ));
  });

  /* Límites: entre parroquias de distinto distrito y el borde del cantón, en
     oscuro; el contorno del distrito elegido, más grueso y con halo. */
  const firma = grupoDe.join(';');
  if (C.firma !== firma) {
    if (C.bordes) M.map.removeLayer(C.bordes);
    const segs = [];
    C.tramos.forEach(t => {
      const exterior = t.p.length === 1;
      if (exterior || grupoDe[t.p[0]] !== grupoDe[t.p[1]]) segs.push([[t.a[1], t.a[0]], [t.b[1], t.b[0]]]);
    });
    C.bordes = L.polyline(segs, { color: '#2B2A27', weight: 1.9, opacity: .88, interactive: false }).addTo(M.map);
    C.firma = firma;
  }
  if (C.halo) { M.map.removeLayer(C.halo); C.halo = null; }
  if (C.resalte) { M.map.removeLayer(C.resalte); C.resalte = null; }
  if (sel && enSel.size) {
    const segs = [];
    C.tramos.forEach(t => {
      const a = enSel.has(t.p[0]), b = t.p.length > 1 && enSel.has(t.p[1]);
      if (t.p.length === 1 ? a : a !== b) segs.push([[t.a[1], t.a[0]], [t.b[1], t.b[0]]]);
    });
    C.halo = L.polyline(segs, { color: '#FFFFFF', weight: 7, opacity: .85, interactive: false }).addTo(M.map);
    C.resalte = L.polyline(segs, { color: '#0B0B0A', weight: 3.4, opacity: 1, interactive: false }).addTo(M.map);
  }

  /* Un marcador por distrito con sus escaños, sobre su parroquia más grande
     (de las suyas propias; si solo tiene compartidas, sobre la compartida y
     corrido para que dos no se tapen). */
  if (C.pines) M.map.removeLayer(C.pines);
  C.pines = L.layerGroup().addTo(M.map);
  const usados = new Map();
  D.distritos.forEach(d => {
    const propias = d.claves.filter(k => !D.compartidas.has(k));
    const candidatas = (propias.length ? propias : d.claves)
      .map(k => ({ k, p: puntoInterior(D.parrs[C.indice.get(k)] || {}) })).filter(x => x.p);
    if (!candidatas.length) return;
    candidatas.sort((a, b) => b.p.area - a.p.area);
    const { k, p } = candidatas[0];
    const vez = usados.get(k) || 0;
    usados.set(k, vez + 1);
    const activo = sel && sel.id === d.id;
    const n = d.escanos || 0;
    const dm = activo ? 44 : 34;
    const html = `<div class="esc-pin esc-pin--dist${activo ? ' activo' : ''}"
      style="--d:${dm}px;--pu:100%;--cu:${d.color};--cr:${d.color}"><b>${fmtNum(n)}</b></div>`;
    const pin = L.marker([p.lat, p.lon], {
      icon: L.divIcon({ html, className: 'esc-pin-caja', iconSize: [dm, dm],
                        iconAnchor: [dm / 2 - vez * (dm + 6), dm / 2] }),
      interactive: true, keyboard: false, zIndexOffset: activo ? 500 : 0
    });
    pin.bindTooltip(`<div class="tt"><div class="tt-titulo${d.esCircun ? ' asig-circ-nom' : ''}">${escaparHTML(d.nombre)}</div>
      <div class="tt-sub">${escaparHTML(etiquetaDignidad(d.dignidad))}</div>
      <div class="tt-metricas">
        <div><span>Escaños</span><b>${d.escanos != null ? fmtNum(d.escanos) : '—'}</b></div>
        <div><span>Electores</span><b>${d.electores ? fmtNum(d.electores) : '—'}</b></div>
        <div><span>Parroquias</span><b>${fmtNum(d.claves.length + d.sinCapa.length)}</b></div>
      </div>
      <div class="tt-pie"><span class="tt-chip">${activo ? 'En análisis' : 'Clic para simular'}</span></div></div>`,
      { direction: 'top', className: 'tt-wrap', opacity: 1 });
    pin.on('click', () => seleccionarDistrito(d.dignidad, d.circ));
    pin.addTo(C.pines);
  });

  /* Encuadre estable, para no perder de vista a las vecinas: con concejales
     urbanos, todas las parroquias urbanas (las circunscripciones se comparan
     entre sí); con rurales o sin concejalía, el cantón entero. Las parroquias
     rurales de un cantón grande son tan extensas que el casco urbano se vería
     diminuto si se encuadrara todo. */
  let limites = C.capa.getBounds();
  if (modalidad === 'CONCEJALES_URBANOS') {
    const urbanas = new Set();
    D.distritos.filter(d => d.dignidad === 'CONCEJALES_URBANOS')
      .forEach(d => d.claves.forEach(k => urbanas.add(k)));
    const b = L.latLngBounds([]);
    C.capa.eachLayer(l => { if (urbanas.has(l.feature.__key)) b.extend(l.getBounds()); });
    if (b.isValid()) limites = b;
  }
  const clEncuadre = clave + '|' + (modalidad || '');
  if (C.encuadre !== clEncuadre) { C.encuadre = clEncuadre; encuadrarAsig(M, limites, 26); }
  else setTimeout(() => { try { M.map.invalidateSize(); } catch (e) { /* oculto */ } }, 60);
}


/* ── El bloque de participación ────────────────────────────────────────── */

function pintarParticipacion() {
  const caja = document.getElementById('a-participacion');
  if (!caja) return;
  const o = ASIG.origen;
  const falta = faltaDistrito();

  if (falta) {
    caja.innerHTML = `<h2 class="tarjeta-tit">Participación</h2>
      <p class="sec-vacio">${falta === 'canton'
        ? 'Arriba está la provincia entera. Elige un cantón —en el mapa o en el panel— para simular su asignación.'
        : falta === 'dignidad' ? 'Elige la concejalía para partir de su padrón.'
        : falta === 'circ' ? 'Elige la circunscripción para partir de su padrón.'
        : `Elige ${ASIG_NIVEL_TXT[falta]} en el panel de la izquierda para partir de su padrón.`}</p>`;
    return;
  }
  const ambito = ambitoTexto({ provK: o.provK, cantK: o.cantK, parrK: '' });
  if (noEligeDignidad()) {
    caja.innerHTML = `<h2 class="tarjeta-tit">Participación · ${escaparHTML(ambito)}</h2>
      <p class="sec-vacio">${escaparHTML(textoNoElige())}</p>`;
    return;
  }

  const c = cuentaParticipacion();
  const cActiva = circunActiva();
  const esc = escanosDeOrigen();
  const nEsc = esc ? esc.n : null;

  const campo = (id, et, valor, suf, ayuda, color) => `
    <div class="part-campo" style="--part-color:${color}">
      <label class="part-et" for="${id}">${et}</label>
      <div class="part-ent${suf ? ' con-suf' : ''}">
        <input type="number" id="${id}" class="part-num" value="${valor}"
               step="${suf ? '0.01' : '1'}" min="0" aria-label="${et}">
        ${suf ? `<span class="part-suf">${suf}</span>` : ''}
      </div>
    </div>`;

  caja.innerHTML = `
    <header class="tabla-cab">
      <div>
        <h2 class="tarjeta-tit">Participación · ${escaparHTML(ambito)}${cActiva
           ? ` · <span class="asig-circ-nom">${escaparHTML(nombreCircun(cActiva))}</span>` : ''}</h2>
        <p class="tarjeta-sub">Del padrón se descuenta quien no vota, lo nulo y lo blanco.
          Lo que queda es con lo que se reparte. Escribe cualquier dato y el simulador se actualiza.</p>
      </div>
      <div class="part-sellos">
        <span class="res-sello" title="${esc && esc.fuente === 'inscritos'
            ? 'Los que inscribió cada lista: es el número que reparte el simulador'
            : 'El registro no trae candidatos para este filtro: se usa la tabla oficial de escaños'}">${nEsc != null
          ? `${fmtNum(nEsc)} ${nEsc === 1 ? 'escaño' : 'escaños'}${esc.fuente === 'tabla' ? ' · tabla oficial' : ''}`
          : 'Escaños por confirmar'}</span>
      </div>
    </header>

    <div class="part-rejilla">
      ${campo('p-electores', 'Electores habilitados', c.E, '', cActiva
        ? `Su parte del padrón urbano · ${dec(cActiva.parte * 100, 1)} % del cantón`
        : (ASIG.tipoPadron
          ? `Padrón ${ASIG.tipoPadron === 'urbano' ? 'urbano' : 'rural'} del cantón`
          : 'Padrón del cantón'), PART_COLOR.electores)}
      ${campo('p-aus', 'Ausentismo', c.pa.toFixed(2), '%', 'Sobre el padrón', PART_COLOR.ausentismo)}
      <div class="part-campo part-calc" style="--part-color:${PART_COLOR.emitidos}">
        <p class="part-et">Sufragantes</p>
        <p class="part-val">${fmtNum(c.emitidos)}</p>
      </div>
      ${campo('p-nulos', 'Nulos', c.pn.toFixed(2), '%', 'Sobre los emitidos', PART_COLOR.nulos)}
      ${campo('p-blancos', 'Blancos', c.pb.toFixed(2), '%', 'Sobre los emitidos', PART_COLOR.blancos)}
      <div class="part-campo part-calc destacado${c.pv < 0 ? ' mal' : ''}" style="--part-color:${PART_COLOR.votos}">
        <p class="part-et">Votos válidos</p>
        <p class="part-val">${c.pv < 0 ? '—' : fmtNum(c.validos)}</p>
      </div>
    </div>

    <div class="part-resta">
      <p class="part-paso">
        <span class="part-paso-n">1</span>
        ${fmtNum(c.E)} electores habilitados
        − ${fmtNum(c.ausentes)} ausentes (${dec(c.pa, 2)} %)
        = <b>${fmtNum(c.emitidos)} votos emitidos</b>
      </p>
      <p class="part-paso">
        <span class="part-paso-n">2</span>
        ${fmtNum(c.emitidos)} votos emitidos
        − ${fmtNum(c.nulos)} nulos (${dec(c.pn, 2)} %)
        − ${fmtNum(c.blancos)} blancos (${dec(c.pb, 2)} %)
        = <b>${c.pv < 0 ? '—' : fmtNum(c.validos)} votos válidos</b>
      </p>
    </div>

    ${c.pv < 0 ? `<p class="sec-nota" style="color:var(--rampa-4)">
      Los porcentajes de nulos y blancos suman más de 100: no queda ningún voto válido. Bájalos.</p>` : ''}`;

  const leer = (id, campoEstado) => {
    const inp = document.getElementById(id);
    if (!inp) return;
    inp.addEventListener('change', () => {
      const v = Math.max(0, parseFloat(inp.value) || 0);
      ASIG.part[campoEstado] = v;
      ASIG.tocado[campoEstado] = true;
      pintarParticipacion();
      /* El simulador recibe la cuenta nueva sin recargarse: los porcentajes
         que ya se escribieron para cada lista se conservan. */
      enviarParticipacion();
      actualizarCabeceraAsignacion();
      const otra = document.getElementById(id);
      if (otra) { otra.focus(); otra.select(); }
    });
  };
  leer('p-electores', 'electores');
  leer('p-aus', 'ausentismo');
  leer('p-nulos', 'nulos');
  leer('p-blancos', 'blancos');
}


/* ── Cabecera: la ruta del distrito y qué hay en el simulador ───────────── */

/** La ruta Ecuador › provincia › cantón › concejalía › circunscripción. Los
    pasos hechos se pueden pulsar para subir; los que faltan se dicen. */
function pintarRuta() {
  const nav = document.getElementById('a-ruta');
  if (!nav) return;
  const o = ASIG.origen;
  const c = circunActiva();
  const pasos = [`<button type="button" class="asig-ruta-paso" data-asig-nivel="pais">Ecuador</button>`];
  const pend = (t) => `<span class="asig-ruta-pend">${t}</span>`;
  if (!o.provK) pasos.push(pend('Elige provincia'));
  else {
    pasos.push(`<button type="button" class="asig-ruta-paso" data-asig-nivel="provincia">${escaparHTML(ambitoTexto({ provK: o.provK }))}</button>`);
    if (!o.cantK) pasos.push(pend('Elige cantón'));
    else {
      pasos.push(`<button type="button" class="asig-ruta-paso" data-asig-nivel="canton">${escaparHTML(ambitoTexto({ provK: o.provK, cantK: o.cantK }))}</button>`);
      if (!o.dignidad) pasos.push(pend('Elige concejalía'));
      else {
        const conCirc = o.dignidad === 'CONCEJALES_URBANOS' && circunscripcionesDelCanton(o.provK, o.cantK).length;
        pasos.push(conCirc
          ? `<button type="button" class="asig-ruta-paso" data-asig-nivel="dignidad">${escaparHTML(etiquetaDignidad(o.dignidad))}</button>`
          : `<span class="asig-ruta-act">${escaparHTML(etiquetaDignidad(o.dignidad))}</span>`);
        if (conCirc) {
          pasos.push(c ? `<span class="asig-ruta-act asig-ruta-circ asig-circ-nom" style="--c:${colorCircun(c.n)}">${escaparHTML(nombreCircun(c))}</span>`
                       : pend('Elige circunscripción'));
        }
      }
    }
  }
  nav.innerHTML = pasos.join('<span class="asig-ruta-sep" aria-hidden="true">›</span>');
  /* data-asig-nivel, no data-nivel: js/app.js recorre todos los [data-nivel]
     del documento para su propia ruta de Preinscritos. */
  nav.querySelectorAll('[data-asig-nivel]').forEach(b => { b.onclick = () => irANivel(b.dataset.asigNivel); });
}

/** El subtítulo cuenta qué hay ahora en el simulador. */
function actualizarCabeceraAsignacion() {
  pintarRuta();
  const sub = document.getElementById('a-sub');
  if (!sub) return;
  const t = ASIG.cargado;
  const falta = faltaDistrito();
  if (!falta && noEligeDignidad()) { sub.textContent = textoNoElige(); return; }
  if (falta || !t) {
    sub.textContent = falta ? textoEspera()
      : `Simulación con las listas y los candidatos inscritos para ${ASIG_ANIO_SIM}.`;
    return;
  }
  const c = cuentaParticipacion();
  sub.innerHTML = (t.listas
      ? `En el simulador: ${fmtNum(t.listas)} ${t.listas === 1 ? 'lista inscrita' : 'listas inscritas'}${t.candidatos
          ? ` y ${fmtNum(t.candidatos)} ${t.candidatos === 1 ? 'candidato' : 'candidatos'}` : ''}`
      : 'Sin listas inscritas: el simulador trae listas en blanco para escribirlas a mano')
    + `, repartiendo <b>${fmtNum(ASIG.escanosPrueba || t.escanos)} ${(ASIG.escanosPrueba || t.escanos) === 1 ? 'escaño' : 'escaños'}</b>${ASIG.escanosPrueba
        ? ` (prueba; el distrito elige ${fmtNum(t.escanos)})` : ''} sobre
       ${c.validos > 0 ? fmtNum(c.validos) : '—'} votos válidos. Escribe el porcentaje de cada lista
       en el simulador.`;
}
