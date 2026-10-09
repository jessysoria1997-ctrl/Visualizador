/* ============================================================================
   motor_electoral.js — REPARTO DE ESCAÑOS

   Es el motor del «Simulador de Escaños Electorales», tal cual, sin una sola
   línea de su interfaz: recibe un escenario (listas con sus votos, escaños a
   repartir, método, umbral) y devuelve el reparto y su auditoría.

   Se incorpora sin modificar su lógica a propósito: así los resultados de
   esta sección y los del simulador original son los mismos número a número.
   Lo único que hace el tablero es llamarlo con el método Webster.

   Expone globalThis.MotorElectoral (ver la API pública al final del archivo).
   ========================================================================== */

/* ============================================================================
 * MOTOR ELECTORAL
 * Lógica de asignación y simulación de escaños, sin nada de interfaz.
 *
 * Todas las funciones son puras: reciben un "escenario" y devuelven datos.
 * La interfaz solo llama a estas funciones y pinta lo que devuelven.
 *
 * Un escenario tiene esta forma:
 *   {
 *     listas:    [{ id, nombre, votos }],   // el orden es el de la tabla
 *     escanos:   6,                          // escaños a repartir
 *     metodo:    'dhondt',                   // clave de METODOS
 *     umbral:    0,                          // % mínimo para participar (0 = sin umbral)
 *     baseModo:  'listas',                   // base de % y umbral (ver BASES_CALCULO)
 *     blancos:   0,
 *     nulos:     0,
 *     desempate: 'mayor_votos'               // clave de REGLAS_DESEMPATE
 *   }
 *
 * Precisión: los cocientes se comparan con aritmética entera exacta (se
 * multiplica en cruz en lugar de dividir), así que ni el orden ni los empates
 * dependen de redondeos. Los decimales solo se usan para mostrar.
 *
 * Funciones principales (numeradas como en la especificación):
 *    1. calcularPorcentajes        6. votosAdicionalesNecesarios
 *    2. generarCocientes           7. votosParaPerderEscano
 *    3. ordenarCocientes           8. compararEscenarios
 *    4. asignarEscanos             9. compararMetodos
 *    5. siguienteEscano           10. calcularSensibilidad
 * ========================================================================== */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.MotorElectoral = fabrica();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var VERSION = '1.0.0';
  var MAX_SEGURO = Number.MAX_SAFE_INTEGER; // 2^53 - 1
  var MAX_ESCANOS = 1000;
  var MAX_VOTOS = 1e12; // por lista
  var LIMITE_BUSQUEDA = Math.pow(2, 50); // tope de votos al buscar hacia arriba
  var EXTRA_ORDEN = 30; // cocientes excluidos que se devuelven tras el último escaño

  /* --------------------------------------------------------------------------
   * MÉTODOS DE ASIGNACIÓN
   * Para agregar un método de divisores basta con añadir una entrada aquí
   * (o llamar a registrarMetodo). `divisor(k)` devuelve el divisor del k-ésimo
   * escaño de una lista como fracción exacta { n, d } (numerador, denominador).
   * El selector, el comparador de métodos y todos los cálculos lo recogen solos.
   * ------------------------------------------------------------------------ */
  var METODOS = {
    dhondt: {
      id: 'dhondt',
      nombre: "D'Hondt",
      nombreLargo: "D'Hondt",
      serie: '1, 2, 3, 4…',
      descripcion: 'Divide los votos de cada lista entre 1, 2, 3, 4… y asigna los escaños a los cocientes más altos.',
      divisor: function (k) { return { n: k, d: 1 }; }
    },
    webster: {
      id: 'webster',
      nombre: 'Webster',
      nombreLargo: 'Webster / Sainte-Laguë',
      serie: '1, 3, 5, 7…',
      descripcion: 'Divide entre los impares 1, 3, 5, 7… Los divisores crecen más rápido, lo que reduce la ventaja de las listas más votadas.',
      divisor: function (k) { return { n: 2 * k - 1, d: 1 }; }
    },
    sainte_lague_mod: {
      id: 'sainte_lague_mod',
      nombre: 'Sainte-Laguë mod.',
      nombreLargo: 'Sainte-Laguë modificado (1,4)',
      serie: '1,4 · 3 · 5 · 7…',
      descripcion: 'Como Webster, pero el primer divisor es 1,4: encarece el primer escaño de las listas pequeñas.',
      divisor: function (k) { return k === 1 ? { n: 7, d: 5 } : { n: 2 * k - 1, d: 1 }; }
    }
  };

  /** Agrega (o reemplaza) un método de divisores. Valida que la serie sea positiva y creciente. */
  function registrarMetodo(def) {
    if (!def || !def.id || typeof def.divisor !== 'function') throw new Error('El método necesita id y divisor(k).');
    var previo = null;
    for (var k = 1; k <= 50; k++) {
      var f = def.divisor(k);
      if (!f || !Number.isInteger(f.n) || !Number.isInteger(f.d) || f.n <= 0 || f.d <= 0) {
        throw new Error('divisor(k) debe devolver { n, d } con enteros positivos.');
      }
      if (previo && cmpFraccion(f.n, f.d, previo.n, previo.d) <= 0) throw new Error('Los divisores deben ser estrictamente crecientes.');
      previo = f;
    }
    METODOS[def.id] = {
      id: def.id,
      nombre: def.nombre || def.id,
      nombreLargo: def.nombreLargo || def.nombre || def.id,
      serie: def.serie || '',
      descripcion: def.descripcion || '',
      divisor: def.divisor
    };
    return METODOS[def.id];
  }

  /* Reglas de desempate entre cocientes exactamente iguales de listas distintas. */
  var REGLAS_DESEMPATE = {
    mayor_votos: {
      id: 'mayor_votos',
      nombre: 'Mayor votación total',
      descripcion: 'Gana la lista con más votos en total. Si también empatan en votos, decide el orden de la tabla.'
    },
    menor_votos: {
      id: 'menor_votos',
      nombre: 'Menor votación total',
      descripcion: 'Gana la lista con menos votos en total. Si también empatan en votos, decide el orden de la tabla.'
    },
    orden_tabla: {
      id: 'orden_tabla',
      nombre: 'Orden de la tabla (sorteo)',
      descripcion: 'Gana la lista que aparece primero en la tabla. Sirve para fijar a mano el resultado de un sorteo.'
    }
  };

  /* Qué votos forman la base de los porcentajes y del umbral. */
  var BASES_CALCULO = {
    listas: {
      id: 'listas',
      nombre: 'Solo votos a listas',
      descripcion: 'Blancos y nulos quedan fuera del cálculo; se muestran solo como información.'
    },
    listas_blancos: {
      id: 'listas_blancos',
      nombre: 'Listas + blancos',
      descripcion: 'Los votos en blanco cuentan en la base de los porcentajes y del umbral. Los nulos no.'
    },
    emitidos: {
      id: 'emitidos',
      nombre: 'Todos los votos emitidos',
      descripcion: 'Blancos y nulos cuentan en la base de los porcentajes y del umbral.'
    }
  };

  /* Clasificación de cercanía al siguiente escaño. Es una medida de DISTANCIA
   * (votos que faltan como % de la base de votos), no una probabilidad. */
  var CORTES_VIABILIDAD = [1, 3, 6];
  var NIVELES_VIABILIDAD = [
    { clave: 'muy_cerca', etiqueta: 'Muy cerca', nivel: 0 },
    { clave: 'competitivo', etiqueta: 'Competitivo', nivel: 1 },
    { clave: 'crecimiento', etiqueta: 'Necesita crecimiento', nivel: 2 },
    { clave: 'lejano', etiqueta: 'Lejano', nivel: 3 }
  ];

  /* --------------------------------------------------------------------------
   * ARITMÉTICA EXACTA
   * ------------------------------------------------------------------------ */

  /** Compara a1/b1 con a2/b2 (enteros, b > 0). Devuelve -1, 0 o 1. Exacto siempre. */
  function cmpFraccion(a1, b1, a2, b2) {
    var izq = a1 * b2;
    var der = a2 * b1;
    // Si ambos productos caben en un entero seguro, la multiplicación fue exacta.
    if (izq <= MAX_SEGURO && der <= MAX_SEGURO) return izq === der ? 0 : (izq < der ? -1 : 1);
    var I = BigInt(a1) * BigInt(b2);
    var D = BigInt(a2) * BigInt(b1);
    return I === D ? 0 : (I < D ? -1 : 1);
  }

  /** Compara el cociente v1/(n1/d1) con v2/(n2/d2). Devuelve -1, 0 o 1. */
  function cmpCocientes(v1, div1, v2, div2) {
    if (div1.d === 1 && div2.d === 1) return cmpFraccion(v1, div1.n, v2, div2.n);
    var a1 = v1 * div1.d;
    var a2 = v2 * div2.d;
    if (a1 <= MAX_SEGURO && a2 <= MAX_SEGURO) return cmpFraccion(a1, div1.n, a2, div2.n);
    var I = BigInt(v1) * BigInt(div1.d) * BigInt(div2.n);
    var D = BigInt(v2) * BigInt(div2.d) * BigInt(div1.n);
    return I === D ? 0 : (I < D ? -1 : 1);
  }

  /** Valor decimal de un cociente (solo para mostrar). */
  function valorCociente(votos, div) { return votos * div.d / div.n; }

  /** Umbral en millonésimas: 3 % → 30000 (de 1 000 000). Admite hasta 4 decimales. */
  function umbralEnMillonesimas(umbralPct) {
    var u = Number(umbralPct);
    if (!isFinite(u) || u <= 0) return 0;
    return Math.round(u * 10000);
  }

  /** ¿Alcanza la lista el umbral? Regla: votos / base >= umbral (igualar basta). */
  function superaUmbral(votos, base, tMill) {
    if (tMill <= 0) return true;
    if (base <= 0) return false;
    return cmpFraccion(votos, base, tMill, 1000000) >= 0;
  }

  function esEnteroNoNegativo(x) { return typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= MAX_SEGURO; }

  /* --------------------------------------------------------------------------
   * VALIDACIÓN
   * ------------------------------------------------------------------------ */

  function normalizarNombre(s) {
    var t = String(s == null ? '' : s).trim().replace(/\s+/g, ' ').toLowerCase();
    return typeof t.normalize === 'function' ? t.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : t;
  }

  function extraDeBase(esc) {
    var b = esc.blancos || 0;
    var n = esc.nulos || 0;
    if (esc.baseModo === 'listas_blancos') return b;
    if (esc.baseModo === 'emitidos') return b + n;
    return 0;
  }

  /**
   * Revisa un escenario. Devuelve { ok, errores, bloqueantes, avisos }.
   * Los errores con bloquea:true impiden calcular; los demás (nombres repetidos
   * o vacíos) se informan pero no detienen el cálculo.
   */
  function validarEscenario(esc) {
    var errores = [];
    function agrega(codigo, mensaje, bloquea, extra) {
      var e = { codigo: codigo, mensaje: mensaje, bloquea: bloquea !== false };
      if (extra) for (var k in extra) e[k] = extra[k];
      errores.push(e);
    }
    function fin() {
      var bloqueantes = errores.filter(function (e) { return e.bloquea; });
      return {
        ok: bloqueantes.length === 0,
        errores: errores,
        bloqueantes: bloqueantes,
        avisos: errores.filter(function (e) { return !e.bloquea; })
      };
    }

    if (!esc || !Array.isArray(esc.listas) || esc.listas.length === 0) {
      agrega('sin_listas', 'Agrega al menos una lista para calcular.');
      return fin();
    }
    if (!METODOS[esc.metodo]) agrega('metodo_desconocido', 'Elige un método de asignación.');

    if (typeof esc.escanos !== 'number' || !Number.isInteger(esc.escanos) || esc.escanos < 1) {
      agrega('escanos_invalidos', 'El número de escaños debe ser un entero positivo.');
    } else if (esc.escanos > MAX_ESCANOS) {
      agrega('escanos_excesivos', 'El máximo admitido es ' + MAX_ESCANOS + ' escaños.');
    }

    var votosOk = true;
    esc.listas.forEach(function (l, i) {
      var nombre = String(l.nombre == null ? '' : l.nombre).trim() || ('fila ' + (i + 1));
      if (!esEnteroNoNegativo(l.votos)) {
        votosOk = false;
        var negativo = typeof l.votos === 'number' && l.votos < 0;
        agrega('votos_invalidos',
          negativo ? 'Los votos de «' + nombre + '» no pueden ser negativos.'
                   : 'Los votos de «' + nombre + '» deben ser un número entero.',
          true, { listaId: l.id });
      } else if (l.votos > MAX_VOTOS) {
        votosOk = false;
        agrega('votos_excesivos', 'Los votos de «' + nombre + '» superan el máximo admitido.', true, { listaId: l.id });
      }
    });
    ['blancos', 'nulos'].forEach(function (campo) {
      var v = esc[campo] == null ? 0 : esc[campo];
      if (!esEnteroNoNegativo(v) || v > MAX_VOTOS) {
        votosOk = false;
        agrega(campo + '_invalidos', 'Los votos ' + campo + ' deben ser un número entero igual o mayor que cero.');
      }
    });

    var u = esc.umbral == null ? 0 : Number(esc.umbral);
    var umbralOk = isFinite(u) && u >= 0 && u < 100;
    if (!umbralOk) agrega('umbral_invalido', 'El umbral debe estar entre 0 % y menos de 100 %.');

    if (esc.desempate && !REGLAS_DESEMPATE[esc.desempate]) agrega('desempate_desconocido', 'Elige una regla de desempate.');
    if (esc.baseModo && !BASES_CALCULO[esc.baseModo]) agrega('base_desconocida', 'Elige cómo tratar los votos blancos y nulos.');

    // Nombres: se avisa, pero no se bloquea el cálculo (cada lista tiene su propio id).
    var vistos = {};
    esc.listas.forEach(function (l) {
      var clave = normalizarNombre(l.nombre);
      if (!clave) { agrega('nombre_vacio', 'Hay una lista sin nombre.', false, { listaId: l.id }); return; }
      (vistos[clave] = vistos[clave] || []).push(l);
    });
    Object.keys(vistos).forEach(function (clave) {
      if (vistos[clave].length > 1) {
        agrega('nombre_duplicado',
          'Hay ' + vistos[clave].length + ' listas llamadas «' + String(vistos[clave][0].nombre).trim() + '». Usa nombres distintos.',
          false, { listaIds: vistos[clave].map(function (l) { return l.id; }) });
      }
    });

    if (votosOk) {
      var total = 0;
      esc.listas.forEach(function (l) { total += l.votos; });
      if (total === 0) {
        agrega('sin_votos', 'Ingresa los votos de al menos una lista para calcular.');
      } else if (umbralOk) {
        var base = total + extraDeBase(esc);
        var tMill = umbralEnMillonesimas(u);
        var alguna = esc.listas.some(function (l) { return l.votos > 0 && superaUmbral(l.votos, base, tMill); });
        if (!alguna) {
          agrega('nadie_supera_umbral', 'Ninguna lista alcanza el umbral del ' + String(u).replace('.', ',') + ' %. Baja el umbral o revisa los votos.');
        }
      }
    }
    return fin();
  }

  /* --------------------------------------------------------------------------
   * CONTEXTO DE CÁLCULO (interno)
   * ------------------------------------------------------------------------ */

  function crearContexto(esc) {
    var metodo = METODOS[esc.metodo];
    var S = esc.escanos;
    var divisores = new Array(S + 2);
    for (var k = 1; k <= S + 1; k++) {
      var f = metodo.divisor(k);
      divisores[k] = { n: f.n, d: f.d, valor: f.n / f.d };
    }
    return {
      S: S,
      metodo: metodo,
      divisores: divisores,
      desempate: esc.desempate || 'mayor_votos',
      tMill: umbralEnMillonesimas(esc.umbral),
      extraBase: extraDeBase(esc)
    };
  }

  /** ¿La lista A gana el empate frente a la lista B? (cocientes exactamente iguales) */
  function prefiere(regla, votosA, idxA, votosB, idxB) {
    if (regla === 'mayor_votos' && votosA !== votosB) return votosA > votosB;
    if (regla === 'menor_votos' && votosA !== votosB) return votosA < votosB;
    return idxA < idxB; // orden de la tabla
  }

  /**
   * Reparto rápido: método secuencial (en cada paso gana el mayor cociente vigente).
   * Solo devuelve cuántos escaños recibe cada lista. Es el núcleo de las búsquedas
   * y sirve de verificación cruzada de asignarEscanos, que usa otro algoritmo.
   */
  function repartoRapido(ctx, votos) {
    var L = votos.length, S = ctx.S, divs = ctx.divisores, regla = ctx.desempate;
    var escanos = new Array(L);
    var suma = 0, i;
    for (i = 0; i < L; i++) { escanos[i] = 0; suma += votos[i]; }
    var base = suma + ctx.extraBase;
    var eleg = [];
    for (i = 0; i < L; i++) if (votos[i] > 0 && superaUmbral(votos[i], base, ctx.tMill)) eleg.push(i);
    if (eleg.length === 0) return escanos;
    for (var n = 0; n < S; n++) {
      var mejor = eleg[0];
      for (var j = 1; j < eleg.length; j++) {
        var c = eleg[j];
        var cmp = cmpCocientes(votos[c], divs[escanos[c] + 1], votos[mejor], divs[escanos[mejor] + 1]);
        if (cmp > 0 || (cmp === 0 && prefiere(regla, votos[c], c, votos[mejor], mejor))) mejor = c;
      }
      escanos[mejor]++;
    }
    return escanos;
  }

  /** Escaños por lista (arreglo en el orden de la tabla). Atajo público del reparto rápido. */
  function contarEscanos(esc) {
    if (!validarEscenario(esc).ok) return null;
    return repartoRapido(crearContexto(esc), esc.listas.map(function (l) { return l.votos; }));
  }

  /* --------------------------------------------------------------------------
   * 1. PORCENTAJES
   * ------------------------------------------------------------------------ */

  /**
   * Totales, porcentaje de cada lista sobre la base elegida y si supera el umbral.
   */
  function calcularPorcentajes(esc) {
    var blancos = esc.blancos || 0, nulos = esc.nulos || 0;
    var votosListas = 0;
    esc.listas.forEach(function (l) { votosListas += l.votos; });
    var base = votosListas + extraDeBase(esc);
    var tMill = umbralEnMillonesimas(esc.umbral);
    var votosElegibles = 0;
    var listas = esc.listas.map(function (l, idx) {
      var elegible = l.votos > 0 && superaUmbral(l.votos, base, tMill);
      if (elegible) votosElegibles += l.votos;
      return {
        id: l.id,
        nombre: l.nombre,
        idx: idx,
        votos: l.votos,
        pct: base > 0 ? l.votos * 100 / base : 0,
        elegible: elegible,
        motivoExclusion: elegible ? null : (l.votos === 0 ? 'sin_votos' : 'umbral')
      };
    });
    var emitidos = votosListas + blancos + nulos;
    return {
      votosListas: votosListas,
      blancos: blancos,
      nulos: nulos,
      emitidos: emitidos,
      base: base,
      baseModo: esc.baseModo || 'listas',
      umbral: Number(esc.umbral) || 0,
      votosElegibles: votosElegibles,
      pctBlancos: emitidos > 0 ? blancos * 100 / emitidos : 0,
      pctNulos: emitidos > 0 ? nulos * 100 / emitidos : 0,
      listas: listas
    };
  }

  /* --------------------------------------------------------------------------
   * 2. COCIENTES
   * ------------------------------------------------------------------------ */

  /**
   * Cocientes de cada lista para los divisores 1..nDivisores (matriz completa).
   * Incluye las listas que no participan (elegible:false) para poder auditarlas.
   */
  function generarCocientes(esc, nDivisores) {
    var metodo = METODOS[esc.metodo];
    var n = nDivisores == null ? esc.escanos : nDivisores;
    var P = calcularPorcentajes(esc);
    var divisores = [];
    for (var k = 1; k <= n; k++) {
      var f = metodo.divisor(k);
      divisores.push({ k: k, n: f.n, d: f.d, valor: f.n / f.d });
    }
    return {
      divisores: divisores,
      filas: P.listas.map(function (l) {
        return {
          listaId: l.id, nombre: l.nombre, idx: l.idx, votos: l.votos, elegible: l.elegible,
          motivoExclusion: l.motivoExclusion,
          cocientes: divisores.map(function (dv) {
            return { listaId: l.id, idx: l.idx, votos: l.votos, k: dv.k, divisor: dv, cociente: valorCociente(l.votos, dv) };
          })
        };
      })
    };
  }

  /* --------------------------------------------------------------------------
   * 3. ORDEN DE LOS COCIENTES
   * ------------------------------------------------------------------------ */

  /** Orden entre dos cocientes: negativo si `a` va antes que `b`. */
  function compararCocientes(a, b, regla) {
    var c = cmpCocientes(a.votos, a.divisor, b.votos, b.divisor);
    if (c !== 0) return -c; // el mayor cociente va primero
    if (a.idx === b.idx) return a.k - b.k;
    return prefiere(regla, a.votos, a.idx, b.votos, b.idx) ? -1 : 1;
  }

  /**
   * Ordena cocientes de mayor a menor. Los empates exactos se resuelven con la
   * regla de desempate. No modifica el arreglo recibido.
   */
  function ordenarCocientes(cocientes, regla) {
    var r = regla || 'mayor_votos';
    return cocientes.slice().sort(function (a, b) { return compararCocientes(a, b, r); });
  }

  /* --------------------------------------------------------------------------
   * 4. ASIGNACIÓN DE ESCAÑOS
   * ------------------------------------------------------------------------ */

  function resumenCociente(c, nombres) {
    return { listaId: c.listaId, idx: c.idx, nombre: nombres[c.idx], votos: c.votos, k: c.k, divisor: c.divisor, cociente: c.cociente };
  }

  /**
   * Reparte los escaños y explica cada adjudicación.
   * Algoritmo: se generan los cocientes de las listas que participan, se ordenan
   * de mayor a menor y los S primeros reciben escaño. El resultado se contrasta
   * con el reparto secuencial (verificacion.coincideSecuencial).
   */
  function asignarEscanos(esc) {
    var val = validarEscenario(esc);
    if (!val.ok) return { ok: false, errores: val.errores, bloqueantes: val.bloqueantes, avisos: val.avisos };

    var ctx = crearContexto(esc);
    var S = ctx.S;
    var P = calcularPorcentajes(esc);
    var nombres = P.listas.map(function (l) { return l.nombre; });

    // Cocientes de las listas que participan: divisores 1..S+1 (el S+1 permite
    // saber quién quedaría primero fuera aunque una sola lista se lo lleve todo).
    var todos = [];
    P.listas.forEach(function (l) {
      if (!l.elegible) return;
      for (var k = 1; k <= S + 1; k++) {
        var dv = ctx.divisores[k];
        todos.push({ listaId: l.id, idx: l.idx, votos: l.votos, k: k, divisor: dv, cociente: valorCociente(l.votos, dv) });
      }
    });
    var orden = ordenarCocientes(todos, ctx.desempate);

    var escanos = P.listas.map(function () { return 0; });
    var adjudicacion = [];
    for (var n = 0; n < S; n++) {
      var g = orden[n];
      escanos[g.idx]++;
      // Segundo: el mejor cociente vigente de OTRA lista en ese momento.
      var seg = null;
      for (var j = n + 1; j < orden.length; j++) if (orden[j].idx !== g.idx) { seg = orden[j]; break; }
      adjudicacion.push({
        numero: n + 1,
        listaId: g.listaId,
        idx: g.idx,
        nombre: nombres[g.idx],
        votos: g.votos,
        k: g.k,
        divisor: g.divisor,
        cociente: g.cociente,
        segundo: seg ? resumenCociente(seg, nombres) : null,
        diferencia: seg ? g.cociente - seg.cociente : null,
        empatado: false
      });
    }

    // Empates: grupos de cocientes exactamente iguales que tocan algún escaño.
    var empates = [];
    var i = 0;
    while (i < S) {
      var f = i + 1;
      while (f < orden.length && cmpCocientes(orden[i].votos, orden[i].divisor, orden[f].votos, orden[f].divisor) === 0) f++;
      if (f - i >= 2) {
        var grupo = orden.slice(i, f);
        var porTabla = ctx.desempate === 'orden_tabla';
        if (!porTabla) {
          for (var a = 0; a < grupo.length && !porTabla; a++) {
            for (var b = a + 1; b < grupo.length; b++) if (grupo[a].votos === grupo[b].votos) { porTabla = true; break; }
          }
        }
        var inicio = i;
        empates.push({
          cociente: grupo[0].cociente,
          decisivo: f > S,
          plazas: Math.min(f, S) - i,
          regla: ctx.desempate,
          porOrdenDeTabla: porTabla,
          miembros: grupo.map(function (c, p) {
            return { listaId: c.listaId, idx: c.idx, nombre: nombres[c.idx], votos: c.votos, k: c.k, divisor: c.divisor,
                     posicion: inicio + p + 1, gana: inicio + p < S };
          })
        });
        for (var q = i; q < Math.min(f, S); q++) adjudicacion[q].empatado = true;
      }
      i = f;
    }

    var secuencial = repartoRapido(ctx, P.listas.map(function (l) { return l.votos; }));
    var asignados = 0, coincide = true;
    escanos.forEach(function (e, idx) { asignados += e; if (e !== secuencial[idx]) coincide = false; });

    var listas = P.listas.map(function (l) {
      var s = escanos[l.idx];
      var dv = ctx.divisores[Math.min(s + 1, S + 1)];
      return {
        id: l.id, nombre: l.nombre, idx: l.idx, votos: l.votos, pct: l.pct,
        elegible: l.elegible, motivoExclusion: l.motivoExclusion,
        escanos: s,
        pctEscanos: s * 100 / S,
        siguiente: { k: s + 1, divisor: dv, cociente: valorCociente(l.votos, dv) }
      };
    });

    var ultimo = adjudicacion[S - 1];
    var excl = orden.length > S ? orden[S] : null;

    return {
      ok: true,
      errores: val.errores,
      avisos: val.avisos,
      metodo: { id: ctx.metodo.id, nombre: ctx.metodo.nombre, nombreLargo: ctx.metodo.nombreLargo, serie: ctx.metodo.serie },
      escanos: S,
      desempate: ctx.desempate,
      totales: {
        votosListas: P.votosListas, blancos: P.blancos, nulos: P.nulos, emitidos: P.emitidos,
        base: P.base, baseModo: P.baseModo, umbral: P.umbral, votosElegibles: P.votosElegibles,
        pctBlancos: P.pctBlancos, pctNulos: P.pctNulos,
        listas: P.listas.length,
        listasElegibles: P.listas.filter(function (l) { return l.elegible; }).length
      },
      listas: listas,
      adjudicacion: adjudicacion,
      orden: orden.slice(0, S + EXTRA_ORDEN).map(function (c, p) {
        return { posicion: p + 1, gana: p < S, listaId: c.listaId, idx: c.idx, nombre: nombres[c.idx], votos: c.votos, k: c.k, divisor: c.divisor, cociente: c.cociente };
      }),
      corte: {
        ultimoGanador: { numero: ultimo.numero, listaId: ultimo.listaId, idx: ultimo.idx, nombre: ultimo.nombre, votos: ultimo.votos, k: ultimo.k, divisor: ultimo.divisor, cociente: ultimo.cociente },
        primerExcluido: excl ? resumenCociente(excl, nombres) : null,
        diferencia: excl ? ultimo.cociente - excl.cociente : null
      },
      empates: empates,
      hayEmpateDecisivo: empates.some(function (e) { return e.decisivo; }),
      verificacion: {
        disponibles: S,
        asignados: asignados,
        coincide: asignados === S,
        coincideSecuencial: coincide,
        ok: asignados === S && coincide
      }
    };
  }

  /* --------------------------------------------------------------------------
   * 5. SIGUIENTE ESCAÑO
   * ------------------------------------------------------------------------ */

  /**
   * Sin listaId: quién se llevaría el escaño S+1 (el primer cociente que quedó fuera).
   * Con listaId: cuál es el próximo escaño de esa lista, con qué cociente compite
   * y qué cociente rival tiene que superar (el ganador más débil de otra lista).
   */
  function siguienteEscano(esc, listaId, resultado) {
    var res = resultado || asignarEscanos(esc);
    if (!res.ok) return null;
    if (listaId == null) {
      var ex = res.corte.primerExcluido;
      if (!ex) return null;
      return { tipo: 'global', numero: res.escanos + 1, listaId: ex.listaId, idx: ex.idx, nombre: ex.nombre, votos: ex.votos,
               k: ex.k, divisor: ex.divisor, cociente: ex.cociente, diferenciaConUltimo: res.corte.diferencia };
    }
    var l = null;
    res.listas.forEach(function (x) { if (x.id === listaId) l = x; });
    if (!l) return null;
    var base = { tipo: 'lista', listaId: l.id, idx: l.idx, nombre: l.nombre, votos: l.votos, escanosActuales: l.escanos, elegible: l.elegible };
    if (l.escanos >= res.escanos) { base.completo = true; return base; }
    var rival = null;
    for (var n = res.adjudicacion.length - 1; n >= 0; n--) {
      if (res.adjudicacion[n].listaId !== listaId) { rival = res.adjudicacion[n]; break; }
    }
    base.completo = false;
    base.numero = l.escanos + 1;
    base.divisor = l.siguiente.divisor;
    base.cocienteActual = l.siguiente.cociente;
    base.rival = rival ? { numeroEscano: rival.numero, listaId: rival.listaId, idx: rival.idx, nombre: rival.nombre, votos: rival.votos,
                           k: rival.k, divisor: rival.divisor, cociente: rival.cociente } : null;
    base.brecha = rival ? rival.cociente - l.siguiente.cociente : null;
    return base;
  }

  /* --------------------------------------------------------------------------
   * BÚSQUEDAS EXACTAS (internas)
   * Los escaños de una lista nunca bajan cuando suben sus votos (con las demás
   * fijas), así que el mínimo entero se encuentra por búsqueda binaria sobre el
   * reparto real. No se usa ninguna fórmula aproximada.
   * ------------------------------------------------------------------------ */

  /** Menor entero x en [lo, hi] con pred(x) verdadero (pred pasa de falso a verdadero una sola vez). */
  function primerVerdadero(lo, hi, pred) {
    while (lo < hi) {
      var mid = lo + Math.floor((hi - lo) / 2);
      if (pred(mid)) hi = mid; else lo = mid + 1;
    }
    return lo;
  }

  function prepararBusqueda(esc) {
    var indice = {};
    esc.listas.forEach(function (l, i) { indice[l.id] = i; });
    return { ctx: crearContexto(esc), votos: esc.listas.map(function (l) { return l.votos; }), indice: indice };
  }

  /** Escaños de la lista `idx` si tuviera V votos y las demás no cambiaran (reparto completo). */
  function escanosConGenerico(busq, idx, V) {
    var previo = busq.votos[idx];
    busq.votos[idx] = V;
    var r = repartoRapido(busq.ctx, busq.votos)[idx];
    busq.votos[idx] = previo;
    return r;
  }

  /**
   * Evaluador rápido y exacto de "escaños de la lista idx con V votos".
   * Como solo cambian los votos de una lista, los cocientes de las demás no se
   * mueven: se ordenan una vez (los S mejores, N[0] >= N[1] >= …) y después basta
   * con ubicar los cocientes propios entre ellos. El k-ésimo cociente propio gana
   * escaño si como mucho S-k cocientes rivales van por delante, es decir, si
   * precede a N[S-k]. Con umbral, el conjunto de rivales depende de la base de
   * votos y se guarda uno por cada combinación de listas que lo alcanzan.
   */
  function evaluadorDe(busq, idx) {
    if (!busq.evaluadores) busq.evaluadores = {};
    if (busq.evaluadores[idx]) return busq.evaluadores[idx];
    var ctx = busq.ctx, S = ctx.S, divs = ctx.divisores, regla = ctx.desempate, votos = busq.votos, L = votos.length;
    var resto = ctx.extraBase, i;
    for (i = 0; i < L; i++) if (i !== idx) resto += votos[i];
    var memo = {};

    function rivalesOrdenados(base) {
      var el = [], clave = '';
      for (var a = 0; a < L; a++) {
        if (a === idx) continue;
        if (votos[a] > 0 && superaUmbral(votos[a], base, ctx.tMill)) { el.push(a); clave += a + ','; }
      }
      var N = memo[clave];
      if (N) return N;
      N = [];
      if (el.length) {
        var cuenta = new Array(L);
        for (var z = 0; z < L; z++) cuenta[z] = 0;
        for (var n = 0; n < S; n++) {
          var mejor = el[0];
          for (var j = 1; j < el.length; j++) {
            var c = el[j];
            var cmp = cmpCocientes(votos[c], divs[cuenta[c] + 1], votos[mejor], divs[cuenta[mejor] + 1]);
            if (cmp > 0 || (cmp === 0 && prefiere(regla, votos[c], c, votos[mejor], mejor))) mejor = c;
          }
          N.push({ v: votos[mejor], div: divs[cuenta[mejor] + 1], idx: mejor });
          cuenta[mejor]++;
        }
      }
      memo[clave] = N;
      return N;
    }
    var fijos = ctx.tMill === 0 ? rivalesOrdenados(resto + 1) : null; // sin umbral, los rivales no dependen de V

    function evaluar(V) {
      if (V <= 0) return 0;
      var base = resto + V;
      if (!superaUmbral(V, base, ctx.tMill)) return 0;
      var N = fijos || rivalesOrdenados(base);
      if (N.length === 0) return S;
      var lo = 0, hi = S; // mayor k cuyo cociente propio precede a N[S-k]
      while (lo < hi) {
        var k = lo + Math.ceil((hi - lo) / 2);
        var r = N[S - k];
        var cmp = cmpCocientes(V, divs[k], r.v, r.div);
        if (cmp > 0 || (cmp === 0 && prefiere(regla, V, idx, r.v, r.idx))) lo = k; else hi = k - 1;
      }
      return lo;
    }
    busq.evaluadores[idx] = evaluar;
    return evaluar;
  }

  /** Escaños de la lista `idx` si tuviera V votos y las demás no cambiaran. */
  function escanosCon(busq, idx, V) { return evaluadorDe(busq, idx)(V); }

  /** Menor número de votos con el que la lista `idx` obtiene al menos k escaños (demás fijas). null si es inalcanzable. */
  function umbralDeVotos(busq, idx, k) {
    if (k <= 0) return 0;
    if (k > busq.ctx.S) return null;
    var v = busq.votos[idx];
    function pred(V) { return escanosCon(busq, idx, V) >= k; }
    if (pred(v)) return primerVerdadero(0, v, pred);
    var lo = v, paso = 1;
    for (;;) {
      var hi = v + paso;
      if (hi > LIMITE_BUSQUEDA) return null;
      if (pred(hi)) return primerVerdadero(lo + 1, hi, pred);
      lo = hi;
      paso *= 2;
    }
  }

  function conVotos(esc, listaId, votos) {
    var copia = {};
    for (var k in esc) copia[k] = esc[k];
    copia.listas = esc.listas.map(function (l) { return l.id === listaId ? { id: l.id, nombre: l.nombre, votos: votos } : l; });
    return copia;
  }

  /** Diferencias de escaños entre dos repartos (arreglos por índice de lista). */
  function cambiosDeEscanos(esc, antes, despues) {
    var out = [];
    esc.listas.forEach(function (l, i) {
      if (antes[i] !== despues[i]) out.push({ listaId: l.id, idx: i, nombre: l.nombre, de: antes[i], a: despues[i], delta: despues[i] - antes[i] });
    });
    return out;
  }

  function clasificarViabilidad(votosAdicionales, baseVotos) {
    var puntos = baseVotos > 0 ? votosAdicionales / baseVotos * 100 : Infinity;
    var nivel = 3;
    if (puntos <= CORTES_VIABILIDAD[0]) nivel = 0;
    else if (puntos <= CORTES_VIABILIDAD[1]) nivel = 1;
    else if (puntos <= CORTES_VIABILIDAD[2]) nivel = 2;
    var n = NIVELES_VIABILIDAD[nivel];
    return { clave: n.clave, etiqueta: n.etiqueta, nivel: n.nivel, puntos: puntos };
  }

  /** ¿Participa el k-ésimo cociente de la lista en un empate decisivo de `res`? Devuelve el empate o null. */
  function empateDecisivoDe(res, listaId, k) {
    if (!res || !res.ok) return null;
    for (var i = 0; i < res.empates.length; i++) {
      var e = res.empates[i];
      if (!e.decisivo) continue;
      for (var j = 0; j < e.miembros.length; j++) {
        if (e.miembros[j].listaId === listaId && e.miembros[j].k === k) return { empate: e, gana: e.miembros[j].gana };
      }
    }
    return null;
  }

  /* --------------------------------------------------------------------------
   * 6. VOTOS ADICIONALES NECESARIOS
   * ------------------------------------------------------------------------ */

  /**
   * Mínimo número entero de votos adicionales con el que la lista consigue
   * `objetivo` escaños (por defecto, uno más que ahora), manteniendo fijos los
   * votos de las demás listas. Se obtiene por búsqueda sobre el reparto real.
   */
  function votosAdicionalesNecesarios(esc, listaId, opciones) {
    var op = opciones || {};
    var res = op.resultado || asignarEscanos(esc);
    if (!res.ok) return { posible: false, motivo: 'escenario_invalido' };
    var l = null;
    res.listas.forEach(function (x) { if (x.id === listaId) l = x; });
    if (!l) return { posible: false, motivo: 'lista_desconocida' };

    var S = res.escanos;
    var objetivo = op.objetivo == null ? l.escanos + 1 : op.objetivo;
    var comun = { listaId: l.id, idx: l.idx, nombre: l.nombre, votosActuales: l.votos, escanosActuales: l.escanos, objetivo: objetivo };
    if (objetivo > S) { comun.posible = false; comun.motivo = 'sin_mas_escanos'; return comun; }

    var busq = prepararBusqueda(esc);
    var minimo = umbralDeVotos(busq, l.idx, objetivo);
    if (minimo == null) { comun.posible = false; comun.motivo = 'fuera_de_rango'; return comun; }

    var adicionales = Math.max(0, minimo - l.votos);
    var antes = res.listas.map(function (x) { return x.escanos; });
    var escDespues = conVotos(esc, listaId, minimo);
    var resDespues = asignarEscanos(escDespues);
    var despues = resDespues.listas.map(function (x) { return x.escanos; });

    // Señalización de empates: ¿gana gracias al desempate?, ¿había un empate perdido justo antes?
    var empate = null;
    var eDesp = empateDecisivoDe(resDespues, listaId, objetivo);
    if (eDesp && eDesp.gana) empate = { tipo: 'gana_por_desempate', con: eDesp.empate };
    if (!empate && minimo - 1 >= 0 && adicionales >= 1) {
      var ePrev = empateDecisivoDe(asignarEscanos(conVotos(esc, listaId, minimo - 1)), listaId, objetivo);
      if (ePrev && !ePrev.gana) empate = { tipo: 'empate_previo_perdido', con: ePrev.empate, votos: minimo - 1, adicionales: adicionales - 1 };
    }

    comun.posible = true;
    comun.adicionales = adicionales;
    comun.nuevosVotos = minimo;
    comun.escanosDespues = despues[l.idx];
    comun.cambios = cambiosDeEscanos(esc, antes, despues);
    comun.crecimientoPct = l.votos > 0 ? adicionales / l.votos * 100 : null;
    comun.viabilidad = clasificarViabilidad(adicionales, res.totales.base);
    comun.bajoUmbral = !l.elegible && l.votos > 0;
    comun.empate = empate;
    comun.siguiente = siguienteEscano(esc, listaId, res);
    return comun;
  }

  /* --------------------------------------------------------------------------
   * 7. PÉRDIDA DE ESCAÑOS
   * ------------------------------------------------------------------------ */

  /**
   * Cuántos votos puede perder la lista antes de quedarse con menos de k escaños
   * (por defecto k = los que tiene ahora, es decir, su último escaño).
   *   colchon   = votos que puede perder conservando el escaño k
   *   pierdeCon = colchon + 1 = mínimo de votos perdidos con el que lo pierde
   */
  function votosParaPerderEscano(esc, listaId, k, opciones) {
    var op = opciones || {};
    var res = op.resultado || asignarEscanos(esc);
    if (!res.ok) return { posible: false, motivo: 'escenario_invalido' };
    var l = null;
    res.listas.forEach(function (x) { if (x.id === listaId) l = x; });
    if (!l) return { posible: false, motivo: 'lista_desconocida' };
    var objetivo = k == null ? l.escanos : k;
    var comun = { listaId: l.id, idx: l.idx, nombre: l.nombre, votosActuales: l.votos, escanosActuales: l.escanos, k: objetivo };
    if (l.escanos === 0 || objetivo < 1 || objetivo > l.escanos) { comun.posible = false; comun.motivo = 'sin_escano'; return comun; }
    var hayRival = esc.listas.some(function (x) { return x.id !== listaId && x.votos > 0; });
    if (!hayRival) { comun.posible = false; comun.motivo = 'sin_rivales'; return comun; }

    var busq = prepararBusqueda(esc);
    var minimo = umbralDeVotos(busq, l.idx, objetivo); // siempre <= votos actuales
    var colchon = l.votos - minimo;
    var antes = res.listas.map(function (x) { return x.escanos; });
    var resDespues = asignarEscanos(conVotos(esc, listaId, minimo - 1));
    var despues = resDespues.ok ? resDespues.listas.map(function (x) { return x.escanos; }) : antes.map(function (e, i) { return i === l.idx ? 0 : e; });

    // Empate: con exactamente `colchon` votos menos, ¿conserva el escaño solo por el desempate?
    var empate = null;
    var eLim = empateDecisivoDe(colchon === 0 ? res : asignarEscanos(conVotos(esc, listaId, minimo)), listaId, objetivo);
    if (eLim && eLim.gana) empate = { tipo: 'conserva_por_desempate', con: eLim.empate };
    var eDesp = empateDecisivoDe(resDespues, listaId, objetivo);
    if (eDesp && !eDesp.gana) empate = { tipo: 'pierde_por_desempate', con: eDesp.empate };

    comun.posible = true;
    comun.votosMinimos = minimo;
    comun.colchon = colchon;
    comun.pierdeCon = colchon + 1;
    comun.nuevosVotos = minimo - 1;
    comun.escanosDespues = despues[l.idx];
    comun.cambios = cambiosDeEscanos(esc, antes, despues);
    comun.caidaPct = l.votos > 0 ? (colchon + 1) / l.votos * 100 : null;
    comun.puntos = res.totales.base > 0 ? (colchon + 1) / res.totales.base * 100 : null;
    comun.empate = empate;
    comun.sinReparto = !resDespues.ok; // con esos votos ya nadie alcanzaría el umbral
    return comun;
  }

  /* --------------------------------------------------------------------------
   * MÁRGENES DE TODAS LAS LISTAS (ranking de competitividad y puntos de quiebre)
   * ------------------------------------------------------------------------ */

  /**
   * Para cada lista: votos que le faltan para su siguiente escaño y votos que
   * puede perder antes de ceder el último. Incluye el ranking ordenado.
   */
  function analizarMargenes(esc, resultado) {
    var res = resultado || asignarEscanos(esc);
    if (!res.ok) return null;
    var S = res.escanos;
    var busq = prepararBusqueda(esc);
    var antes = res.listas.map(function (x) { return x.escanos; });
    var hayVariosConVotos = esc.listas.filter(function (x) { return x.votos > 0; }).length > 1;

    function repartoCon(idx, V) {
      var previo = busq.votos[idx];
      busq.votos[idx] = V;
      var r = repartoRapido(busq.ctx, busq.votos);
      busq.votos[idx] = previo;
      return r;
    }

    var filas = res.listas.map(function (l) {
      var fila = { listaId: l.id, idx: l.idx, nombre: l.nombre, votos: l.votos, escanos: l.escanos, elegible: l.elegible,
                   motivoExclusion: l.motivoExclusion, proximo: null, perdida: null, siguiente: siguienteEscano(esc, l.id, res) };
      if (l.escanos < S) {
        var up = umbralDeVotos(busq, l.idx, l.escanos + 1);
        if (up != null) {
          var adic = up - l.votos;
          var desp = repartoCon(l.idx, up);
          fila.proximo = {
            numero: l.escanos + 1,
            adicionales: adic,
            nuevosVotos: up,
            escanosDespues: desp[l.idx],
            cambios: cambiosDeEscanos(esc, antes, desp),
            crecimientoPct: l.votos > 0 ? adic / l.votos * 100 : null,
            viabilidad: clasificarViabilidad(adic, res.totales.base)
          };
        }
      }
      if (l.escanos >= 1 && hayVariosConVotos) {
        var down = umbralDeVotos(busq, l.idx, l.escanos);
        var colchon = l.votos - down;
        var desp2 = repartoCon(l.idx, down - 1);
        fila.perdida = {
          numero: l.escanos,
          votosMinimos: down,
          colchon: colchon,
          pierdeCon: colchon + 1,
          nuevosVotos: down - 1,
          escanosDespues: desp2[l.idx],
          cambios: cambiosDeEscanos(esc, antes, desp2),
          caidaPct: l.votos > 0 ? (colchon + 1) / l.votos * 100 : null,
          puntos: res.totales.base > 0 ? (colchon + 1) / res.totales.base * 100 : null
        };
      }
      return fila;
    });

    var ranking = filas.filter(function (f) { return f.proximo; })
      .sort(function (a, b) { return a.proximo.adicionales - b.proximo.adicionales || a.idx - b.idx; });
    var fragiles = filas.filter(function (f) { return f.perdida; })
      .sort(function (a, b) { return a.perdida.pierdeCon - b.perdida.pierdeCon || a.idx - b.idx; });

    return {
      filas: filas,
      ranking: ranking,
      masCercana: ranking.length ? ranking[0] : null,   // la que menos votos necesita para ganar un escaño
      masExpuesta: fragiles.length ? fragiles[0] : null // la que menos votos puede perder antes de ceder uno
    };
  }

  /**
   * Seguridad de cada escaño adjudicado: votos que su lista puede perder antes de
   * quedarse sin él. Permite señalar el escaño más competitivo y el más seguro.
   */
  function seguridadPorEscano(esc, resultado) {
    var res = resultado || asignarEscanos(esc);
    if (!res.ok) return null;
    var busq = prepararBusqueda(esc);
    var hayVariosConVotos = esc.listas.filter(function (x) { return x.votos > 0; }).length > 1;
    var porEscano = res.adjudicacion.map(function (a) {
      if (!hayVariosConVotos) return { numero: a.numero, listaId: a.listaId, idx: a.idx, nombre: a.nombre, k: a.k, colchon: null, pierdeCon: null };
      var minimo = umbralDeVotos(busq, a.idx, a.k);
      var colchon = a.votos - minimo;
      return { numero: a.numero, listaId: a.listaId, idx: a.idx, nombre: a.nombre, k: a.k, votosMinimos: minimo,
               colchon: colchon, pierdeCon: colchon + 1,
               puntos: res.totales.base > 0 ? (colchon + 1) / res.totales.base * 100 : null };
    });
    var conDato = porEscano.filter(function (p) { return p.pierdeCon != null; });
    var masCompetitivo = null, masSeguro = null;
    conDato.forEach(function (p) {
      if (!masCompetitivo || p.pierdeCon < masCompetitivo.pierdeCon) masCompetitivo = p;
      if (!masSeguro || p.pierdeCon > masSeguro.pierdeCon) masSeguro = p;
    });
    return { porEscano: porEscano, masCompetitivo: masCompetitivo, masSeguro: masSeguro };
  }

  /**
   * Trasvase: mínimo de votos que la lista `aId` tendría que quitarle a `deId`
   * para ganar un escaño más (el total de votos no cambia). null si no alcanza.
   */
  function trasvaseMinimo(esc, deId, aId, resultado) {
    var res = resultado || asignarEscanos(esc);
    if (!res.ok || deId === aId) return null;
    var busq = prepararBusqueda(esc);
    var iDe = busq.indice[deId], iA = busq.indice[aId];
    if (iDe == null || iA == null) return null;
    var objetivo = res.listas[iA].escanos + 1;
    if (objetivo > res.escanos) return null;
    var vDe = busq.votos[iDe], vA = busq.votos[iA];
    if (vDe < 1) return null;
    function reparto(x) {
      busq.votos[iDe] = vDe - x; busq.votos[iA] = vA + x;
      var r = repartoRapido(busq.ctx, busq.votos);
      busq.votos[iDe] = vDe; busq.votos[iA] = vA;
      return r;
    }
    function pred(x) { return reparto(x)[iA] >= objetivo; }
    if (!pred(vDe)) return null;
    var x = primerVerdadero(1, vDe, pred);
    var antes = res.listas.map(function (l) { return l.escanos; });
    var desp = reparto(x);
    return { deId: deId, aId: aId, votos: x, escanosDespues: desp[iA], cambios: cambiosDeEscanos(esc, antes, desp) };
  }

  /**
   * Menor número de votos con el que la lista obtiene al menos k escaños, con las
   * demás fijas (el "punto de quiebre" del escaño k). null si es inalcanzable.
   */
  function votosMinimosPara(esc, listaId, k) {
    if (!validarEscenario(esc).ok) return null;
    var busq = prepararBusqueda(esc);
    var idx = busq.indice[listaId];
    if (idx == null) return null;
    return umbralDeVotos(busq, idx, k);
  }

  /**
   * Votos adicionales con los que una lista que hoy está bajo el umbral lo alcanza
   * (con las demás fijas). Devuelve 0 si ya lo alcanza y null si no tiene sentido.
   */
  function votosParaAlcanzarUmbral(esc, listaId) {
    if (!validarEscenario(esc).ok) return null;
    var busq = prepararBusqueda(esc);
    var idx = busq.indice[listaId];
    if (idx == null) return null;
    var ctx = busq.ctx;
    var v = busq.votos[idx];
    var resto = ctx.extraBase;
    busq.votos.forEach(function (x, i) { if (i !== idx) resto += x; });
    function alcanza(V) { return V > 0 && superaUmbral(V, resto + V, ctx.tMill); }
    if (alcanza(v)) return 0;
    var lo = v, paso = 1;
    for (;;) {
      var hi = v + paso;
      if (hi > LIMITE_BUSQUEDA) return null;
      if (alcanza(hi)) return primerVerdadero(lo + 1, hi, alcanza) - v;
      lo = hi;
      paso *= 2;
    }
  }

  /* --------------------------------------------------------------------------
   * 10. SENSIBILIDAD
   * ------------------------------------------------------------------------ */

  /**
   * Escaños de una lista en función de sus votos, entre (votos + desde) y
   * (votos + hasta), con las demás listas fijas. Devuelve los tramos y los puntos
   * de quiebre exactos (el menor número de votos con el que cambia el resultado).
   */
  function calcularSensibilidad(esc, listaId, rango) {
    if (!validarEscenario(esc).ok) return null;
    var busq = prepararBusqueda(esc);
    var idx = busq.indice[listaId];
    if (idx == null) return null;
    var v = busq.votos[idx];
    var r = rango || {};
    var lo = Math.max(0, v + (r.desde == null ? -v : Math.round(r.desde)));
    var hi = Math.max(lo, v + (r.hasta == null ? v : Math.round(r.hasta)));
    var sLo = escanosCon(busq, idx, lo);
    var sHi = escanosCon(busq, idx, hi);
    var quiebres = [];
    for (var k = sLo + 1; k <= sHi; k++) {
      (function (kk) {
        var b = primerVerdadero(lo, hi, function (V) { return escanosCon(busq, idx, V) >= kk; });
        var ultimo = quiebres.length ? quiebres[quiebres.length - 1] : null;
        if (ultimo && ultimo.votos === b) { ultimo.escanos = kk; } // salto de varios escaños a la vez
        else quiebres.push({ votos: b, delta: b - v, escanos: kk, escanosAntes: kk - 1 });
      })(k);
    }
    var tramos = [];
    var desde = lo, s = sLo;
    quiebres.forEach(function (q) {
      tramos.push({ votosDesde: desde, votosHasta: q.votos - 1, deltaDesde: desde - v, deltaHasta: q.votos - 1 - v, escanos: s });
      desde = q.votos; s = q.escanos;
    });
    tramos.push({ votosDesde: desde, votosHasta: hi, deltaDesde: desde - v, deltaHasta: hi - v, escanos: s });
    return {
      listaId: listaId, idx: idx, votos: v,
      escanosActuales: escanosCon(busq, idx, v),
      votosMin: lo, votosMax: hi, deltaMin: lo - v, deltaMax: hi - v,
      escanosMin: sLo, escanosMax: sHi,
      tramos: tramos, quiebres: quiebres
    };
  }

  /** Escaños de la lista para una serie de cambios de votos concretos (tabla de sensibilidad / escalera). */
  function escanosPorCambio(esc, listaId, deltas) {
    if (!validarEscenario(esc).ok) return null;
    var busq = prepararBusqueda(esc);
    var idx = busq.indice[listaId];
    if (idx == null) return null;
    var v = busq.votos[idx];
    return deltas.map(function (d) {
      var V = Math.max(0, v + d);
      return { delta: V - v, votos: V, escanos: escanosCon(busq, idx, V) };
    });
  }

  /** Paso "redondo" (1, 2, 5 × 10^n) menor o igual que x. */
  function pasoRedondo(x) {
    if (!(x >= 1)) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(x)));
    var m = x / p;
    return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p;
  }

  /* --------------------------------------------------------------------------
   * 8. COMPARACIÓN DE ESCENARIOS
   * ------------------------------------------------------------------------ */

  /**
   * Compara varios escenarios. `items` = [{ id, nombre, escenario }]. El primero
   * es la referencia de la columna "cambio". Las listas se emparejan por id y,
   * si no coincide, por nombre.
   */
  function compararEscenarios(items) {
    var columnas = items.map(function (it) {
      var r = asignarEscanos(it.escenario);
      return { id: it.id, nombre: it.nombre, escenario: it.escenario, resultado: r, ok: r.ok };
    });
    var filas = [];
    var porId = {}, porNombre = {};
    columnas.forEach(function (col, c) {
      col.escenario.listas.forEach(function (l, i) {
        var clave = normalizarNombre(l.nombre);
        var fila = porId[l.id] || null;
        if (fila && fila.celdas[c]) fila = null; // id repetido dentro del mismo escenario
        if (!fila && clave && porNombre[clave] && !porNombre[clave].celdas[c]) fila = porNombre[clave];
        if (!fila) {
          fila = { clave: l.id, nombre: l.nombre, celdas: columnas.map(function () { return null; }) };
          filas.push(fila);
        }
        if (!porId[l.id]) porId[l.id] = fila;
        if (clave && !porNombre[clave]) porNombre[clave] = fila;
        fila.celdas[c] = {
          votos: l.votos,
          escanos: col.ok ? col.resultado.listas[i].escanos : null,
          pct: col.ok ? col.resultado.listas[i].pct : null,
          elegible: col.ok ? col.resultado.listas[i].elegible : null
        };
      });
    });
    filas.forEach(function (f) {
      var ref = f.celdas[0];
      f.cambios = f.celdas.map(function (c, i) {
        if (i === 0) return null;
        var a = ref && ref.escanos != null ? ref.escanos : 0;
        var b = c && c.escanos != null ? c.escanos : 0;
        return { escanos: b - a, votos: (c ? c.votos : 0) - (ref ? ref.votos : 0) };
      });
      f.difiere = f.cambios.some(function (c) { return c && c.escanos !== 0; });
    });
    return {
      columnas: columnas.map(function (c) {
        return { id: c.id, nombre: c.nombre, ok: c.ok,
                 metodo: c.ok ? c.resultado.metodo : null,
                 escanos: c.escenario.escanos,
                 umbral: Number(c.escenario.umbral) || 0,
                 votos: c.ok ? c.resultado.totales.votosListas : null,
                 errores: c.ok ? [] : c.resultado.bloqueantes };
      }),
      filas: filas,
      hayDiferencias: filas.some(function (f) { return f.difiere; })
    };
  }

  /* --------------------------------------------------------------------------
   * 9. COMPARACIÓN DE MÉTODOS
   * ------------------------------------------------------------------------ */

  /**
   * Reparte el mismo escenario con cada método y explica las diferencias respecto
   * al método del escenario: qué cociente entra o queda fuera en cada caso.
   */
  function compararMetodos(esc, ids) {
    var claves = ids || Object.keys(METODOS);
    var metodos = claves.map(function (id) {
      var copia = {};
      for (var k in esc) copia[k] = esc[k];
      copia.metodo = id;
      return { id: id, nombre: METODOS[id].nombre, nombreLargo: METODOS[id].nombreLargo, serie: METODOS[id].serie, resultado: asignarEscanos(copia) };
    });
    if (metodos.some(function (m) { return !m.resultado.ok; })) {
      return { ok: false, metodos: metodos, filas: [], diferencias: [], hayDiferencias: false };
    }
    var filas = esc.listas.map(function (l, i) {
      var escanos = {};
      metodos.forEach(function (m) { escanos[m.id] = m.resultado.listas[i].escanos; });
      var valores = metodos.map(function (m) { return escanos[m.id]; });
      return { listaId: l.id, idx: i, nombre: l.nombre, votos: l.votos, escanos: escanos,
               difiere: valores.some(function (v) { return v !== valores[0]; }) };
    });

    var ref = null;
    metodos.forEach(function (m) { if (m.id === esc.metodo) ref = m; });
    ref = ref || metodos[0];
    var diferencias = [];
    metodos.forEach(function (otro) {
      if (otro.id === ref.id) return;
      var cambios = [];
      esc.listas.forEach(function (l, i) {
        var a = ref.resultado.listas[i].escanos, b = otro.resultado.listas[i].escanos;
        if (a === b) return;
        // Escaño en disputa: el primero que la lista tiene con un método y no con el otro.
        var k = Math.min(a, b) + 1;
        var dRef = METODOS[ref.id].divisor(k), dOtro = METODOS[otro.id].divisor(k);
        dRef = { n: dRef.n, d: dRef.d, valor: dRef.n / dRef.d };
        dOtro = { n: dOtro.n, d: dOtro.d, valor: dOtro.n / dOtro.d };
        cambios.push({
          listaId: l.id, idx: i, nombre: l.nombre, votos: l.votos,
          conRef: a, conOtro: b, delta: b - a, k: k,
          enRef: { divisor: dRef, cociente: valorCociente(l.votos, dRef), entra: a >= k },
          enOtro: { divisor: dOtro, cociente: valorCociente(l.votos, dOtro), entra: b >= k }
        });
      });
      diferencias.push({
        ref: { id: ref.id, nombre: ref.nombre, corte: ref.resultado.corte.ultimoGanador },
        otro: { id: otro.id, nombre: otro.nombre, corte: otro.resultado.corte.ultimoGanador },
        cambios: cambios,
        iguales: cambios.length === 0
      });
    });
    return {
      ok: true,
      referencia: ref.id,
      metodos: metodos,
      filas: filas,
      diferencias: diferencias,
      hayDiferencias: filas.some(function (f) { return f.difiere; })
    };
  }

  /* --------------------------------------------------------------------------
   * API PÚBLICA
   * ------------------------------------------------------------------------ */
  return {
    VERSION: VERSION,
    METODOS: METODOS,
    REGLAS_DESEMPATE: REGLAS_DESEMPATE,
    BASES_CALCULO: BASES_CALCULO,
    CORTES_VIABILIDAD: CORTES_VIABILIDAD,
    NIVELES_VIABILIDAD: NIVELES_VIABILIDAD,
    MAX_ESCANOS: MAX_ESCANOS,
    MAX_VOTOS: MAX_VOTOS,
    registrarMetodo: registrarMetodo,
    validarEscenario: validarEscenario,
    calcularPorcentajes: calcularPorcentajes,          // 1
    generarCocientes: generarCocientes,                // 2
    ordenarCocientes: ordenarCocientes,                // 3
    asignarEscanos: asignarEscanos,                    // 4
    siguienteEscano: siguienteEscano,                  // 5
    votosAdicionalesNecesarios: votosAdicionalesNecesarios, // 6
    votosParaPerderEscano: votosParaPerderEscano,      // 7
    compararEscenarios: compararEscenarios,            // 8
    compararMetodos: compararMetodos,                  // 9
    calcularSensibilidad: calcularSensibilidad,        // 10
    contarEscanos: contarEscanos,
    analizarMargenes: analizarMargenes,
    seguridadPorEscano: seguridadPorEscano,
    trasvaseMinimo: trasvaseMinimo,
    votosParaAlcanzarUmbral: votosParaAlcanzarUmbral,
    votosMinimosPara: votosMinimosPara,
    escanosPorCambio: escanosPorCambio,
    clasificarViabilidad: clasificarViabilidad,
    pasoRedondo: pasoRedondo,
    normalizarNombre: normalizarNombre,
    // utilidades exactas, expuestas para pruebas y auditoría
    _escanosConVotos: function (esc, listaId, V, generico) {
      var busq = prepararBusqueda(esc);
      var idx = busq.indice[listaId];
      return generico ? escanosConGenerico(busq, idx, V) : escanosCon(busq, idx, V);
    },
    _cmpFraccion: cmpFraccion,
    _cmpCocientes: cmpCocientes,
    _superaUmbral: superaUmbral,
    _umbralEnMillonesimas: umbralEnMillonesimas
  };
});
