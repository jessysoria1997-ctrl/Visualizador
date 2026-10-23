/* ============================================================================
   vocales.js — SECCIÓN «VOCALES-ESCAÑOS» (v6.0)

   El mismo sistema de «Asignación-Escaños» (concejales), para los vocales de
   las juntas parroquiales rurales. Misma estructura, mismo simulador y mismo
   método (D'Hondt); cambia el distrito: aquí cada parroquia rural elige su
   propia junta, con sus listas, sus votos y sus escaños.

   El recorrido es por pasos, cada uno aparece cuando el anterior está hecho:

     1. Provincia y cantón (panel lateral o mapa).
     2. Parroquia rural: solo las que tienen listas inscritas para 2027, con el
        nombre EXACTO de la base del cliente (data/vocales.json, que sale de
        Base_Consolidada_Concejales_Vocales_2004_2023.sav con
        preparar_vocales.py) y, si no figura ahí, el del registro 2027.

   Con la parroquia elegida, el simulador se llena solo con las listas y los
   candidatos inscritos para 2027 en ESA parroquia, sin votos, y con los
   vocales que se eligen (los que inscribió cada lista: 5, o 7 en las
   parroquias de más de 50.000 habitantes). Se escribe el porcentaje de cada
   lista y el reparto D'Hondt sale solo.

   La participación de partida (ausentismo, nulos y blancos) sale de los
   resultados de VOCALES 2023 de esa misma parroquia —nunca de alcaldes,
   prefectos ni concejales—, sobre el padrón 2027 de la parroquia (suma de sus
   recintos en el distributivo). Igual que en concejales, cualquiera de los
   cuatro datos se puede escribir y el simulador se actualiza sin perder los
   porcentajes de las listas.

   El simulador es una copia propia del de concejales
   (asignacion/simulador_vocales.html), con su borrador y sus escenarios en
   claves propias: nunca lee ni escribe lo de concejales. La sección tampoco
   cambia el territorio de las demás: Asignación-Escaños (concejales) queda
   exactamente como se dejó.
   ========================================================================== */

const VOC_DIG = 'VOCALES';           // dignidad en el registro y en el histórico
const VOC_ANIO = 2023;               // de aquí sale SOLO la participación de partida
const VOC_ANIO_SIM = 2027;
const VOC_CLAVE_BORRADOR = 'simuladorEscanos.v1.borrador.vocales';
const VOC_PAGINA = 'asignacion/simulador_vocales.html';   // copia propia: el de concejales no se toca
const VOC_ETIQUETA = 'Vocales de juntas parroquiales';

/* Colores del mapa: los de la paleta de vocales del tablero. */
const VOC_COLOR = '#B9548F';         // parroquia rural que elige vocales
const VOC_COLOR_FUERTE = '#7E2C5E';  // la elegida
const VOC_RAMPA = ['#FEE9F1', '#FEC1DD', '#EE92C4', '#C669A1', '#894170'];

const VOC = {
  /* El distrito: provincia, cantón y la clave de la parroquia (la de su
     polígono o, si no tiene, «sin:» + su nombre normalizado). */
  origen: { provK: '', cantK: '', parrK: '', clave: '' },
  part: { electores: 0, ausentismo: 0, nulos: 0, blancos: 0 },
  tocado: {},
  montado: false,
  cargado: null,
  escanosPrueba: null,
  sinReferencia: true,
  mapa: null,
  prePanelAbierto: false,
  escuchando: false
};

/* Datos 2023 de vocales por parroquia (data/vocales.json). */
const VOCD = { cargado: false, ok: false, fuente: '', composicion: null, control: null,
               filas: [], porClave: new Map(), porNombre: new Map(), resuelto: false };

async function cargarVocales2023() {
  if (VOCD.cargado) return;
  VOCD.cargado = true;
  try {
    const r = await fetch('data/vocales.json', { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const c = j.campos || [];
    VOCD.filas = (j.parroquias || []).map(f => {
      const o = {};
      c.forEach((k, i) => { o[k] = f[i]; });
      return o;
    });
    VOCD.fuente = j.fuente || '';
    VOCD.composicion = j.composicion || null;
    VOCD.control = j.control || null;
    VOCD.ok = true;
  } catch (e) {
    console.warn('[Dashboard] datos de vocales 2023 no disponibles:', e);
  }
}

/** Cada parroquia de 2023 con su polígono: se hace una vez, con la capa
    parroquial ya cargada (misma regla que el registro: resolverParroquia). */
function indexarVocales2023() {
  if (VOCD.resuelto || !VOCD.ok) return;
  if (typeof TERRITORIO === 'undefined' || !TERRITORIO.parroquiasPorCant.size) return;
  VOCD.porClave.clear();
  VOCD.porNombre.clear();
  VOCD.filas.forEach(x => {
    x.geoKey = resolverParroquia(x.provK, x.cantK, x.parrK) || '';
    if (x.geoKey) VOCD.porClave.set(x.provK + '|' + x.cantK + '|' + x.geoKey, x);
    VOCD.porNombre.set(x.provK + '|' + x.cantK + '|' + x.parrK, x);
  });
  VOCD.resuelto = true;
}

/** Los datos 2023 de una parroquia: por su polígono o, si no tiene, por su
    nombre. null si la parroquia no eligió vocales en 2023. */
function dato2023(provK, cantK, geoKey, parrK) {
  indexarVocales2023();
  return (geoKey && VOCD.porClave.get(provK + '|' + cantK + '|' + geoKey)) ||
         (parrK && VOCD.porNombre.get(provK + '|' + cantK + '|' + parrK)) || null;
}


/* ============================================================================
   PARROQUIAS, LISTAS Y VOCALES INSCRITOS
   Del registro de preinscritos del propio tablero: no se inventa ni se
   completa nada.
   ========================================================================== */

const VOC_MEMO = { base: null, mapa: new Map() };

/** La clave de la parroquia de un registro: la de su polígono o su nombre. */
function claveParroquiaVoc(r) {
  return r.parrKeyGeo || (r.parrK ? 'sin:' + r.parrK : '');
}

/**
 * Las parroquias rurales del cantón que eligen vocales en 2027 (las que traen
 * listas en el registro), con sus vocales, su padrón y sus datos de 2023.
 */
function parroquiasVocales(provK, cantK) {
  if (!provK || !cantK || typeof DATOS === 'undefined' || !Array.isArray(DATOS.registros)) return [];
  if (VOC_MEMO.base !== DATOS.registros || VOC_MEMO.resuelto !== VOCD.resuelto) {
    VOC_MEMO.base = DATOS.registros;
    VOC_MEMO.resuelto = VOCD.resuelto;
    VOC_MEMO.mapa = new Map();
  }
  const k = provK + '|' + cantK;
  if (VOC_MEMO.mapa.has(k)) return VOC_MEMO.mapa.get(k);
  const grupos = new Map();
  DATOS.registros.forEach(r => {
    if (r.dignidad !== VOC_DIG || r.provK !== provK || r.cantK !== cantK || !r.partido) return;
    const clave = claveParroquiaVoc(r);
    if (!clave) return;
    if (!grupos.has(clave)) {
      grupos.set(clave, { clave, geoKey: r.parrKeyGeo || '', parrK: r.parrK, nombreRegistro: r.parroquia, listas: new Map() });
    }
    const g = grupos.get(clave);
    const kl = (r.lista || '') + '|' + normalizarTexto(r.partido);
    if (!g.listas.has(kl)) g.listas.set(kl, 0);
    if (r.nombre) g.listas.set(kl, g.listas.get(kl) + 1);
  });
  const salida = [...grupos.values()].map(g => {
    const rec = dato2023(provK, cantK, g.geoKey, g.parrK);
    const cuentas = [...g.listas.values()].filter(n => n > 0);
    const n = cuentas.length ? Math.max.apply(null, cuentas) : 0;
    const escanos = n || (rec ? rec.vocales : null);
    return {
      clave: g.clave, geoKey: g.geoKey, parrK: g.parrK,
      /* El nombre LITERAL: el de la base de 2023 del cliente o, si la
         parroquia no está en ella, el del registro de inscripción 2027. */
      nombre: rec ? rec.parroquia : g.nombreRegistro,
      nombreRegistro: g.nombreRegistro,
      fuenteNombre: rec ? 'base' : 'registro',
      escanos, fuente: n ? 'inscritos' : (rec ? 'tabla2023' : null),
      parejo: cuentas.every(c => c === n),
      listas: g.listas.size, candidatos: cuentas.reduce((a, c) => a + c, 0),
      electores: g.geoKey && typeof electoresDeParroquia === 'function'
        ? electoresDeParroquia(provK, cantK, g.geoKey) : 0,
      rec
    };
  }).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  VOC_MEMO.mapa.set(k, salida);
  return salida;
}

/** La parroquia elegida, o null. */
function parroquiaActivaVoc() {
  const o = VOC.origen;
  if (!o.clave || !o.provK || !o.cantK) return null;
  return parroquiasVocales(o.provK, o.cantK).find(p => p.clave === o.clave) || null;
}

/** Las listas inscritas para vocales en esa parroquia, con sus candidatos en
    el orden de inscripción (ese ORDEN decide a quién le toca cada escaño). */
function listasVocales(provK, cantK, clave) {
  if (typeof DATOS === 'undefined' || !Array.isArray(DATOS.registros) || !clave) return [];
  const vistas = new Map();
  DATOS.registros.forEach(r => {
    if (r.dignidad !== VOC_DIG || r.provK !== provK || r.cantK !== cantK || !r.partido) return;
    if (claveParroquiaVoc(r) !== clave) return;
    const kl = (r.lista || '') + '|' + normalizarTexto(r.partido);
    if (!vistas.has(kl)) vistas.set(kl, { lista: r.lista || '', partido: r.partido, n: 0, candidatos: [] });
    const v = vistas.get(kl);
    v.n++;
    if (r.nombre) v.candidatos.push({ orden: r.orden || 0, nombre: r.nombre, suplente: r.suplente || '' });
  });
  const salida = [...vistas.values()];
  salida.forEach(x => {
    x.candidatos.sort((a, b) => (a.orden || 999) - (b.orden || 999) || a.nombre.localeCompare(b.nombre));
    x.candidatos.forEach((c, i) => { if (!c.orden) c.orden = i + 1; });
  });
  return salida.sort((a, b) =>
    (parseInt(a.lista, 10) || 999) - (parseInt(b.lista, 10) || 999) || a.partido.localeCompare(b.partido));
}

/** Los cantones de la provincia con sus vocales y su geometría. */
function cantonesVocales(provK) {
  const feats = ((DATOS.geo.cantones || {}).features || []).filter(x => x.__provK === provK);
  return feats.map(f => {
    const ps = parroquiasVocales(provK, f.__key);
    return { feature: f, key: f.__key, nombre: f.__nombre, parroquias: ps.length,
             total: ps.reduce((a, p) => a + (p.escanos || 0), 0),
             siete: ps.filter(p => p.escanos === 7).length };
  }).sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre));
}

/** Qué falta por elegir para tener un distrito completo, o '' si ya está. */
function faltaDistritoVoc() {
  const o = VOC.origen;
  if (!o.provK) return 'provincia';
  if (!o.cantK) return 'canton';
  if (!parroquiaActivaVoc()) return 'parroquia';
  return '';
}

const VOC_NIVEL_TXT = { provincia: 'una provincia', canton: 'un cantón', parroquia: 'una parroquia rural' };

function nEscVoc(n) {
  return n != null ? `${fmtNum(n)} ${n === 1 ? 'vocal' : 'vocales'}` : 'Vocales por confirmar';
}


/* ============================================================================
   ENTRADA
   ========================================================================== */

/** La llama activarSeccion() al abrir la pestaña. */
async function abrirVocales() {
  const o = VOC.origen;
  await Promise.all([
    cargarVocales2023(),
    (typeof cargarRecintos === 'function') ? cargarRecintos() : null,
    (typeof cargarParroquias === 'function' && !TERRITORIO.parroquiasPorCant.size)
      ? cargarParroquias() : null
  ].filter(Boolean));
  indexarVocales2023();
  if (!VOC.montado) {
    const a = (typeof alcanceClaves === 'function') ? alcanceClaves() : null;
    if (a) { o.provK = a.provK; o.cantK = a.cantK || ''; }
  }
  /* Solo la PRIMERA vez se parte del territorio que se miraba en las otras
     secciones (y, si en el histórico había una parroquia rural, de esa).
     Después Vocales-Escaños conserva el suyo: las demás secciones no lo
     cambian y esta nunca cambia el de ellas (concejales queda como esté). */
  const f = (!VOC.montado && typeof SEC !== 'undefined' && SEC.filtros) ? SEC.filtros.historico : null;
  let otroTerritorio = false;
  if (f && f.provK && (f.provK !== o.provK || f.cantK !== o.cantK)) {
    VOC.tocado = {};
    o.provK = f.provK;
    o.cantK = f.cantK || '';
    o.clave = '';
    otroTerritorio = true;
  }
  if (f && f.parrK && o.cantK && f.cantK === o.cantK && o.clave !== f.parrK &&
      parroquiasVocales(o.provK, o.cantK).some(p => p.clave === f.parrK)) {
    o.clave = f.parrK;
    VOC.tocado = {};
    otroTerritorio = true;
  }
  if (VOC.montado && document.getElementById('v-marco')) {
    if (otroTerritorio) { alCambiarOrigenVoc(); return; }
    construirPanelVocales();
    renderVocales();
    if (VOC.mapa) setTimeout(() => { try { VOC.mapa.map.invalidateSize(); } catch (e) { /* sin mapa */ } }, 30);
    return;
  }
  ajustarSeleccionVoc();
  recalcularParticipacionVoc();
  construirPanelVocales();
  renderVocales();
}

/** La parroquia elegida tiene que ser del cantón; si el cantón tiene una sola
    parroquia rural, se elige sola. */
function ajustarSeleccionVoc() {
  const o = VOC.origen;
  if (!o.provK || !o.cantK) { o.clave = ''; return; }
  const ps = parroquiasVocales(o.provK, o.cantK);
  if (o.clave && !ps.some(p => p.clave === o.clave)) o.clave = '';
  if (!o.clave && ps.length === 1) o.clave = ps[0].clave;
}

/** Cambia la parroquia (desde el panel, el mapa o la lista del mapa). */
function seleccionarParroquiaVoc(clave) {
  const o = VOC.origen;
  if (o.clave === clave) return;
  o.clave = clave || '';
  /* Otra parroquia, otro padrón: la participación vuelve a salir de cero. */
  VOC.tocado = {};
  alCambiarOrigenVoc();
}

/** Sube de nivel desde la ruta de la cabecera o el botón del mapa. */
function irANivelVoc(nivel) {
  const o = VOC.origen;
  if (nivel === 'pais') { o.provK = ''; o.cantK = ''; o.clave = ''; }
  else if (nivel === 'provincia') { o.cantK = ''; o.clave = ''; }
  else if (nivel === 'canton') { o.clave = ''; }
  VOC.tocado = {};
  alCambiarOrigenVoc();
}

/** Cambió algo del distrito: se rehace la sección y, con la parroquia
    elegida, el simulador se carga con sus listas inscritas. */
function alCambiarOrigenVoc() {
  ajustarSeleccionVoc();
  recalcularParticipacionVoc();
  construirPanelVocales();
  if (pintarMapaVoc() === 'delegado') return;
  pintarParticipacionVoc();
  refrescarPreinscritasVoc();
  if (VOC.montado) {
    if (faltaDistritoVoc()) retirarSimuladorVoc(textoEsperaVoc()); else simularVocales(true);
  }
  actualizarCabeceraVocales();
}


/* ============================================================================
   PARTICIPACIÓN
   Electores: el padrón 2027 de la parroquia. Ausentismo, nulos y blancos de
   partida: los de VOCALES 2023 en esa parroquia (ausentes = padrón menos
   quienes votaron entonces; nulos y blancos sobre los votos emitidos).
   ========================================================================== */

function recalcularParticipacionVoc(forzar) {
  const p = parroquiaActivaVoc();
  const P = VOC.part;
  const t = forzar ? {} : VOC.tocado;
  if (forzar) VOC.tocado = {};
  if (!t.electores) P.electores = p ? (p.electores || 0) : 0;
  const rec = p ? p.rec : null;
  /* La tasa de ausentismo se mide sobre el padrón real de la parroquia, aunque
     se haya escrito otro número de electores. */
  const E = (p && p.electores) || P.electores;
  VOC.sinReferencia = !rec;
  if (!rec || !E) {
    if (!t.ausentismo) P.ausentismo = 0;
    if (!t.nulos) P.nulos = 0;
    if (!t.blancos) P.blancos = 0;
    return;
  }
  const emitidos = rec.validos + rec.nulos + rec.blancos;
  if (!t.ausentismo) P.ausentismo = Math.max(0, (E - emitidos) * 100 / E);
  if (!t.nulos) P.nulos = emitidos ? rec.nulos * 100 / emitidos : 0;
  if (!t.blancos) P.blancos = emitidos ? rec.blancos * 100 / emitidos : 0;
}

/** La cuenta completa, tal como se muestra (misma aritmética que concejales). */
function cuentaParticipacionVoc() {
  const p = VOC.part;
  const E = Math.max(0, Math.round(p.electores) || 0);
  const pct = (x) => Math.max(0, Number(x) || 0);
  const pa = Math.min(100, pct(p.ausentismo));
  const pn = pct(p.nulos), pb = pct(p.blancos);
  const ausentes = Math.round(E * pa / 100);
  const emitidos = E - ausentes;
  const nulos = Math.round(emitidos * pn / 100);
  const blancos = Math.round(emitidos * pb / 100);
  const validos = emitidos - nulos - blancos;
  const pv = 100 - pn - pb;
  const pp = 100 - pa;
  return { E, pa, pn, pb, pv, pp, ausentes, emitidos, nulos, blancos, validos,
           valido: pv >= 0 && E > 0 && emitidos >= 0 };
}


/* ============================================================================
   PANEL LATERAL · por pasos
   ========================================================================== */

function construirPanelVocales() {
  const cont = document.getElementById('filtros-vocales');
  if (!cont) return;
  const o = VOC.origen;
  const alTerritorio = () => { VOC.tocado = {}; o.clave = ''; alCambiarOrigenVoc(); };
  const terr = selectoresTerritorio(o, alTerritorio, 'v', { sinParroquia: true });
  const ps = (o.provK && o.cantK) ? parroquiasVocales(o.provK, o.cantK) : [];
  const canton = o.cantK ? ambitoTexto({ provK: o.provK, cantK: o.cantK }) : '';
  const act = parroquiaActivaVoc();

  cont.innerHTML = `
    <section class="bloque">
      <h2 class="bloque-tit"><i class="ix">01</i> Territorio</h2>
      <p class="bloque-ayuda">Elige la provincia y el cantón. Después aparecen sus parroquias
        rurales: cada una elige su propia junta parroquial.</p>
      ${terr.html}
    </section>
    ${o.cantK ? `<section class="bloque">
      <h2 class="bloque-tit"><i class="ix">02</i> Parroquia rural</h2>
      <p class="bloque-ayuda">${ps.length
        ? `${escaparHTML(canton)} tiene ${fmtNum(ps.length)} ${ps.length === 1 ? 'parroquia rural' : 'parroquias rurales'}
           con listas inscritas para vocales en ${VOC_ANIO_SIM}.${act ? '' : ' <b>Elige una para simularla.</b>'}`
        : `${escaparHTML(canton)} no tiene parroquias rurales con listas inscritas para vocales en ${VOC_ANIO_SIM}.`}</p>
      ${ps.length ? `<div class="campo">
        <label for="v-parr">Parroquia</label>
        <div class="select-wrap"><select id="v-parr">
          <option value="">Elige una parroquia</option>
          ${ps.map(p => `<option value="${escaparHTML(p.clave)}" ${p.clave === o.clave ? 'selected' : ''}>${escaparHTML(p.nombre)}</option>`).join('')}
        </select></div>
        ${act ? `<small class="campo-nota">${nEscVoc(act.escanos)}${act.electores ? ` · ${fmtNum(act.electores)} electores` : ''}
          · ${fmtNum(act.listas)} ${act.listas === 1 ? 'lista inscrita' : 'listas inscritas'}</small>` : ''}
      </div>` : ''}
    </section>` : ''}`;

  terr.cablear();
  const sel = cont.querySelector('#v-parr');
  if (sel) sel.onchange = () => seleccionarParroquiaVoc(sel.value);
}

/** Abre o cierra el panel con las listas y los candidatos inscritos. */
function alternarPreinscritasVoc(btn) {
  const panel = document.getElementById('v-preinscritas');
  if (!panel) return;
  const abrir = panel.hidden;
  if (abrir) panel.innerHTML = htmlPreinscritasVoc();
  panel.hidden = !abrir;
  VOC.prePanelAbierto = abrir;
  btn.setAttribute('aria-expanded', abrir ? 'true' : 'false');
  btn.textContent = abrir ? 'Ocultar listas preinscritas' : 'Ver listas preinscritas';
}

function refrescarPreinscritasVoc() {
  const btn = document.getElementById('v-ver-pre');
  const panel = document.getElementById('v-preinscritas');
  if (btn && panel && VOC.prePanelAbierto) {
    panel.innerHTML = htmlPreinscritasVoc();
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    btn.textContent = 'Ocultar listas preinscritas';
  }
}

/** El registro de preinscritos de la parroquia, tal como está. */
function htmlPreinscritasVoc() {
  const o = VOC.origen;
  const falta = faltaDistritoVoc();
  if (falta) return `<p class="pre-vacio">Elige ${VOC_NIVEL_TXT[falta]} para ver sus listas inscritas.</p>`;
  const p = parroquiaActivaVoc();
  const listas = listasVocales(o.provK, o.cantK, p.clave);
  const canton = ambitoTexto({ provK: o.provK, cantK: o.cantK });
  if (!listas.length) {
    return `<p class="pre-vacio">No hay listas inscritas para vocales en ${escaparHTML(p.nombre)}.</p>`;
  }
  const nCand = listas.reduce((a, x) => a + x.candidatos.length, 0);
  return `
    <p class="pre-cab"><span class="asig-circ-nom">${escaparHTML(p.nombre)}</span> · ${escaparHTML(canton)}
      <span class="pre-dig">${escaparHTML(VOC_ETIQUETA)}</span></p>
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
        </ol>` : ''}
      </li>`).join('')}
    </ol>`;
}


/* ============================================================================
   EL PUENTE CON EL SIMULADOR
   ========================================================================== */

const VOC_ESPERA_TXT = 'Elige la provincia y el cantón —en el panel de la izquierda o en el ' +
  'mapa— y después la parroquia rural. El simulador se llena con sus listas y sus candidatos ' +
  'inscritos para vocales.';

function textoEsperaVoc() {
  const f = faltaDistritoVoc(), o = VOC.origen;
  if (!f) return '';
  if (f === 'parroquia') {
    const canton = ambitoTexto({ provK: o.provK, cantK: o.cantK });
    return parroquiasVocales(o.provK, o.cantK).length
      ? `Elige una parroquia rural de ${canton} —en el panel de la izquierda o en el mapa— para cargar ` +
        'sus listas inscritas en el simulador.'
      : `${canton} no tiene parroquias rurales con listas inscritas para vocales: elige otro cantón.`;
  }
  return VOC_ESPERA_TXT;
}

function mostrarMarcoVoc(ver, texto) {
  const marco = document.getElementById('v-marco');
  const espera = document.getElementById('v-espera');
  const txt = document.getElementById('v-espera-txt');
  if (marco) marco.hidden = !ver;
  if (espera) espera.hidden = !!ver;
  if (txt && !ver) txt.textContent = texto || VOC_ESPERA_TXT;
}

function ponerEnSimuladorVoc(escenario) {
  VOC.escanosPrueba = null;
  try {
    localStorage.setItem(VOC_CLAVE_BORRADOR, JSON.stringify({
      trabajo: escenario, base: escenario, esEjemplo: false,
      ui: { decimales: 0, rangoSliders: 0.5 }
    }));
  } catch (e) {
    if (typeof avisar === 'function') avisar('El navegador no deja guardar datos; escribe las listas en el simulador');
    return false;
  }
  const marco = document.getElementById('v-marco');
  if (marco) {
    marco.src = VOC_PAGINA + '?v=' + CONFIG.version + '&t=' + Date.now();
    mostrarMarcoVoc(true);
  }
  return true;
}

function retirarSimuladorVoc(texto) {
  VOC.cargado = null;
  VOC.escanosPrueba = null;
  const marco = document.getElementById('v-marco');
  if (marco && marco.getAttribute('src') && marco.getAttribute('src') !== 'about:blank') marco.src = 'about:blank';
  mostrarMarcoVoc(false, texto);
}

function enviarParticipacionVoc() {
  const marco = document.getElementById('v-marco');
  if (!marco || marco.hidden || !marco.contentWindow || faltaDistritoVoc()) return;
  const c = cuentaParticipacionVoc();
  if (!c.valido || !(c.validos > 0)) return;
  try {
    marco.contentWindow.postMessage({
      tipo: 'tablero/participacion', validos: c.validos, blancos: c.blancos, nulos: c.nulos
    }, destinoMensajes());
  } catch (e) {
    /* El marco se está recargando: al arrancar pide la cuenta él mismo. */
  }
}

function escucharAlSimuladorVoc() {
  if (VOC.escuchando) return;
  VOC.escuchando = true;
  window.addEventListener('message', (e) => {
    const marco = document.getElementById('v-marco');
    if (!marco || e.source !== marco.contentWindow) return;
    const destino = destinoMensajes();
    if (destino !== '*' && e.origin !== destino) return;
    const d = e.data;
    if (d && typeof d === 'object' && d.tipo === 'simulador/listo') enviarParticipacionVoc();
    if (d && typeof d === 'object' && d.tipo === 'simulador/escanos') {
      const n = Math.round(Number(d.escanos)), b = Math.round(Number(d.base));
      VOC.escanosPrueba = n > 0 && b > 0 && n !== b ? n : null;
      actualizarCabeceraVocales();
    }
  });
}

/**
 * Carga en el simulador las listas inscritas de la parroquia, con sus
 * candidatos y sin votos: se escribe el porcentaje de cada una y el reparto
 * sale solo. Se llama sola al completar o cambiar el distrito.
 */
function simularVocales(callado) {
  const o = VOC.origen;
  if (faltaDistritoVoc()) { retirarSimuladorVoc(textoEsperaVoc()); return; }
  const p = parroquiaActivaVoc();
  const reales = listasVocales(o.provK, o.cantK, p.clave);
  const c = cuentaParticipacionVoc();
  const listas = reales.length
    ? reales.map((x, i) => ({
        id: 'p' + i,
        nombre: (x.lista ? 'Lista ' + x.lista + ' · ' : '') + tituloCase(x.partido),
        votos: 0, color: i,
        lista: x.lista, partido: tituloCase(x.partido),
        candidatos: x.candidatos.map(k => ({ orden: k.orden, nombre: tituloCase(k.nombre), suplente: tituloCase(k.suplente) }))
      }))
    : [{ id: 'n1', nombre: 'Lista 1', votos: 0, color: 0 },
       { id: 'n2', nombre: 'Lista 2', votos: 0, color: 1 },
       { id: 'n3', nombre: 'Lista 3', votos: 0, color: 2 }];
  const canton = ambitoTexto({ provK: o.provK, cantK: o.cantK });
  const escenario = {
    listas,
    escanos: p.escanos || 5,
    metodo: 'dhondt', umbral: 0, baseModo: 'listas',
    blancos: c.blancos, nulos: c.nulos,
    desempate: 'mayor_votos', participante: 'lista',
    validosDisponibles: Math.max(0, c.validos),
    origen: {
      ambito: canton,
      provincia: ambitoTexto({ provK: o.provK }),
      canton,
      /* Nombre LITERAL de la parroquia (base del cliente o registro 2027). */
      parroquia: p.nombre,
      dignidad: VOC_ETIQUETA,
      circunscripcion: '',
      fuente: 'Registro de preinscritos',
      escanosDe: p.fuente === 'inscritos' ? 'inscritos' : 'tabla2023',
      escanosParejo: p.parejo !== false,
      anioParticipacion: VOC.sinReferencia ? null : VOC_ANIO,
      notaFuente: VOC.sinReferencia
        ? 'Esta parroquia no tiene resultados de vocales 2023 en la base: la participación de partida es la que se escribió en el tablero.'
        : 'Participación de partida: resultados de vocales 2023 de la parroquia (' + (VOCD.fuente || 'base del cliente') + ').'
    }
  };
  if (!ponerEnSimuladorVoc(escenario)) return;
  const nCand = reales.reduce((a, x) => a + x.candidatos.length, 0);
  VOC.cargado = { parroquia: p.nombre, listas: reales.length, candidatos: nCand, escanos: escenario.escanos, fuente: p.fuente };
  actualizarCabeceraVocales();
  if (callado || typeof avisar !== 'function') return;
  avisar(reales.length
    ? `${fmtNum(reales.length)} listas inscritas` + (nCand ? ` y ${fmtNum(nCand)} candidatos` : '') + ': pon los porcentajes'
    : 'No hay listas inscritas para esta parroquia: se dejan listas en blanco');
}


/* ============================================================================
   VISTA
   ========================================================================== */

function renderVocales() {
  const vista = document.getElementById('vista-vocales');
  if (!vista) return;
  temaSeccion(VOC_DIG);
  if (VOC.montado && document.getElementById('v-marco')) {
    actualizarCabeceraVocales();
    return;
  }
  vista.innerHTML = `
    <section class="tarjeta sec-cabecera asig-cab">
      <h2 class="tarjeta-tit">Simulador de Escaños – Vocales Parroquiales · método D'Hondt</h2>
      <nav class="asig-ruta" id="v-ruta" aria-label="Distrito que se analiza"></nav>
      <p class="tarjeta-sub" id="v-sub">—</p>
    </section>

    <section class="tarjeta sec-tarjeta" id="v-mapa-tarjeta"></section>

    <section class="tarjeta sec-tarjeta" id="v-participacion"></section>

    <section class="tarjeta sec-tarjeta" id="v-listas">
      <div class="pre-barra">
        <div>
          <h3 class="pre-tit">Listas preinscritas</h3>
          <p class="pre-sub">Las organizaciones y los candidatos inscritos para vocales en la parroquia elegida.</p>
        </div>
        <button class="btn btn-sec" type="button" id="v-ver-pre"
                aria-expanded="false" aria-controls="v-preinscritas">Ver listas preinscritas</button>
      </div>
      <div class="pre-panel" id="v-preinscritas" hidden></div>
    </section>

    <section class="tarjeta asig-marco-caja">
      <div class="asig-espera" id="v-espera">
        <p class="asig-espera-tit">Simulador de escaños · vocales</p>
        <p class="asig-espera-txt" id="v-espera-txt">${VOC_ESPERA_TXT}</p>
      </div>
      <!-- Sin src hasta que haya parroquia: nunca queda a la vista otra. -->
      <iframe id="v-marco" class="asig-marco" title="Simulador de escaños · vocales parroquiales" hidden></iframe>
    </section>`;

  VOC.montado = true;
  const btn = document.getElementById('v-ver-pre');
  if (btn) btn.onclick = () => alternarPreinscritasVoc(btn);
  escucharAlSimuladorVoc();
  pintarMapaVoc();
  pintarParticipacionVoc();
  if (faltaDistritoVoc()) retirarSimuladorVoc(textoEsperaVoc());
  else if (!VOC.cargado) simularVocales(true);
  actualizarCabeceraVocales();
}


/* ============================================================================
   MAPA ELECTORAL
     · Provincia: sus cantones, con cuántos vocales eligen entre todas sus
       juntas parroquiales. Un clic baja al cantón.
     · Cantón: sus parroquias; las rurales que eligen vocales van pintadas,
       cada una con su número de vocales. Un clic elige la parroquia.
   ========================================================================== */

function asegurarArmazonMapaVoc(caja) {
  if (document.getElementById('v-mapa')) return;
  soltarMapaVoc();
  caja.innerHTML = `
    <header class="tabla-cab asig-mapa-cab">
      <div>
        <h2 class="tarjeta-tit" id="v-mapa-tit">Mapa electoral</h2>
        <p class="tarjeta-sub" id="v-mapa-sub"></p>
      </div>
      <div class="asig-mapa-acc">
        <button type="button" class="btn btn-sec asig-volver" id="v-mapa-volver" hidden></button>
        <span class="res-sello" id="v-mapa-sello"></span>
      </div>
    </header>
    <div class="prov-fila asig-mapa-fila">
      <div class="prov-mapa" id="v-mapa"></div>
      <div class="prov-tarjetas" id="v-mapa-panel"></div>
    </div>
    <div class="asig-ficha" id="v-mapa-ficha" hidden></div>`;
  document.getElementById('v-mapa-volver').onclick = () => irANivelVoc('provincia');
}

function pintarMapaVoc() {
  const caja = document.getElementById('v-mapa-tarjeta');
  if (!caja) return;
  const o = VOC.origen;
  if (!o.provK) {
    soltarMapaVoc();
    caja.innerHTML = `
      <header class="tabla-cab"><div>
        <h2 class="tarjeta-tit">Mapa electoral</h2>
        <p class="tarjeta-sub">Cuántos vocales elige cada cantón y, dentro de cada cantón, cuántos
          elige cada parroquia rural.</p>
      </div></header>
      <p class="sec-vacio">Elige una provincia en el panel de la izquierda.</p>`;
    return;
  }
  const filas = cantonesVocales(o.provK);
  if (!o.cantK && filas.length === 1) {
    o.cantK = filas[0].key;
    alCambiarOrigenVoc();
    return 'delegado';
  }
  asegurarArmazonMapaVoc(caja);
  if (o.cantK) pintarVistaCantonVoc(filas);
  else pintarVistaProvinciaVoc(filas);
}

function soltarMapaVoc() {
  if (VOC.mapa) {
    try { VOC.mapa.map.remove(); } catch (e) { /* ya no estaba */ }
    VOC.mapa = null;
  }
}

function asegurarMapaVoc() {
  const cont = document.getElementById('v-mapa');
  if (!cont || typeof L === 'undefined') return null;
  const o = VOC.origen;
  if (VOC.mapa && (VOC.mapa.provK !== o.provK || VOC.mapa.contenedor !== cont)) soltarMapaVoc();
  if (!VOC.mapa) {
    const map = L.map('v-mapa', {
      zoomControl: true, attributionControl: true, minZoom: 5, maxZoom: 15,
      zoomSnap: .25, zoomDelta: .5,
      scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false
    }).setView(CONFIG.vistaEcuador.centro, CONFIG.vistaEcuador.zoom);
    cont.style.background = CONFIG.mapaBase.color;
    if (map.attributionControl) map.attributionControl.addAttribution(CONFIG.mapaBase.credito);
    VOC.mapa = { map, provK: o.provK, contenedor: cont, capa: null, pines: null, canton: null };
  }
  return VOC.mapa;
}

function encuadrarVoc(Mv, limites, margen) {
  setTimeout(() => {
    try {
      Mv.map.invalidateSize();
      if (limites && limites.isValid()) Mv.map.fitBounds(limites, { padding: [margen || 22, margen || 22], animate: false });
    } catch (e) { /* el marco aún no se ve */ }
  }, 60);
}

function quitarCapasCantonVoc(Mv) {
  if (Mv.canton) {
    ['capa', 'bordes', 'halo', 'resalte', 'pines'].forEach(k => {
      if (Mv.canton[k]) { try { Mv.map.removeLayer(Mv.canton[k]); } catch (e) { /* ya no estaba */ } }
    });
    Mv.canton = null;
  }
}

/* ── Nivel provincia ─────────────────────────────────────────────────────── */

function pintarVistaProvinciaVoc(filas) {
  const o = VOC.origen;
  const tit = document.getElementById('v-mapa-tit');
  const sub = document.getElementById('v-mapa-sub');
  const sello = document.getElementById('v-mapa-sello');
  const volver = document.getElementById('v-mapa-volver');
  const ficha = document.getElementById('v-mapa-ficha');
  if (tit) tit.textContent = 'Vocales de juntas parroquiales · ' + ambitoTexto({ provK: o.provK });
  if (sub) sub.textContent = `Cuántos vocales eligen en ${VOC_ANIO_SIM} las juntas parroquiales rurales de cada cantón. ` +
    'Haz clic en un cantón para ver sus parroquias y simular su asignación.';
  if (sello) sello.textContent = `${fmtNum(filas.length)} ${filas.length === 1 ? 'cantón' : 'cantones'}`;
  if (volver) volver.hidden = true;
  if (ficha) { ficha.hidden = true; ficha.innerHTML = ''; }

  const tot = filas.reduce((a, x) => a + x.total, 0);
  const nParr = filas.reduce((a, x) => a + x.parroquias, 0);
  const siete = filas.reduce((a, x) => a + x.siete, 0);
  const conVoc = filas.filter(x => x.parroquias > 0).length;
  const tarjeta = (et, val, pie, clase) => `
    <div class="prov-tarjeta${clase ? ' ' + clase : ''}">
      <p class="prov-et">${et}</p>
      <p class="prov-val">${val}</p>
      <p class="prov-pie">${pie}</p>
    </div>`;
  const panel = document.getElementById('v-mapa-panel');
  if (panel) {
    panel.innerHTML = `
      ${tarjeta('Vocales de la provincia', fmtNum(tot), `Se eligen en ${VOC_ANIO_SIM} en sus juntas parroquiales rurales`, 'prov-total')}
      <div class="prov-par">
        ${tarjeta('Parroquias rurales', fmtNum(nParr), 'Con listas inscritas')}
        ${tarjeta('Juntas de 7', fmtNum(siete), siete ? 'Parroquias de más de 50.000 habitantes' : 'Todas eligen 5 vocales')}
      </div>
      ${tarjeta('Cantones', fmtNum(filas.length), conVoc === filas.length
        ? 'Todos tienen parroquias rurales' : `${fmtNum(conVoc)} con parroquias rurales que eligen vocales`, 'prov-ancha')}
      <p class="prov-leyenda">
        <span><i style="background:${VOC_COLOR}"></i>Vocales</span>
        <span class="prov-pista">El número de cada cantón es la suma de los vocales de sus juntas
          parroquiales rurales; cada junta elige 5, o 7 si la parroquia supera los 50.000 habitantes.</span>
      </p>`;
  }
  dibujarMapaProvinciaVoc(filas);
}

function dibujarMapaProvinciaVoc(filas) {
  if (!filas.length) return;
  const Mv = asegurarMapaVoc();
  if (!Mv) return;
  const o = VOC.origen;
  quitarCapasCantonVoc(Mv);
  const max = Math.max(1, ...filas.map(x => x.total));
  if (!Mv.capa) {
    Mv.capa = L.geoJSON({ type: 'FeatureCollection', features: filas.map(x => x.feature) }, {
      style: () => ({ fill: true, stroke: true, fillOpacity: .9, color: '#FFFFFF', weight: .9, opacity: .95 })
    });
    Mv.pines = L.layerGroup();
  }
  if (!Mv.map.hasLayer(Mv.capa)) Mv.capa.addTo(Mv.map);
  if (!Mv.map.hasLayer(Mv.pines)) Mv.pines.addTo(Mv.map);
  const porClave = new Map(filas.map(x => [x.key, x]));
  const globo = (x) => `
    <div class="tt"><div class="tt-titulo">${escaparHTML(tituloCase(x.nombre))}</div>
      <div class="tt-sub">${escaparHTML(ambitoTexto({ provK: o.provK }))}</div>
      <div class="tt-metricas">
        <div><span>Parroquias rurales</span><b>${fmtNum(x.parroquias)}</b></div>
        <div><span>Vocales</span><b>${fmtNum(x.total)}</b></div>
      </div>
      <div class="tt-pie"><span class="tt-chip">${x.parroquias ? 'Clic para ver sus parroquias' : 'Sin parroquias rurales con listas'}</span></div></div>`;
  const elegir = (clave) => {
    if (o.cantK === clave) return;
    o.cantK = clave;
    o.clave = '';
    VOC.tocado = {};
    alCambiarOrigenVoc();
  };
  Mv.capa.eachLayer(l => {
    const x = porClave.get(l.feature.__key);
    if (!x) return;
    const t = max > 0 ? x.total / max : 0;
    l.setStyle({ fillColor: x.total ? colorDegradado(VOC_RAMPA, .18 + t * .82) : CONFIG.paleta.sinDatos,
                 color: '#FFFFFF', weight: .9, fillOpacity: .9 });
    l.unbindTooltip();
    l.bindTooltip(() => globo(x), { sticky: true, direction: 'top', className: 'tt-wrap', opacity: 1 });
    l.off('mouseover').off('mouseout').off('click');
    l.on('mouseover', e => e.target.setStyle({ weight: 2.2, color: '#141413' }));
    l.on('mouseout', e => e.target.setStyle({ weight: .9, color: '#FFFFFF' }));
    l.on('click', () => elegir(x.key));
  });
  Mv.pines.clearLayers();
  filas.forEach(x => {
    const capa = Mv.capa.getLayers().find(l => l.feature.__key === x.key);
    if (!capa) return;
    const n = x.total;
    const d = n ? Math.round(26 + 34 * Math.sqrt(n / max)) : 22;
    const html = `<div class="esc-pin${n ? '' : ' vacio'}"
      style="--d:${d}px;--pu:100%;--cu:${n ? VOC_COLOR : '#B9B5AC'};--cr:${n ? VOC_COLOR : '#B9B5AC'}"
      ><b>${fmtNum(n)}</b></div>`;
    const pin = L.marker(capa.getBounds().getCenter(), {
      icon: L.divIcon({ html, className: 'esc-pin-caja', iconSize: [d, d], iconAnchor: [d / 2, d / 2] }),
      interactive: true, keyboard: false
    });
    pin.bindTooltip(() => globo(x), { sticky: true, direction: 'top', className: 'tt-wrap', opacity: 1 });
    pin.on('click', () => elegir(x.key));
    pin.addTo(Mv.pines);
  });
  encuadrarVoc(Mv, Mv.capa.getBounds(), 22);
}

/* ── Nivel cantón: sus parroquias ───────────────────────────────────────── */

function pintarVistaCantonVoc(filas) {
  const o = VOC.origen;
  const parrs = TERRITORIO.parroquiasPorCant.get(o.provK + '|' + o.cantK) || [];
  const ps = parroquiasVocales(o.provK, o.cantK);
  const sel = parroquiaActivaVoc();
  const canton = ambitoTexto({ provK: o.provK, cantK: o.cantK });
  const tit = document.getElementById('v-mapa-tit');
  const sub = document.getElementById('v-mapa-sub');
  const sello = document.getElementById('v-mapa-sello');
  const volver = document.getElementById('v-mapa-volver');
  if (tit) tit.textContent = 'Mapa electoral · ' + canton;
  if (sub) sub.textContent = ps.length
    ? `Las parroquias de ${canton}: cada parroquia rural elige su junta parroquial. Haz clic en una para simularla.`
    : `${canton} no tiene parroquias rurales con listas inscritas para vocales en ${VOC_ANIO_SIM}.`;
  if (sello) sello.textContent = `${fmtNum(ps.length)} ${ps.length === 1 ? 'parroquia rural' : 'parroquias rurales'} · ` +
    nEscVoc(ps.reduce((a, p) => a + (p.escanos || 0), 0));
  if (volver) { volver.hidden = filas.length <= 1; volver.textContent = '← ' + ambitoTexto({ provK: o.provK }); }
  pintarPanelCantonVoc(ps, sel);
  pintarFichaCantonVoc(ps, sel);
  dibujarMapaCantonVoc(parrs, ps, sel);
}

function pintarPanelCantonVoc(ps, sel) {
  const panel = document.getElementById('v-mapa-panel');
  if (!panel) return;
  const total = ps.reduce((a, p) => a + (p.escanos || 0), 0);
  const fila = (p) => `
    <button type="button" class="asig-dist${sel && sel.clave === p.clave ? ' activo' : ''}" data-parr="${escaparHTML(p.clave)}"
            style="--c:${sel && sel.clave === p.clave ? VOC_COLOR_FUERTE : VOC_COLOR}" aria-pressed="${!!(sel && sel.clave === p.clave)}">
      <i class="asig-dist-color" aria-hidden="true"></i>
      <span class="asig-dist-txt">
        <span class="asig-dist-nom asig-circ-nom">${escaparHTML(p.nombre)}</span>
        <span class="asig-dist-det">${p.electores ? fmtNum(p.electores) + ' electores · ' : ''}${fmtNum(p.listas)} ${p.listas === 1 ? 'lista' : 'listas'}</span>
      </span>
      <b class="asig-dist-esc">${nEscVoc(p.escanos)}</b>
    </button>`;
  panel.innerHTML = `
    ${ps.length ? `<div class="asig-grupo">
      <p class="asig-grupo-tit">${escaparHTML(VOC_ETIQUETA)}<span>${nEscVoc(total)}</span></p>
      <div class="voc-lista">${ps.map(fila).join('')}</div>
    </div>` : '<p class="sec-vacio">Sin parroquias rurales con listas inscritas en este cantón.</p>'}
    <div class="asig-leyenda">
      <p class="asig-leyenda-tit">Cómo leer el mapa</p>
      <p><i class="asig-ley-linea asig-ley-linea--circ"></i>Límite del cantón y de cada parroquia rural</p>
      <p><i class="asig-ley-linea asig-ley-linea--parr"></i>Límite entre parroquias urbanas</p>
      <p class="asig-leyenda-fuente">Parroquias: capa del CNE del proyecto. Vocales: registro de inscripción
        ${VOC_ANIO_SIM} (cada lista inscribe tantos candidatos principales como vocales se eligen).</p>
    </div>`;
  panel.querySelectorAll('[data-parr]').forEach(b => {
    b.onclick = () => seleccionarParroquiaVoc(b.dataset.parr);
  });
  const activa = panel.querySelector('.asig-dist.activo');
  if (activa && activa.scrollIntoView) activa.scrollIntoView({ block: 'nearest' });
}

/** La ficha bajo el mapa: la parroquia elegida, con su nombre exacto, o el
    resumen del cantón si todavía no hay ninguna. */
function pintarFichaCantonVoc(ps, sel) {
  const ficha = document.getElementById('v-mapa-ficha');
  if (!ficha) return;
  const o = VOC.origen;
  const canton = ambitoTexto({ provK: o.provK, cantK: o.cantK });
  const provincia = ambitoTexto({ provK: o.provK });
  ficha.hidden = false;
  if (!sel) {
    const total = ps.reduce((a, p) => a + (p.escanos || 0), 0);
    ficha.innerHTML = `
      <div class="asig-ficha-cab" style="--c:#45433D">
        <p class="asig-ficha-et">${escaparHTML(canton)} · ${escaparHTML(provincia)}</p>
        <p class="asig-ficha-res">${ps.length ? `<b>${nEscVoc(total)}</b> en ${fmtNum(ps.length)}
          ${ps.length === 1 ? 'junta parroquial' : 'juntas parroquiales'}.` : 'Sin parroquias rurales con listas inscritas para vocales.'}</p>
        <p class="asig-ficha-sub">${ps.length ? 'Elige una parroquia en el mapa, en el panel de la derecha o en el de la izquierda.' : 'Elige otro cantón.'}</p>
      </div>`;
    return;
  }
  const r = sel.rec;
  const notas = [];
  if (sel.fuenteNombre === 'registro') {
    notas.push('Esta parroquia no figura en la base de 2023: el nombre es el del registro de inscripción 2027 y no hay resultados de 2023 para la participación de partida.');
  }
  if (r && sel.escanos != null && r.vocales !== sel.escanos) {
    notas.push(`En 2023 esta junta eligió ${nEscVoc(r.vocales)}; el registro ${VOC_ANIO_SIM} trae ${fmtNum(sel.escanos)} candidatos principales por lista, así que se simulan ${nEscVoc(sel.escanos)}.`);
  }
  if (sel.fuente === 'tabla2023') notas.push('El registro no trae candidatos para esta parroquia: se usan los vocales que eligió en 2023.');
  if (!sel.parejo) notas.push('No todas las listas inscribieron el mismo número de candidatos: se toma el mayor.');
  if (!sel.geoKey) notas.push('Esta parroquia no tiene polígono en la capa parroquial: se puede simular, pero no se dibuja en el mapa y su padrón hay que escribirlo.');
  ficha.innerHTML = `
    <div class="asig-ficha-cab" style="--c:${VOC_COLOR_FUERTE}">
      <p class="asig-ficha-et">Parroquia rural seleccionada</p>
      <h3 class="asig-ficha-nom asig-circ-nom">${escaparHTML(sel.nombre)}</h3>
      <p class="asig-ficha-sub">${escaparHTML(VOC_ETIQUETA)} · ${escaparHTML(r ? r.canton : canton)} · ${escaparHTML(r ? r.provincia : provincia)}</p>
    </div>
    <dl class="asig-ficha-datos">
      <div><dt>Vocales ${VOC_ANIO_SIM}</dt><dd>${sel.escanos != null ? fmtNum(sel.escanos) : '—'}</dd></div>
      <div><dt>Electores</dt><dd>${sel.electores ? fmtNum(sel.electores) : '—'}</dd></div>
      <div><dt>Listas inscritas</dt><dd>${fmtNum(sel.listas)}</dd></div>
      <div><dt>Votos válidos ${VOC_ANIO}</dt><dd>${r ? fmtNum(r.validos) : '—'}</dd></div>
      <div><dt>Organizaciones ${VOC_ANIO}</dt><dd>${r ? fmtNum(r.listas) : '—'}</dd></div>
      <div><dt>Vocales ${VOC_ANIO}</dt><dd>${r ? fmtNum(r.vocales) : '—'}</dd></div>
    </dl>
    ${notas.length ? `<ul class="asig-ficha-notas">${notas.map(n => `<li>${escaparHTML(n)}</li>`).join('')}</ul>` : ''}`;
}

/** Dibuja (o repinta) el cantón: parroquias, límites y marcadores. */
function dibujarMapaCantonVoc(parrs, ps, sel) {
  const Mv = asegurarMapaVoc();
  if (!Mv) return;
  const o = VOC.origen;
  const clave = o.provK + '|' + o.cantK;
  if (Mv.capa && Mv.map.hasLayer(Mv.capa)) Mv.map.removeLayer(Mv.capa);
  if (Mv.pines && Mv.map.hasLayer(Mv.pines)) Mv.map.removeLayer(Mv.pines);
  if (Mv.canton && Mv.canton.clave !== clave) quitarCapasCantonVoc(Mv);
  if (!parrs.length) return;
  if (!Mv.canton) {
    const capa = L.geoJSON({ type: 'FeatureCollection', features: parrs }, {
      style: () => ({ fill: true, stroke: true, color: '#FFFFFF', weight: .7, opacity: .9, fillColor: COLOR_SIN, fillOpacity: .5 })
    }).addTo(Mv.map);
    const indice = new Map(parrs.map((f, i) => [f.__key, i]));
    Mv.canton = { clave, capa, indice, tramos: tramosDe(parrs), bordes: null, halo: null, resalte: null, pines: null };
  }
  const C = Mv.canton;
  const porGeo = new Map(ps.filter(p => p.geoKey).map(p => [p.geoKey, p]));
  const selI = sel && sel.geoKey ? C.indice.get(sel.geoKey) : null;

  C.capa.eachLayer(l => {
    const f = l.feature, k = f.__key;
    const p = porGeo.get(k);
    const estado = normalizarTexto((f.properties || {}).estado || '');
    let fill = COLOR_SIN, op = .3;
    if (p) {
      const es = sel && sel.clave === p.clave;
      fill = es ? VOC_COLOR_FUERTE : VOC_COLOR;
      op = sel ? (es ? .8 : .3) : .58;
    } else if (estado === 'URBANA') {
      op = .22;
    }
    l.setStyle({ fillColor: fill, fillOpacity: op, color: '#FFFFFF', weight: .7, opacity: .9 });
    l.unbindTooltip();
    l.bindTooltip(() => `
      <div class="tt"><div class="tt-titulo">${escaparHTML(p ? p.nombre : tituloCase(f.__nombre))}</div>
        <div class="tt-sub">Parroquia ${estado === 'URBANA' ? 'urbana' : estado === 'RURAL' ? 'rural' : ''}</div>
        ${p ? `<div class="tt-metricas">
          <div><span>Vocales</span><b>${p.escanos != null ? fmtNum(p.escanos) : '—'}</b></div>
          <div><span>Electores</span><b>${p.electores ? fmtNum(p.electores) : '—'}</b></div>
          <div><span>Listas</span><b>${fmtNum(p.listas)}</b></div>
        </div>` : `<div class="tt-sub">${estado === 'URBANA' ? 'Las parroquias urbanas no eligen junta parroquial' : 'Sin listas inscritas para vocales'}</div>`}
        <div class="tt-pie"><span class="tt-chip">${p ? (sel && sel.clave === p.clave ? 'En análisis' : 'Clic para simularla') : ''}</span></div></div>`,
      { sticky: true, direction: 'top', className: 'tt-wrap', opacity: 1 });
    l.off('click');
    if (p) l.on('click', () => seleccionarParroquiaVoc(p.clave));
  });

  /* Límites: el borde del cantón y el de cada parroquia rural que elige
     vocales, en oscuro; el de la elegida, más grueso y con halo. */
  if (C.bordes) Mv.map.removeLayer(C.bordes);
  const esRural = parrs.map(f => porGeo.has(f.__key));
  const segs = [];
  C.tramos.forEach(t => {
    const exterior = t.p.length === 1;
    if (exterior || esRural[t.p[0]] || esRural[t.p[1]]) segs.push([[t.a[1], t.a[0]], [t.b[1], t.b[0]]]);
  });
  C.bordes = L.polyline(segs, { color: '#2B2A27', weight: 1.4, opacity: .8, interactive: false }).addTo(Mv.map);
  if (C.halo) { Mv.map.removeLayer(C.halo); C.halo = null; }
  if (C.resalte) { Mv.map.removeLayer(C.resalte); C.resalte = null; }
  if (selI != null) {
    const s2 = [];
    C.tramos.forEach(t => { if (t.p.includes(selI) && !(t.p.length > 1 && t.p[0] === selI && t.p[1] === selI)) s2.push([[t.a[1], t.a[0]], [t.b[1], t.b[0]]]); });
    C.halo = L.polyline(s2, { color: '#FFFFFF', weight: 7, opacity: .85, interactive: false }).addTo(Mv.map);
    C.resalte = L.polyline(s2, { color: '#0B0B0A', weight: 3.4, opacity: 1, interactive: false }).addTo(Mv.map);
  }

  /* Un marcador por parroquia rural con sus vocales. */
  if (C.pines) Mv.map.removeLayer(C.pines);
  C.pines = L.layerGroup().addTo(Mv.map);
  ps.forEach(p => {
    if (!p.geoKey) return;
    const f = parrs[C.indice.get(p.geoKey)];
    const pt = f ? puntoInterior(f) : null;
    if (!pt) return;
    const activo = sel && sel.clave === p.clave;
    const dm = activo ? 40 : 28;
    const color = activo ? VOC_COLOR_FUERTE : VOC_COLOR;
    const html = `<div class="esc-pin esc-pin--dist${activo ? ' activo' : ''}"
      style="--d:${dm}px;--pu:100%;--cu:${color};--cr:${color}"><b>${p.escanos != null ? fmtNum(p.escanos) : '—'}</b></div>`;
    const pin = L.marker([pt.lat, pt.lon], {
      icon: L.divIcon({ html, className: 'esc-pin-caja', iconSize: [dm, dm], iconAnchor: [dm / 2, dm / 2] }),
      interactive: true, keyboard: false, zIndexOffset: activo ? 500 : 0
    });
    pin.bindTooltip(`<div class="tt"><div class="tt-titulo asig-circ-nom">${escaparHTML(p.nombre)}</div>
      <div class="tt-sub">${escaparHTML(VOC_ETIQUETA)}</div>
      <div class="tt-metricas">
        <div><span>Vocales</span><b>${p.escanos != null ? fmtNum(p.escanos) : '—'}</b></div>
        <div><span>Electores</span><b>${p.electores ? fmtNum(p.electores) : '—'}</b></div>
      </div>
      <div class="tt-pie"><span class="tt-chip">${activo ? 'En análisis' : 'Clic para simular'}</span></div></div>`,
      { direction: 'top', className: 'tt-wrap', opacity: 1 });
    pin.on('click', () => seleccionarParroquiaVoc(p.clave));
    pin.addTo(C.pines);
  });

  /* Encuadre: las parroquias rurales del cantón (las urbanas son diminutas
     al lado y no eligen vocales). */
  const b = L.latLngBounds([]);
  C.capa.eachLayer(l => { if (porGeo.has(l.feature.__key)) b.extend(l.getBounds()); });
  const limites = b.isValid() ? b : C.capa.getBounds();
  if (C.encuadre !== clave) { C.encuadre = clave; encuadrarVoc(Mv, limites, 26); }
  else setTimeout(() => { try { Mv.map.invalidateSize(); } catch (e) { /* oculto */ } }, 60);
}


/* ── El bloque de participación ────────────────────────────────────────── */

function pintarParticipacionVoc() {
  const caja = document.getElementById('v-participacion');
  if (!caja) return;
  const falta = faltaDistritoVoc();
  if (falta) {
    caja.innerHTML = `<h2 class="tarjeta-tit">Participación</h2>
      <p class="sec-vacio">${falta === 'canton'
        ? 'Arriba está la provincia entera. Elige un cantón —en el mapa o en el panel— y después una parroquia rural.'
        : falta === 'parroquia' ? 'Elige la parroquia rural para partir de su padrón.'
        : `Elige ${VOC_NIVEL_TXT[falta]} en el panel de la izquierda para partir de su padrón.`}</p>`;
    return;
  }
  const p = parroquiaActivaVoc();
  const c = cuentaParticipacionVoc();
  const campo = (id, et, valor, suf, color) => `
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
        <h2 class="tarjeta-tit">Participación · <span class="asig-circ-nom">${escaparHTML(p.nombre)}</span></h2>
        <p class="tarjeta-sub">Del padrón se descuenta quien no vota, lo nulo y lo blanco.
          Lo que queda es con lo que se reparte. Escribe cualquier dato y el simulador se actualiza.
          ${VOC.sinReferencia
            ? '<b>Esta parroquia no tiene resultados de vocales 2023 en la base</b>: escribe el ausentismo, los nulos y los blancos.'
            : `Los porcentajes de partida son los de vocales ${VOC_ANIO} en esta parroquia.`}</p>
      </div>
      <div class="part-sellos">
        <span class="res-sello" title="${p.fuente === 'inscritos'
            ? 'Los que inscribió cada lista: es el número que reparte el simulador'
            : 'El registro no trae candidatos: se usan los vocales que eligió en 2023'}">${nEscVoc(p.escanos)}${p.fuente === 'tabla2023' ? ' · 2023' : ''}</span>
      </div>
    </header>

    <div class="part-rejilla">
      ${campo('vp-electores', 'Electores habilitados', c.E, '', PART_COLOR.electores)}
      ${campo('vp-aus', 'Ausentismo', c.pa.toFixed(2), '%', PART_COLOR.ausentismo)}
      <div class="part-campo part-calc" style="--part-color:${PART_COLOR.emitidos}">
        <p class="part-et">Sufragantes</p>
        <p class="part-val">${fmtNum(c.emitidos)}</p>
      </div>
      ${campo('vp-nulos', 'Nulos', c.pn.toFixed(2), '%', PART_COLOR.nulos)}
      ${campo('vp-blancos', 'Blancos', c.pb.toFixed(2), '%', PART_COLOR.blancos)}
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
      VOC.part[campoEstado] = v;
      VOC.tocado[campoEstado] = true;
      pintarParticipacionVoc();
      enviarParticipacionVoc();
      actualizarCabeceraVocales();
      const otra = document.getElementById(id);
      if (otra) { otra.focus(); otra.select(); }
    });
  };
  leer('vp-electores', 'electores');
  leer('vp-aus', 'ausentismo');
  leer('vp-nulos', 'nulos');
  leer('vp-blancos', 'blancos');
}


/* ── Cabecera: la ruta del distrito y qué hay en el simulador ───────────── */

function pintarRutaVoc() {
  const nav = document.getElementById('v-ruta');
  if (!nav) return;
  const o = VOC.origen;
  const p = parroquiaActivaVoc();
  const pasos = [`<button type="button" class="asig-ruta-paso" data-voc-nivel="pais">Ecuador</button>`];
  const pend = (t) => `<span class="asig-ruta-pend">${t}</span>`;
  if (!o.provK) pasos.push(pend('Elige provincia'));
  else {
    pasos.push(`<button type="button" class="asig-ruta-paso" data-voc-nivel="provincia">${escaparHTML(ambitoTexto({ provK: o.provK }))}</button>`);
    if (!o.cantK) pasos.push(pend('Elige cantón'));
    else {
      pasos.push(`<button type="button" class="asig-ruta-paso" data-voc-nivel="canton">${escaparHTML(ambitoTexto({ provK: o.provK, cantK: o.cantK }))}</button>`);
      pasos.push(`<span class="asig-ruta-act">${escaparHTML(VOC_ETIQUETA)}</span>`);
      pasos.push(p ? `<span class="asig-ruta-act asig-ruta-circ asig-circ-nom" style="--c:${VOC_COLOR_FUERTE}">${escaparHTML(p.nombre)}</span>`
                   : pend('Elige parroquia'));
    }
  }
  nav.innerHTML = pasos.join('<span class="asig-ruta-sep" aria-hidden="true">›</span>');
  nav.querySelectorAll('[data-voc-nivel]').forEach(b => { b.onclick = () => irANivelVoc(b.dataset.vocNivel); });
}

function actualizarCabeceraVocales() {
  pintarRutaVoc();
  const sub = document.getElementById('v-sub');
  if (!sub) return;
  const t = VOC.cargado;
  const falta = faltaDistritoVoc();
  if (falta || !t) {
    sub.textContent = falta ? textoEsperaVoc()
      : `Simulación con las listas y los candidatos inscritos para ${VOC_ANIO_SIM}.`;
    return;
  }
  const c = cuentaParticipacionVoc();
  const n = VOC.escanosPrueba || t.escanos;
  sub.innerHTML = (t.listas
      ? `En el simulador: ${fmtNum(t.listas)} ${t.listas === 1 ? 'lista inscrita' : 'listas inscritas'}${t.candidatos
          ? ` y ${fmtNum(t.candidatos)} ${t.candidatos === 1 ? 'candidato' : 'candidatos'}` : ''}`
      : 'Sin listas inscritas: el simulador trae listas en blanco para escribirlas a mano')
    + `, repartiendo <b>${fmtNum(n)} ${n === 1 ? 'vocal' : 'vocales'}</b>${VOC.escanosPrueba
        ? ` (prueba; la junta elige ${fmtNum(t.escanos)})` : ''} sobre
       ${c.validos > 0 ? fmtNum(c.validos) : '—'} votos válidos. Escribe el porcentaje de cada lista
       en el simulador.`;
}
