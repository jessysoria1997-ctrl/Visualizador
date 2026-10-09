/* ============================================================================
   asignacion.js — SECCIÓN «ASIGNACIÓN»

   Aquí vive el **Simulador de Escaños Electorales completo**, el mismo que se
   entregó, incrustado en `asignacion/simulador.html`. No se le recortó
   ninguna función: se escriben las listas a mano, se añaden y se quitan, se
   ponen blancos y nulos, umbral, desempate, se guardan escenarios y se
   comparan, se mira la adjudicación escaño por escaño, los cocientes, los
   votos que faltan, la sensibilidad, y se exporta a CSV, Excel o PDF.

   Dos cosas cambian respecto del original:
     · **Solo D'Hondt.** Los otros métodos se quitaron de su tabla METODOS, y
       con ellos la sección que los comparaba.
     · **Participación y puente.** Encima del simulador hay un bloque que
       parte del padrón y descuenta ausentismo, nulos y blancos para llegar a
       los votos válidos con los que se reparte. Los porcentajes vienen de
       2023 y se pueden escribir. Con un botón, ese total y el reparto de cada
       lista pasan al simulador, con los escaños que de verdad elige el
       cantón.

   El puente escribe el borrador que el propio simulador lee al arrancar
   (localStorage, clave `simuladorEscanos.v1.borrador`) y recarga el marco.
   No se tocó una línea de su lógica para conseguirlo.
   ========================================================================== */

/* Las únicas dignidades que se reparten en escaños. El orden es el del panel. */
const ASIG_DIGNIDADES = ['CONCEJALES_URBANOS', 'CONCEJALES_RURALES'];

/* El único año con el que se trabaja aquí: la última elección. */
const ASIG_ANIO = 2023;

/* Un color por tarjeta de participación, para que el bloque se lea de un golpe.
   Son los tonos para fondo claro, que es como va esta sección desde la v4.6.
   Están en el orden de la fila y los vecinos se eligieron separados a
   propósito: la última tarjeta lleva el lila de concejales del tablero y las
   otras cinco se reparten el círculo lejos de él, así que dos tarjetas
   contiguas no se confunden ni con daltonismo (ΔE 8.5 protán, 17.9 visión
   normal) y cada etiqueta contrasta 5,2:1 o más sobre su propio fondo.
   El color viste la tarjeta —barra, fondo y etiqueta—, no la cifra: los cuatro
   números que se escriben van en negro y solo los dos resultados van
   pintados, para que se vea de un vistazo qué se teclea y qué se calcula. */
const PART_COLOR = {
  electores:  '#2A72C8',   /* azul     · el padrón del que se parte */
  ausentismo: '#D4553C',   /* coral    · lo que se descuenta */
  nulos:      '#0E8EA8',   /* turquesa */
  blancos:    '#AE6E0C',   /* ámbar */
  validos:    '#1A8F62',   /* verde    · lo que queda */
  votos:      'var(--acento)' /* el lila de concejales · la cifra que reparte */
};

/* Dónde guarda el simulador lo que tiene en pantalla (ver su almacen.js). */
const ASIG_CLAVE_BORRADOR = 'simuladorEscanos.v1.borrador';
const ASIG_PAGINA = 'asignacion/simulador.html';

const ASIG = {
  /* Elección de la que se parte. */
  origen: { dignidad: ASIG_DIGNIDADES[0], anio: null, provK: '', cantK: '', parrK: '' },
  /* Participación. Los porcentajes son SOBRE EL PADRÓN, para que la resta
     salga exacta: válidos = electores − ausentes − nulos − blancos. */
  part: { electores: 0, ausentismo: 0, nulos: 0, blancos: 0 },
  tocado: {},        // qué campos escribió el usuario: esos no se recalculan
  montado: false,
  traidas: null,     // qué se llevó la última vez, para contarlo en la cabecera
  mapaProv: null     // el mapa de la vista provincial, para no rehacerlo cada vez
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

/** Escaños que elige el cantón en esta dignidad, o null si no se sabe. */
function escanosDelCanton(dignidad, provK, cantK) {
  const t = (ESCANOS.tabla || {})[dignidad];
  if (!t || !provK || !cantK) return null;
  const n = t[provK + '|' + cantK];
  return Number.isInteger(n) ? n : null;
}

/** Si el cantón elige esa dignidad por circunscripciones, cuántos escaños
    pone cada una. Trece cantones grandes lo hacen, Quito entre ellos. */
function circunsDelCanton(dignidad, provK, cantK) {
  const c = (ESCANOS.circuns || {})[dignidad];
  if (!c || !provK || !cantK) return null;
  const v = c[provK + '|' + cantK];
  return Array.isArray(v) && v.length > 1 ? v : null;
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
    (typeof cargarRecintos === 'function') ? cargarRecintos() : null,
    (typeof cargarParroquias === 'function' && !TERRITORIO.parroquiasPorCant.size)
      ? cargarParroquias() : null
  ].filter(Boolean));
  if (!ASIG.montado) {
    const a = (typeof alcanceClaves === 'function') ? alcanceClaves() : null;
    if (a) { o.provK = a.provK; o.cantK = a.cantK || ''; }
    const hay = dignidadesAsignacion();
    if (hay.length && !hay.includes(o.dignidad)) o.dignidad = hay[0];
  }
  /* El territorio se comparte con las otras dos secciones: se entra con el que
     venía de allá, salvo que aquí ya se hubiera elegido otro. */
  const f = (typeof SEC !== 'undefined' && SEC.filtros) ? SEC.filtros.historico : null;
  if (f && f.provK && (f.provK !== o.provK || f.cantK !== o.cantK)) {
    if (o.cantK !== f.cantK) ASIG.tocado = {};
    o.provK = f.provK;
    o.cantK = f.cantK || '';
  }
  o.parrK = '';                         // los concejales se eligen por cantón
  o.anio = anioDeTrabajo();
  recalcularParticipacion();
  construirPanelAsignacion();
  renderAsignacion();
}


/* ============================================================================
   PARTICIPACIÓN

   De cuántos electores se parte y cuántos votos válidos quedan. Los cuatro
   porcentajes van SOBRE EL PADRÓN, no sobre los votos emitidos, para que la
   cuenta sea la resta que se ve en pantalla:

       válidos = electores − ausentes − nulos − blancos
       % válidos = 100 − % ausentismo − % nulos − % blancos

   Por defecto salen de la elección elegida (2023 al abrir): los ausentes son
   los electores del padrón menos quienes votaron ese año, y los nulos y
   blancos los de esa elección. Cualquiera de los cuatro se puede escribir, y
   lo escrito no se vuelve a recalcular al cambiar de año o de dignidad.
   ========================================================================== */

/**
 * Padrón que elige esta dignidad.
 *
 * No es el del cantón entero: a los concejales **urbanos** los eligen solo
 * las parroquias urbanas, y a los **rurales** solo las rurales. Usar el
 * padrón completo inflaría el ausentismo —en Quito lo subía del 19 % al
 * 43 %— y dejaría la cuenta sin sentido.
 *
 * El reparto por parroquia sale del distributivo de recintos y el tipo de
 * cada parroquia del campo «estado» de la capa parroquial. Si alguno de los
 * dos no está cargado todavía, se devuelve el padrón del cantón y la ayuda
 * de pantalla lo dice.
 */
function electoresDelCanton(dignidad, provK, cantK) {
  if (!provK || !cantK) return { n: 0, tipo: null };
  const completo = (typeof ELECTORES !== 'undefined' && ELECTORES.disponible)
    ? (ELECTORES.cantones[provK + '|' + cantK] || 0) : 0;

  const quiere = dignidad === 'CONCEJALES_URBANOS' ? true
               : dignidad === 'CONCEJALES_RURALES' ? false : null;
  if (quiere === null) return { n: completo, tipo: null };

  const partes = padronPorTipo(provK, cantK);
  if (!partes) return { n: completo, tipo: null };
  return { n: quiere ? partes.urbano : partes.rural, tipo: quiere ? 'urbano' : 'rural' };
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
       RURAL. (f.__urbana no sirve aquí: marca la cabecera cantonal del INEC,
       que esta capa ya no usa porque trae cada parroquia urbana aparte.) */
    const estado = geo && geo.feature && geo.feature.properties
      ? normalizarTexto(geo.feature.properties.estado || '') : '';
    if (estado === 'URBANA') urbano += r.electores || 0;
    else if (estado === 'RURAL') rural += r.electores || 0;
    else sinTipo += r.electores || 0;
  });
  /* Sin ninguna parroquia clasificada no hay reparto que valga. */
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
  if (!t.electores) p.electores = padron.n;

  const s = anioDeOrigen();
  const E = p.electores;
  if (!s || !E) {
    if (!t.ausentismo) p.ausentismo = 0;
    if (!t.nulos) p.nulos = 0;
    if (!t.blancos) p.blancos = 0;
    return;
  }
  const emitidos = s.validos + s.nulos + s.blancos;
  if (!t.ausentismo) p.ausentismo = Math.max(0, (E - emitidos) * 100 / E);
  if (!t.nulos) p.nulos = s.nulos * 100 / E;
  if (!t.blancos) p.blancos = s.blancos * 100 / E;
}

/** La cuenta completa, tal como se muestra. */
function cuentaParticipacion() {
  const p = ASIG.part;
  const E = Math.max(0, Math.round(p.electores) || 0);
  const pct = (x) => Math.max(0, Number(x) || 0);
  const pa = pct(p.ausentismo), pn = pct(p.nulos), pb = pct(p.blancos);
  const pv = 100 - pa - pn - pb;
  const ausentes = Math.round(E * pa / 100);
  const nulos = Math.round(E * pn / 100);
  const blancos = Math.round(E * pb / 100);
  /* Los válidos son la resta, no un redondeo aparte: así los cuatro números
     suman siempre el padrón y no sobra ni falta un voto. */
  const validos = E - ausentes - nulos - blancos;
  return { E, pa, pn, pb, pv, ausentes, nulos, blancos, validos,
           emitidos: E - ausentes, valido: pv >= 0 && E > 0 };
}

/** Las dignidades de concejales con datos para este usuario. */
function dignidadesAsignacion() {
  return ASIG_DIGNIDADES.filter(id => (HIST.votos[id] || []).length);
}

/** Serie del histórico para la elección elegida, o [] si no hay datos. */
function serieDeOrigen() {
  const o = ASIG.origen;
  if (typeof serieHistorica !== 'function' || !(o.dignidad in HIST.votos)) return [];
  if (!o.provK || !o.cantK) return [];   // el reparto es de un cantón
  try { return serieHistorica(o.dignidad, o.provK, o.cantK, ''); }
  catch (e) { console.warn('[Dashboard] asignación:', e); return []; }
}

/** Qué falta por elegir para tener un cantón, o '' si ya está completo. */
function faltaDistrito() {
  const o = ASIG.origen;
  if (!o.provK) return 'provincia';
  if (!o.cantK) return 'canton';
  return '';
}

const ASIG_NIVEL_TXT = { provincia: 'una provincia', canton: 'un cantón' };


/* ============================================================================
   PANEL LATERAL · traer los votos de una elección
   ========================================================================== */

function construirPanelAsignacion() {
  const cont = document.getElementById('filtros-asignacion');
  if (!cont) return;
  const o = ASIG.origen;
  const serie = serieDeOrigen();
  const hay = dignidadesAsignacion();

  /* Territorio con el mismo control del histórico —respeta el alcance del
     usuario— pero sin parroquia: los concejales se eligen por cantón. */
  const terr = selectoresTerritorio(o, alCambiarOrigen, 'a', { sinParroquia: true });

  cont.innerHTML = `
    <section class="bloque">
      <h2 class="bloque-tit"><i class="ix">01</i> Traer votos reales</h2>
      <p class="bloque-ayuda">Opcional: rellena el simulador con una elección
        de concejales para no escribirla. Dentro puedes cambiarlo todo.</p>
      <div class="dig-grupo" id="a-dig">
        ${hay.map(id => {
          const d = (CONFIG.dignidadesHistorico || []).find(x => x.id === id) || { id, etiqueta: id };
          return `<button type="button" class="dig-btn${id === o.dignidad ? ' activo' : ''}"
                    data-d="${id}" style="--dig-color:${CONFIG.paleta[id].acento}">
            <span class="dig-nombre">${d.etiqueta.toUpperCase()}</span>
            <span class="dig-nivel">Reparto por cantón</span>
          </button>`;
        }).join('') || '<p class="campo-nota" style="display:block">Sin datos de concejales para este usuario.</p>'}
      </div>
    </section>

    <section class="bloque">
      <h2 class="bloque-tit"><i class="ix">02</i> Territorio</h2>
      ${terr.html}
      <p class="campo-nota" style="display:block;margin:-2px 0 10px">
        ${serie.length
          ? `Los votos de partida son los de ${ASIG_ANIO}, la última elección.`
          : (faltaDistrito() ? 'Elige antes ' + ASIG_NIVEL_TXT[faltaDistrito()] + '.'
                             : `Sin datos de ${ASIG_ANIO} para este filtro.`)}</p>
      <button class="btn btn-limpiar" type="button" id="a-blanco">Empezar en blanco</button>
      <p class="campo-nota" style="display:block;margin-top:7px">
        El botón de llevar los votos está arriba, en el bloque de participación.</p>
    </section>`;

  /* Provincia o cantón nuevos: el padrón y los votos son otros, así que la
     participación vuelve a salir de la elección, aunque se hubiera escrito. */
  const alTerritorio = () => { ASIG.tocado = {}; alCambiarOrigen(); };
  terr.cablear();
  ['a-prov', 'a-cant'].forEach(id => {
    const sel = document.getElementById(id);
    if (sel) {
      const previo = sel.onchange;
      sel.onchange = (e) => { if (previo) previo(e); ASIG.tocado = {}; recalcularParticipacion(true); pintarParticipacion(); };
    }
  });
  cont.querySelectorAll('#a-dig [data-d]').forEach(b => {
    b.onclick = () => {
      if (o.dignidad === b.dataset.d) return;
      o.dignidad = b.dataset.d;
      alCambiarOrigen();
    };
  });
  cont.querySelector('#a-blanco').onclick = () => empezarEnBlanco();
}

/** El año de trabajo: siempre 2023, la última elección. Si un cantón no la
    tuviera —no debería pasar— se usa la más reciente que sí tenga. */
function anioDeTrabajo() {
  const serie = serieDeOrigen();
  if (!serie.length) return ASIG_ANIO;
  return serie.some(s => s.anio === ASIG_ANIO) ? ASIG_ANIO : serie[serie.length - 1].anio;
}

/** Cambió la dignidad o el territorio: solo se rehace el panel. */
function alCambiarOrigen() {
  ASIG.origen.anio = anioDeTrabajo();
  /* Al cambiar de cantón el padrón es otro: se vuelve a calcular todo. Al
     cambiar solo de año o de dignidad se respeta lo que el usuario escribió. */
  recalcularParticipacion();
  construirPanelAsignacion();
  pintarProvincia();
  pintarParticipacion();
  actualizarCabeceraAsignacion();

  /* Si en el simulador están los votos que trajimos nosotros, el botón de
     urbanos/rurales y el cantón mandan: se vuelven a llevar los que tocan,
     con sus escaños. Lo que el usuario escribió a mano no se toca. */
  if (ASIG.traidas && ASIG.montado && !faltaDistrito()) llevarAlSimulador();
}


/* ============================================================================
   EL PUENTE

   El simulador guarda y recupera lo que tiene en pantalla en localStorage.
   Escribir ahí ese mismo borrador y recargar el marco es todo lo que hace
   falta para dejarle los votos puestos, sin tocar su código.
   ========================================================================== */

/**
 * Escenario para el simulador.
 *
 * Los votos de cada lista son su PORCENTAJE de aquella elección aplicado al
 * total de válidos que sale del bloque de participación. Si no se tocó nada,
 * ese total ya es el real y los votos salen tal cual; en cuanto se cambia un
 * porcentaje o el padrón, se reparten sobre el nuevo total.
 *
 * Al repartir con porcentajes sobran o faltan unos pocos votos por el
 * redondeo: la diferencia se le suma a la lista más votada, que es la única
 * forma de que el total cuadre sin alterar el orden. Es un escenario
 * simulado, no un resultado: el histórico guarda los votos reales intactos.
 */
function escenarioDesdeSerie(s, dignidad) {
  const c = cuentaParticipacion();
  const total = Math.max(0, c.validos);
  const suma = s.organizaciones.reduce((a, x) => a + x.votos, 0) || 1;

  const listas = s.organizaciones.map((x, i) => ({
    id: 'r' + i, nombre: tituloCase(x.op),
    votos: Math.max(0, Math.round(x.votos * total / suma)), color: i
  }));
  const repartido = listas.reduce((a, l) => a + l.votos, 0);
  if (listas.length && repartido !== total) listas[0].votos += total - repartido;

  return {
    listas,
    escanos: escanosDelCanton(dignidad, ASIG.origen.provK, ASIG.origen.cantK) || 7,
    metodo: 'dhondt',
    umbral: 0,
    baseModo: 'listas',
    blancos: c.blancos,
    nulos: c.nulos,
    desempate: 'mayor_votos',
    participante: 'lista'
  };
}

/** Deja un escenario escrito para el simulador y recarga el marco. */
function ponerEnSimulador(escenario) {
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
  if (marco) marco.src = ASIG_PAGINA + '?v=' + CONFIG.version + '&t=' + Date.now();
  return true;
}

function llevarAlSimulador() {
  const o = ASIG.origen;
  const serie = serieDeOrigen();
  const s = serie.find(x => x.anio === o.anio) || serie[serie.length - 1];
  if (!s) return;
  if (!ponerEnSimulador(escenarioDesdeSerie(s, o.dignidad))) return;
  const c = cuentaParticipacion();
  ASIG.traidas = {
    etq: HIST.etiquetas[o.dignidad] || o.dignidad,
    ambito: ambitoTexto({ provK: o.provK, cantK: o.cantK, parrK: '' }),
    anio: s.anio, listas: s.organizaciones.length, votos: c.validos,
    escanos: escanosDelCanton(o.dignidad, o.provK, o.cantK)
  };
  actualizarCabeceraAsignacion();
  if (typeof avisar === 'function') {
    avisar(`${fmtNum(s.organizaciones.length)} listas y ${fmtNum(c.validos)} votos en el simulador`);
  }
}

function empezarEnBlanco() {
  const vacio = {
    listas: [
      { id: 'n1', nombre: 'Lista 1', votos: 0, color: 0 },
      { id: 'n2', nombre: 'Lista 2', votos: 0, color: 1 },
      { id: 'n3', nombre: 'Lista 3', votos: 0, color: 2 }
    ],
    escanos: escanosDelCanton(ASIG.origen.dignidad, ASIG.origen.provK, ASIG.origen.cantK) || 7,
    metodo: 'dhondt', umbral: 0, baseModo: 'listas',
    blancos: 0, nulos: 0, desempate: 'mayor_votos', participante: 'lista'
  };
  if (!ponerEnSimulador(vacio)) return;
  ASIG.traidas = null;
  actualizarCabeceraAsignacion();
  if (typeof avisar === 'function') avisar('Simulador en blanco: escribe tus listas');
}


/* ============================================================================
   VISTA · el simulador completo
   ========================================================================== */

function renderAsignacion() {
  const vista = document.getElementById('vista-asignacion');
  if (!vista) return;
  temaSeccion(ASIG.origen.dignidad);

  /* El marco se monta una sola vez: recargarlo en cada render borraría lo que
     el cliente lleve escrito. */
  if (ASIG.montado && document.getElementById('a-marco')) {
    actualizarCabeceraAsignacion();
    return;
  }

  vista.innerHTML = `
    <section class="tarjeta sec-cabecera">
      <h2 class="tarjeta-tit">Asignación de escaños · método D'Hondt</h2>
      <p class="tarjeta-sub" id="a-sub">—</p>
    </section>

    <section class="tarjeta sec-tarjeta" id="a-provincia"></section>

    <section class="tarjeta sec-tarjeta" id="a-participacion"></section>

    <section class="tarjeta asig-marco-caja">
      <iframe id="a-marco" class="asig-marco" title="Simulador de escaños electorales"
              src="${ASIG_PAGINA}?v=${CONFIG.version}"></iframe>
    </section>`;

  ASIG.montado = true;
  pintarProvincia();
  pintarParticipacion();
  actualizarCabeceraAsignacion();
}


/* ── La vista provincial ───────────────────────────────────────────────────
   Lo primero que se ve: cuántos escaños de concejales elige la provincia y
   cómo se reparten entre sus cantones, sin tener que elegir un cantón. El
   mapa lleva el número encima de cada cantón, en un anillo partido en la
   proporción urbano/rural; al hacer clic se baja al análisis del cantón.   */

const PROV_COLOR = { urbano: '#2A72C8', rural: '#1A8F62' };

/** Los cantones de la provincia con sus escaños y su geometría. */
function cantonesDeProvincia(provK) {
  const feats = ((DATOS.geo.cantones || {}).features || []).filter(x => x.__provK === provK);
  return feats.map(f => {
    const u = escanosDelCanton('CONCEJALES_URBANOS', provK, f.__key) || 0;
    const r = escanosDelCanton('CONCEJALES_RURALES', provK, f.__key) || 0;
    return { feature: f, key: f.__key, nombre: f.__nombre, urbano: u, rural: r, total: u + r,
             circuns: circunsDelCanton('CONCEJALES_URBANOS', provK, f.__key) };
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

function pintarProvincia() {
  const caja = document.getElementById('a-provincia');
  if (!caja) return;
  const o = ASIG.origen;

  const cab = (sello) => `
    <header class="tabla-cab">
      <div>
        <h2 class="tarjeta-tit">Escaños de concejales${o.provK
          ? ' · ' + escaparHTML(ambitoTexto({ provK: o.provK })) : ''}</h2>
        <p class="tarjeta-sub">Cuántos elige cada cantón y cómo se reparten entre urbanos y
          rurales. Haz clic en un cantón para analizar su asignación.</p>
      </div>
      ${sello ? `<span class="res-sello">${sello}</span>` : ''}
    </header>`;

  if (!o.provK) {
    soltarMapaProvincia();
    caja.innerHTML = cab('') +
      '<p class="sec-vacio">Elige una provincia en el panel de la izquierda.</p>';
    return;
  }

  const filas = cantonesDeProvincia(o.provK);

  /* Si el usuario solo tiene un cantón —las carpetas por cantón— no tiene
     sentido pedirle que lo elija: se abre su análisis directamente. */
  if (!o.cantK && filas.length === 1) {
    o.cantK = filas[0].key;
    alCambiarOrigen();
    return;
  }

  const tot = filas.reduce((a, x) => a + x.total, 0);
  const urb = filas.reduce((a, x) => a + x.urbano, 0);
  const rur = filas.reduce((a, x) => a + x.rural, 0);
  const mayor = filas[0];
  /* «El que más elige» se mide con la dignidad que se está analizando. */
  const mayorDig = filas.slice().sort((a, b) =>
    (ASIG.origen.dignidad === 'CONCEJALES_URBANOS' ? b.urbano - a.urbano : b.rural - a.rural))[0];
  const padron = padronDeProvincia(o.provK);
  const pct = (n) => tot ? dec(n * 100 / tot, 1) + ' %' : '—';
  const esUrbano = o.dignidad === 'CONCEJALES_URBANOS';

  const tarjeta = (et, val, pie, color, clase) => `
    <div class="prov-tarjeta${clase ? ' ' + clase : ''}"${color ? ` style="--part-color:${color}"` : ''}>
      <p class="prov-et">${et}</p>
      <p class="prov-val">${val}</p>
      <p class="prov-pie">${pie}</p>
    </div>`;

  /* El armazón se levanta una sola vez: si se rehiciera en cada pintada, el
     mapa se quedaría sin el div donde vive y desaparecería al elegir cantón.
     Después solo se reescriben la cabecera y las tarjetas. */
  const sello = `${fmtNum(filas.length)} ${filas.length === 1 ? 'cantón' : 'cantones'}`;
  if (!document.getElementById('a-prov-tarjetas')) {
    soltarMapaProvincia();
    caja.innerHTML = cab(sello) + `
      <div class="prov-fila">
        <div class="prov-mapa" id="a-mapa"></div>
        <div class="prov-tarjetas" id="a-prov-tarjetas"></div>
      </div>`;
  } else {
    const tit = caja.querySelector('.tarjeta-tit');
    const sll = caja.querySelector('.res-sello');
    if (tit) tit.textContent = 'Escaños de concejales · ' + ambitoTexto({ provK: o.provK });
    if (sll) sll.textContent = sello;
  }

  document.getElementById('a-prov-tarjetas').innerHTML = `
        ${tarjeta('Escaños de la provincia', fmtNum(tot),
          'Concejales que se eligen en total', '', 'prov-total')}
        <div class="prov-par">
          ${tarjeta('Urbanos', fmtNum(urb), pct(urb) + ' del total', PROV_COLOR.urbano,
            esUrbano ? 'activa' : '')}
          ${tarjeta('Rurales', fmtNum(rur), pct(rur) + ' del total', PROV_COLOR.rural,
            esUrbano ? '' : 'activa')}
        </div>
        ${tarjeta('Cantones', fmtNum(filas.length),
          mayorDig ? `${escaparHTML(tituloCase(mayorDig.nombre))} es el que más elige:
            ${esUrbano ? mayorDig.urbano : mayorDig.rural} ${esUrbano ? 'urbanos' : 'rurales'}` : '—',
          '', 'prov-ancha')}
        ${tarjeta('Electores', padron ? fmtNum(padron) : '—',
          'Padrón vigente, 2027', '', 'prov-ancha')}
        <p class="prov-leyenda">
          <span><i style="background:${PROV_COLOR.urbano}"></i>Urbanos</span>
          <span><i style="background:${PROV_COLOR.rural}"></i>Rurales</span>
          <span class="prov-pista">En el mapa, el círculo de cada cantón trae sus
            <b>${esUrbano ? 'escaños urbanos' : 'escaños rurales'}</b>, que son los que
            reparte el simulador. Cambia el botón de arriba para ver los otros.</span>
        </p>`;

  dibujarMapaProvincia(filas);
}

/** Suelta el mapa provincial antes de rehacer el armazón que lo contiene. */
function soltarMapaProvincia() {
  if (ASIG.mapaProv) {
    try { ASIG.mapaProv.map.remove(); } catch (e) { /* ya no estaba */ }
    ASIG.mapaProv = null;
  }
}

/** El mapa de la provincia con un marcador de escaños sobre cada cantón. */
function dibujarMapaProvincia(filas) {
  const cont = document.getElementById('a-mapa');
  if (!cont || typeof L === 'undefined' || !filas.length) return;
  const o = ASIG.origen;
  const rampa = CONFIG.paleta.CONCEJALES_URBANOS.rampa;
  /* El mapa habla de la dignidad elegida: el número del círculo es el mismo
     que va a repartir el simulador. Cambiar el botón repinta el mapa entero. */
  const esUrbano = o.dignidad === 'CONCEJALES_URBANOS';
  const tono = esUrbano ? PROV_COLOR.urbano : PROV_COLOR.rural;
  const dig = (x) => esUrbano ? x.urbano : x.rural;
  const max = Math.max(1, ...filas.map(dig));

  /* El mapa se rehace solo si cambió la provincia: así elegir un cantón no
     lo redibuja entero, solo repinta lo que ya está. */
  if (ASIG.mapaProv && ASIG.mapaProv.provK !== o.provK) {
    ASIG.mapaProv.map.remove();
    ASIG.mapaProv = null;
  }
  if (!ASIG.mapaProv) {
    const map = L.map('a-mapa', {
      zoomControl: true, attributionControl: true, minZoom: 5, maxZoom: 13,
      scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false
    }).setView(CONFIG.vistaEcuador.centro, CONFIG.vistaEcuador.zoom);
    cont.style.background = CONFIG.mapaBase.color;
    if (map.attributionControl) map.attributionControl.addAttribution(CONFIG.mapaBase.credito);
    ASIG.mapaProv = { map, provK: o.provK, capa: null, pines: null };
  }
  const M = ASIG.mapaProv;

  if (!M.capa) {
    M.capa = L.geoJSON({ type: 'FeatureCollection', features: filas.map(x => x.feature) }, {
      style: () => ({ fill: true, stroke: true, fillOpacity: .9, color: '#FFFFFF', weight: .9, opacity: .95 })
    }).addTo(M.map);
    M.pines = L.layerGroup().addTo(M.map);
    M.map.fitBounds(M.capa.getBounds(), { padding: [20, 20], animate: false });
  }

  const porClave = new Map(filas.map(x => [x.key, x]));
  const globo = (x) => `
    <div class="tt"><div class="tt-titulo">${escaparHTML(tituloCase(x.nombre))}</div>
      <div class="tt-sub">${escaparHTML(tituloCase(ambitoTexto({ provK: o.provK })))}</div>
      <div class="tt-metricas">
        <div><span>${esUrbano ? 'Urbanos' : 'Rurales'}</span><b>${fmtNum(dig(x))}</b></div>
        <div><span>${esUrbano ? 'Rurales' : 'Urbanos'}</span><b>${fmtNum(esUrbano ? x.rural : x.urbano)}</b></div>
        <div><span>Total del concejo</span><b>${fmtNum(x.total)}</b></div>
      </div>
      ${x.circuns ? `<div class="tt-sub">Los urbanos en ${x.circuns.length} circunscripciones:
        ${x.circuns.join(' + ')}</div>` : ''}
      <div class="tt-pie"><span class="tt-chip">${x.key === o.cantK ? 'En análisis' : 'Clic para analizar'}</span></div></div>`;

  /* Elegir cantón desde el mapa hace lo mismo que elegirlo en el panel: el
     padrón es otro, así que la participación se recalcula entera. */
  const elegir = (clave) => {
    if (o.cantK === clave) return;
    o.cantK = clave;
    ASIG.tocado = {};
    alCambiarOrigen();
  };

  M.capa.eachLayer(l => {
    const x = porClave.get(l.feature.__key);
    if (!x) return;
    const t = max > 0 ? dig(x) / max : 0;
    const activo = x.key === o.cantK;
    l.setStyle({ fillColor: dig(x) ? colorDegradado(rampa, .18 + t * .82) : CONFIG.paleta.sinDatos,
                 color: activo ? '#141413' : '#FFFFFF', weight: activo ? 2.2 : .9, fillOpacity: .9 });
    l.unbindTooltip();
    l.bindTooltip(() => globo(x), { sticky: true, direction: 'top', className: 'tt-wrap', opacity: 1 });
    l.off('mouseover').off('mouseout').off('click');
    l.on('mouseover', e => { if (!activo) e.target.setStyle({ weight: 2.2, color: '#141413' }); });
    l.on('mouseout', e => { if (!activo) e.target.setStyle({ weight: .9, color: '#FFFFFF' }); });
    l.on('click', () => elegir(x.key));
  });

  /* Los marcadores: el número de escaños de la dignidad elegida, en un círculo
     cuyo ÁREA es proporcional a ese número —así dos círculos se comparan por
     tamaño sin engañar— y del color de la dignidad. Los cantones que no eligen
     ninguno salen en gris pequeño, para que no desaparezcan del mapa. */
  M.pines.clearLayers();
  filas.forEach(x => {
    const capa = M.capa.getLayers().find(l => l.feature.__key === x.key);
    if (!capa) return;
    const n = dig(x);
    const d = n ? Math.round(26 + 34 * Math.sqrt(n / max)) : 22;
    const html = `<div class="esc-pin${x.key === o.cantK ? ' activo' : ''}${n ? '' : ' vacio'}"
      style="--d:${d}px;--pu:100%;--cu:${n ? tono : '#B9B5AC'};--cr:${n ? tono : '#B9B5AC'}"
      ><b>${fmtNum(n)}</b></div>`;
    const pin = L.marker(capa.getBounds().getCenter(), {
      icon: L.divIcon({ html, className: 'esc-pin-caja', iconSize: [d, d], iconAnchor: [d / 2, d / 2] }),
      interactive: true, keyboard: false
    });
    pin.bindTooltip(() => globo(x), { sticky: true, direction: 'top', className: 'tt-wrap', opacity: 1 });
    pin.on('click', () => elegir(x.key));
    pin.addTo(M.pines);
  });

  /* El contenedor puede haber cambiado de tamaño desde que se creó el mapa
     (al abrir la pestaña, al redimensionar): se recalcula y se vuelve a
     encuadrar la provincia para que llene la caja. */
  setTimeout(() => {
    try {
      M.map.invalidateSize();
      M.map.fitBounds(M.capa.getBounds(), { padding: [22, 22], animate: false });
    } catch (e) { /* el marco aún no se ve */ }
  }, 60);
}


/* ── El bloque de participación ────────────────────────────────────────── */

function pintarParticipacion() {
  const caja = document.getElementById('a-participacion');
  if (!caja) return;
  const o = ASIG.origen;
  const c = cuentaParticipacion();
  const etq = HIST.etiquetas[o.dignidad] || o.dignidad;
  const ambito = ambitoTexto({ provK: o.provK, cantK: o.cantK, parrK: '' });
  const nEsc = escanosDelCanton(o.dignidad, o.provK, o.cantK);
  const circ = circunsDelCanton(o.dignidad, o.provK, o.cantK);
  const falta = faltaDistrito();

  if (falta) {
    caja.innerHTML = `<h2 class="tarjeta-tit">Participación</h2>
      <p class="sec-vacio">${falta === 'canton'
        ? 'Arriba está la provincia entera. Elige un cantón —en el mapa o en el panel— para analizar su asignación.'
        : `Elige ${ASIG_NIVEL_TXT[falta]} en el panel de la izquierda para partir de su padrón.`}</p>`;
    return;
  }

  const campo = (id, et, valor, suf, ayuda, color) => `
    <div class="part-campo" style="--part-color:${color}">
      <label class="part-et" for="${id}">${et}</label>
      <div class="part-ent${suf ? ' con-suf' : ''}">
        <input type="number" id="${id}" class="part-num" value="${valor}"
               step="${suf ? '0.01' : '1'}" min="0" aria-label="${et}">
        ${suf ? `<span class="part-suf">${suf}</span>` : ''}
      </div>
      <p class="part-ayuda">${ayuda}</p>
    </div>`;

  caja.innerHTML = `
    <header class="tabla-cab">
      <div>
        <h2 class="tarjeta-tit">Participación · ${escaparHTML(ambito)} · ${o.anio || ''}</h2>
        <p class="tarjeta-sub">Del padrón se descuenta quien no vota, lo nulo y lo blanco.
          Lo que queda es con lo que se reparte. Escribe cualquier porcentaje y la cuenta se rehace.</p>
      </div>
      <span class="res-sello">${nEsc != null
        ? `${fmtNum(nEsc)} ${nEsc === 1 ? 'escaño' : 'escaños'}` : 'Escaños por confirmar'}</span>
    </header>

    <div class="part-rejilla">
      ${campo('p-electores', 'Electores', c.E, '', ASIG.tipoPadron
        ? `Padrón ${ASIG.tipoPadron === 'urbano' ? 'urbano' : 'rural'} del cantón`
        : 'Padrón del cantón', PART_COLOR.electores)}
      ${campo('p-aus', 'Ausentismo', c.pa.toFixed(2), '%', 'No van a votar', PART_COLOR.ausentismo)}
      ${campo('p-nulos', 'Nulos', c.pn.toFixed(2), '%', 'Del padrón', PART_COLOR.nulos)}
      ${campo('p-blancos', 'Blancos', c.pb.toFixed(2), '%', 'Del padrón', PART_COLOR.blancos)}
      <div class="part-campo part-calc${c.pv < 0 ? ' mal' : ''}" style="--part-color:${PART_COLOR.validos}">
        <p class="part-et">Válidos</p>
        <p class="part-val">${dec(c.pv, 2)} %</p>
        <p class="part-ayuda">100 − ausentismo − nulos − blancos</p>
      </div>
      <div class="part-campo part-calc destacado${c.pv < 0 ? ' mal' : ''}" style="--part-color:${PART_COLOR.votos}">
        <p class="part-et">Votos válidos</p>
        <p class="part-val">${c.pv < 0 ? '—' : fmtNum(c.validos)}</p>
        <p class="part-ayuda">Con estos se reparten los escaños</p>
      </div>
    </div>

    <p class="part-resta">
      ${fmtNum(c.E)} electores
      − ${fmtNum(c.ausentes)} ausentes
      − ${fmtNum(c.nulos)} nulos
      − ${fmtNum(c.blancos)} blancos
      = <b>${c.pv < 0 ? '—' : fmtNum(c.validos)} votos válidos</b>
    </p>

    ${c.pv < 0 ? `<p class="sec-nota" style="color:var(--rampa-4)">
      Los tres porcentajes suman más de 100: no queda ningún voto válido. Bájalos.</p>` : ''}

    <div class="part-pie">
      <button class="btn" type="button" id="p-llevar"${c.pv < 0 ? ' disabled' : ''}>
        Llevar al simulador</button>
      <button class="btn btn-sec" type="button" id="p-reset">Volver a los datos de ${o.anio || 'la elección'}</button>
    </div>

    <p class="sec-nota">
      Los porcentajes de arriba son <b>sobre el padrón</b>, no sobre los votos emitidos: por eso
      los cuatro suman 100 y la resta sale exacta. Vienen de ${escaparHTML(etq.toLowerCase())} en
      ${escaparHTML(ambito)}, ${o.anio}; el ausentismo se calcula con ese padrón y la gente que
      votó ese año. ${ASIG.tipoPadron
        ? `El padrón es el de las parroquias <b>${ASIG.tipoPadron === 'urbano' ? 'urbanas' : 'rurales'}</b>,
           que son las que eligen a estos concejales, no el del cantón entero.`
        : 'Es el padrón del cantón completo.'} Es el vigente, de 2027.
      Al llevarlo al simulador, cada lista recibe su porcentaje de aquella elección aplicado a
      este total${nEsc != null ? `, y se reparten los ${fmtNum(nEsc)} ${nEsc === 1 ? 'escaño' : 'escaños'}
      que elige ${escaparHTML(ambito)}` : ''}. Los escaños son los de ${ESCANOS.anio || 2023}
      y vienen de la tabla oficial; en el simulador no se cambian.${circ
        ? ` Ojo: ${escaparHTML(ambito)} elige esos ${fmtNum(nEsc)} concejales urbanos en
            ${circ.length} circunscripciones (${circ.join(' + ')}), cada una con su propio reparto;
            aquí se reparten juntos, con el cantón entero.`
        : ''}</p>`;

  const leer = (id, campoEstado) => {
    const inp = document.getElementById(id);
    if (!inp) return;
    inp.addEventListener('change', () => {
      const v = Math.max(0, parseFloat(inp.value) || 0);
      ASIG.part[campoEstado] = v;
      ASIG.tocado[campoEstado] = true;
      pintarParticipacion();
      const otra = document.getElementById(id);
      if (otra) { otra.focus(); otra.select(); }
    });
  };
  leer('p-electores', 'electores');
  leer('p-aus', 'ausentismo');
  leer('p-nulos', 'nulos');
  leer('p-blancos', 'blancos');

  const bl = document.getElementById('p-llevar');
  if (bl) bl.onclick = () => llevarAlSimulador();
  const br = document.getElementById('p-reset');
  if (br) br.onclick = () => {
    recalcularParticipacion(true);
    pintarParticipacion();
    if (typeof avisar === 'function') avisar('Participación de ' + (o.anio || 'la elección'));
  };
}

/** El subtítulo cuenta de dónde salen los votos que hay dentro. */
function actualizarCabeceraAsignacion() {
  const sub = document.getElementById('a-sub');
  if (!sub) return;
  const t = ASIG.traidas;
  sub.innerHTML = t
    ? `En el simulador: ${fmtNum(t.listas)} listas y ${fmtNum(t.votos)} votos válidos
       de <b>${escaparHTML(t.etq)}</b> en <b>${escaparHTML(t.ambito)}</b>, <b>${t.anio}</b>${
         t.escanos != null ? `, repartiendo <b>${fmtNum(t.escanos)}
         ${t.escanos === 1 ? 'escaño' : 'escaños'}</b>` : ''}.
       Dentro puedes cambiarlo todo.`
    : `Ajusta la participación aquí abajo y llévala al simulador, o escribe las
       listas a mano dentro de él.`;
}
