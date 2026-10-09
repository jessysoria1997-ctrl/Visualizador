#!/usr/bin/env python3
"""
Genera data/historico_dignidades.json: CONCEJALES URBANOS, CONCEJALES RURALES
y VOCALES DE JUNTAS PARROQUIALES de todo el país, 2004–2023, para la sección
Histórico electoral, con la misma lógica que data/historico.json
(preparar_secciones.py):

  · votos por organización política a nivel parroquia: suma de los votos de
    sus candidatos. En 2009 la base guarda aparte el voto en plancha
    (OP_VOTOS_EN_PLANCHA, repetido en la fila de cada candidato de la lista):
    cada voto en plancha es un voto para cada candidato de la lista, así que
    el total de un candidato es VOTOS + OP_VOTOS_EN_PLANCHA. En los demás años
    esa columna es cero porque VOTOS ya lo incluye (se comprueba: con la
    plancha sumada, los votos de los candidatos de una misma lista se
    parecen tanto como en 2004, 2014 y 2019);
  · nulos y blancos desduplicados: en la base se repiten en cada fila de
    candidato, así que se toma un solo valor por unidad electoral (año,
    dignidad, provincia, cantón, parroquia, circunscripción y sexo) y después
    se suma. Cuatro parroquias urbanas (Tarqui en Guayaquil, Milagro, Eloy
    Alfaro en Durán y Quevedo) están repartidas entre dos circunscripciones:
    desde 2019 la base lo dice en CIRCUNSCRIPCION_CODIGO; en 2014 no, pero
    cada circunscripción trae sus propios nulos y blancos, así que se cuenta
    una vez cada par distinto de nulos y blancos de la unidad;
  · postulantes: candidaturas distintas (CANDIDATO_CODIGO) por territorio.

Territorios
  Provincia y cantón llevan los mismos alias que historico.json, más cuatro
  grafías propias de esta base (Joya de los Sagchas, Olmedo/Puca, Sta.
  Isabel, Tiwinza). La parroquia se cruza con la capa parroquial
  (data/parroquias.geojson) como lo hace el tablero —por su nombre o por los
  nombres del CNE que guarda cada polígono—; si no cruza, se prueba con los
  nombres truncados o abreviados de la base (en 2004 los nombres se cortan a
  18 letras: «OCTAVIO CORDERO P» → «OCTAVIO CORDERO PALACIOS»; «SN» → «SAN»,
  «STA» → «SANTA», etc.) y con la tabla ALIAS_PARROQUIA. Lo que no cruza se
  deja como viene: cuenta en el cantón y la provincia, pero no tiene polígono
  en el mapa parroquial (las parroquias urbanas antiguas de Quito, por
  ejemplo, igual que en historico.json). Ningún voto se cambia ni se mueve de
  cantón: solo se unifican nombres.

Dignidades
  La base distingue CONCEJALES URBANOS, CONCEJALES RURALES y VOCALES DE
  JUNTA(S) PARROQUIAL(ES), pero solo escribe DIGNIDAD_NOMBRE desde 2019. Para
  los años anteriores se usa DIGNIDAD_CODIGO: la equivalencia código → nombre
  se toma de las filas que sí traen el nombre, y el script se detiene si un
  código aparece con dos dignidades distintas.

Réplica de concejales
  Si en un año la base solo trae una de las dos dignidades de concejales (en
  2004 solo existe el código de concejales urbanos, elegidos entonces en una
  sola lista para todo el cantón), la que falta se crea copiando, solo para
  ese año, los registros de la que sí existe: mismos territorios,
  organizaciones, votos, nulos, blancos y postulantes. Solo en los cantones
  que eligen esa dignidad en algún otro año: a los que no tienen parroquias
  rurales no se les crean concejales rurales. Los años en que existen las dos
  no se tocan. El archivo anota qué años son réplica ('replicas') y el tablero
  lo advierte.

Formato (compacto, como historico.json: los nombres van en tablas y cada
registro los cita por posición)
    provincias, cantones, parroquias, organizaciones   tablas de nombres
    votos       {dignidad: [[año, prov, cantón, parroquia, organización, votos]]}
    nuloblanco  {dignidad: [[año, prov, cantón, parroquia, nulos, blancos]]}
    postulantes {dignidad: {pais: {año: n}, prov: [[año, prov, n]],
                            cant: [[año, prov, cantón, n]],
                            parr: [[año, prov, cantón, parroquia, n]]}}
    replicas    {dignidad: [años copiados de la otra dignidad de concejales]}

Uso
    python preparar_historico_dignidades.py RUTA/Base_Consolidada_Concejales_Vocales_2004_2023.sav

Requiere pandas y pyreadstat (pip install pyreadstat).
"""
import difflib
import json
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

import pandas as pd

BASE = Path(__file__).parent
SALIDA = BASE / 'data' / 'historico_dignidades.json'

ETIQUETAS = {'CONCEJALES_URBANOS': 'Concejales urbanos',
             'CONCEJALES_RURALES': 'Concejales rurales',
             'VOCALES': 'Vocales de juntas parroquiales'}

# Pares que se completan entre sí cuando en un año falta uno de los dos.
PAREJAS = [('CONCEJALES_URBANOS', 'CONCEJALES_RURALES')]

# Mismos alias que preparar_secciones.py (historico.json) y js/data.js.
ALIAS_PROV = {
    'STO DGO TSACHILAS': 'SANTO DOMINGO DE LOS TSACHILAS',
    'SANTO DOMINGO': 'SANTO DOMINGO DE LOS TSACHILAS',
    'STO DOMINGO': 'SANTO DOMINGO DE LOS TSACHILAS',
    'SANTO DOMINGO TSACHILAS': 'SANTO DOMINGO DE LOS TSACHILAS',
}
ALIAS_CANT = {
    'A BAQUERIZO MORENO': 'ALFREDO BAQUERIZO MORENO',
    'CRNL MARCELINO MARIDUENAS': 'CRNEL MARCELINO MARIDUENA',
    'EL EMPALME': 'EMPALME', 'GRAL A ELIZALDE': 'GNRAL ANTONIO ELIZALDE',
    'NOBOL PIEDRAHITA': 'NOBOL', 'YAGUACHI': 'SAN JACINTO DE YAGUACHI',
    'C J AROSEMENA TOLA': 'CARLOS JULIO AROSEMENA TOLA',
    'FCO DE ORELLANA': 'ORELLANA', 'JOYA DE LOS SACHAS': 'LA JOYA DE LOS SACHAS',
    'PUEBLO VIEJO': 'PUEBLOVIEJO', 'RIO VERDE': 'RIOVERDE',
    'URCUQUI': 'SAN MIGUEL DE URCUQUI', 'BANOS': 'BANOS DE AGUA SANTA',
    'PELILEO': 'SAN PEDRO DE PELILEO', 'PILLARO': 'SANTIAGO DE PILLARO',
    'YANZATZA': 'YANTZAZA',
    # Grafías propias de esta base
    'JOYA DE LOS SAGCHAS': 'LA JOYA DE LOS SACHAS',   # 2004
    'OLMEDO PUCA': 'OLMEDO',                          # 2004, Manabí
    'STA ISABEL': 'SANTA ISABEL',                     # 2004
    'TIWINZA': 'TIWINTZA',                            # 2009
}
# Parroquias que las reglas automáticas no alcanzan. (provincia, cantón,
# nombre en la base) → nombre del polígono en la capa parroquial.
ALIAS_PARROQUIA = {
    ('COTOPAXI', 'LA MANA', 'PUCAYACU'): 'PUCAYACO',
    ('ORELLANA', 'ORELLANA', 'PTO FCO DE ORELLANA'): 'EL COCA',   # la ciudad de El Coca
    ('ORELLANA', 'ORELLANA', 'PTO FCO DE ORELLAN'): 'EL COCA',
    ('EL ORO', 'SANTA ROSA', 'JAMBELI TEMBLEQUE'): 'JAMBELI',
    ('LOJA', 'CELICA', 'TNTE MAXIM RODRIGUEZ'): 'TNTE M RODRIGUEZ LOAYZA',
    ('IMBABURA', 'PIMAMPIRO', 'SAN FRANCISCO SIGS'): 'SAN FRANCISCO DE SIGSIPAMBA',
    ('AZUAY', 'PAUTE', 'BULAN JV IZQUIERDO'): 'BULAN J VICTOR IZQUIERDO',
}
ABREVIATURAS = {'SN': 'SAN', 'STA': 'SANTA', 'STO': 'SANTO', 'PTO': 'PUERTO',
                'FCO': 'FRANCISCO', 'GRAL': 'GENERAL', 'CRNL': 'CORONEL',
                'CRNEL': 'CORONEL', 'CNEL': 'CORONEL', 'DR': 'DOCTOR',
                'STGO': 'SANTIAGO'}
ARTICULOS = {'EL', 'LA', 'LOS', 'LAS'}


def norm(s):
    """Réplica de normalizarTexto() de js/data.js."""
    s = str(s if s is not None else '').upper().replace('Ñ', '\x01')
    s = ''.join(c for c in unicodedata.normalize('NFD', s)
                if unicodedata.category(c) != 'Mn')
    s = s.replace('\x01', 'N')
    s = ''.join(c if c.isalnum() else ' ' for c in s)
    return ' '.join(s.split())


def dignidad_de(nombre):
    t = norm(nombre)
    if not t:
        return None
    if 'CONCEJAL' in t and 'URBAN' in t:
        return 'CONCEJALES_URBANOS'
    if 'CONCEJAL' in t and 'RURAL' in t:
        return 'CONCEJALES_RURALES'
    if 'VOCAL' in t:
        return 'VOCALES'
    raise SystemExit(f'Dignidad desconocida en la base: {nombre!r}')


# ── Cruce de parroquias con la capa ─────────────────────────────────────────

def cargar_capa():
    capa = json.loads((BASE / 'data' / 'parroquias.geojson').read_text(encoding='utf-8'))
    por_cant, estado = defaultdict(list), {}
    for f in capa['features']:
        p = f['properties']
        prov, cant, clave = norm(p['dpa_despro']), norm(p['dpa_descan']), norm(p['dpa_despar'])
        nombres = {clave} | {norm(x) for x in str(p.get('nombres_cne') or '').split('|') if norm(x)}
        por_cant[(prov, cant)].append((clave, nombres))
        estado[(prov, cant, clave)] = norm(p.get('estado', ''))
    return por_cant, estado


def expandir(s):
    return ' '.join(ABREVIATURAS.get(t, t) for t in s.split())


def sin_articulos(s):
    return ' '.join(t for t in s.split() if t not in ARTICULOS)


def prefijos(corto, largo):
    """Cada palabra de «corto» es el comienzo de la palabra de «largo» en su lugar."""
    a, b = corto.split(), largo.split()
    return 0 < len(a) <= len(b) and all(b[i].startswith(a[i]) for i in range(len(a)))


def cruza_directo(poligonos, parr):
    """Lo mismo que parroquiaGeografica() en js/secciones.js."""
    for clave, _ in poligonos:
        if clave == parr:
            return clave
    for clave, _ in poligonos:
        if clave.replace(' ', '') == parr.replace(' ', ''):
            return clave
    for clave, nombres in poligonos:
        if parr in nombres:
            return clave
    return None


def cruza_aproximado(poligonos, parr):
    """Nombres truncados, abreviados o con otra grafía. Devuelve (clave, regla)."""
    e = expandir(parr)
    reglas = defaultdict(set)
    for clave, nombres in poligonos:
        for n in nombres:
            ne = expandir(n)
            if e == ne:
                reglas['abreviatura'].add(clave)
            if sin_articulos(e) and sin_articulos(e) == sin_articulos(ne):
                reglas['artículo'].add(clave)
            if len(e) >= 12 and ne.startswith(e):
                reglas['truncado'].add(clave)
            if prefijos(e, ne):
                reglas['iniciales'].add(clave)
    for regla in ['abreviatura', 'artículo', 'truncado', 'iniciales']:
        if len(reglas[regla]) == 1:
            return next(iter(reglas[regla])), regla
    # Parecido: el mejor candidato tiene que destacar claramente.
    puntos = sorted(((max(difflib.SequenceMatcher(None, e, expandir(n)).ratio() for n in nombres), clave)
                     for clave, nombres in poligonos), reverse=True)
    if puntos and puntos[0][0] >= 0.86 and (len(puntos) == 1 or puntos[0][0] - puntos[1][0] >= 0.08):
        return puntos[0][1], f'parecido {puntos[0][0]:.2f}'
    return None, None


def unificar_parroquias(df, por_cant):
    """Nombre de parroquia de cada fila, unificado con la capa cuando se puede."""
    combos = df[['ANIO', 'PROVK', 'CANTK', 'PARR0']].drop_duplicates()
    nuevo, informe = {}, Counter()
    sin_cruce, cambios = [], []
    for r in combos.itertuples(index=False):
        k = (r.ANIO, r.PROVK, r.CANTK, r.PARR0)
        poligonos = por_cant.get((r.PROVK, r.CANTK))
        alias = ALIAS_PARROQUIA.get((r.PROVK, r.CANTK, r.PARR0))
        if alias:
            nuevo[k] = alias
            informe['tabla ALIAS_PARROQUIA'] += 1
            cambios.append((k, alias, 'alias'))
        elif not poligonos:
            nuevo[k] = r.PARR0                 # cantón de una división anterior
            informe['cantón sin polígono hoy'] += 1
            sin_cruce.append(k)
        elif cruza_directo(poligonos, r.PARR0):
            nuevo[k] = r.PARR0
            informe['cruce directo'] += 1
        else:
            clave, regla = cruza_aproximado(poligonos, r.PARR0)
            if clave:
                nuevo[k] = clave
                informe[regla.split()[0]] += 1
                cambios.append((k, clave, regla))
            else:
                nuevo[k] = r.PARR0
                informe['sin polígono'] += 1
                sin_cruce.append(k)
    df['PARRK'] = [nuevo[k] for k in zip(df['ANIO'], df['PROVK'], df['CANTK'], df['PARR0'])]
    return informe, cambios, sin_cruce


# ── Principal ───────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    import pyreadstat
    df, _ = pyreadstat.read_sav(sys.argv[1])
    print(f'  {len(df):,} filas')

    # ── Dignidad: por nombre cuando existe, si no por código ────────────────
    df['DIG_N'] = df['DIGNIDAD_NOMBRE'].map(dignidad_de)
    por_codigo = {}
    for cod, dig in df.loc[df['DIG_N'].notna(), ['DIGNIDAD_CODIGO', 'DIG_N']] \
                      .drop_duplicates().itertuples(index=False):
        if por_codigo.get(cod, dig) != dig:
            raise SystemExit(f'El código {cod} aparece como {por_codigo[cod]} y como {dig}')
        por_codigo[cod] = dig
    sin = df['DIG_N'].isna()
    df.loc[sin, 'DIG_N'] = df.loc[sin, 'DIGNIDAD_CODIGO'].map(por_codigo)
    if df['DIG_N'].isna().any():
        faltan = sorted(df.loc[df['DIG_N'].isna(), 'DIGNIDAD_CODIGO'].unique())
        raise SystemExit(f'Códigos de dignidad sin nombre en ninguna fila: {faltan}')
    print('  códigos → dignidad:', {int(k): v for k, v in sorted(por_codigo.items())})

    df['ANIO'] = df['FECHA_ELECCION'].astype(int)
    df['PROVK'] = df['PROVINCIA_NOMBRE'].map(lambda x: norm(ALIAS_PROV.get(norm(x), norm(x))))
    df['CANTK'] = df['CANTON_NOMBRE'].map(lambda x: norm(ALIAS_CANT.get(norm(x), norm(x))))
    df['PARR0'] = df['PARROQUIA_NOMBRE'].map(norm)
    # Igual que en historico.json: el nombre tal como viene, sin espacios en
    # los extremos, para que coincida con las organizaciones ya existentes.
    df['OPN'] = df['OP_NOMBRE'].astype(str).str.strip()
    for c in ['VOTOS', 'VOTOS_NULOS', 'VOTOS_BLANCOS', 'OP_VOTOS_EN_PLANCHA']:
        df[c] = pd.to_numeric(df[c], errors='coerce').fillna(0).astype(int)
    plancha = df.groupby('ANIO')['OP_VOTOS_EN_PLANCHA'].sum()
    print('  votos en plancha sumados a sus candidatos:',
          {int(a): int(v) for a, v in plancha.items() if v})
    df['VOTOS'] = df['VOTOS'] + df['OP_VOTOS_EN_PLANCHA']

    por_cant, estado = cargar_capa()
    informe, cambios, sin_cruce = unificar_parroquias(df, por_cant)
    print('  parroquias (año × parroquia):', dict(informe))

    TERR = ['ANIO', 'DIG_N', 'PROVK', 'CANTK', 'PARRK']

    # ── Votos por organización, a nivel parroquia ───────────────────────────
    votos = df.groupby(TERR + ['OPN'], sort=True)['VOTOS'].sum().reset_index()

    # ── Nulos y blancos: un valor por unidad electoral, luego suma ─────────
    unidad = ['ANIO', 'DIGNIDAD_CODIGO', 'PROVINCIA_CODIGO', 'CANTON_CODIGO',
              'PARROQUIA_CODIGO', 'CIRCUNSCRIPCION_CODIGO', 'SEXO']
    columnas = list(dict.fromkeys(unidad + ['VOTOS_NULOS', 'VOTOS_BLANCOS'] + TERR))
    uni = df[columnas].drop_duplicates(unidad + ['VOTOS_NULOS', 'VOTOS_BLANCOS'])
    repartidas = uni.groupby(unidad, dropna=False).size()
    print(f'  {len(repartidas):,} unidades electorales; '
          f'{int((repartidas > 1).sum())} con dos circunscripciones sin código (2014)')
    nb = uni.groupby(TERR, sort=True).agg(NUL=('VOTOS_NULOS', 'sum'),
                                          BLA=('VOTOS_BLANCOS', 'sum')).reset_index()

    # ── Postulantes: candidaturas distintas en cada nivel ───────────────────
    # 2023 no trae candidatos (solo votos por organización): ese año queda
    # sin cifra en lugar de mostrar un cero que no es real.
    cand = df[df['CANDIDATO_CODIGO'].notna()]
    postulantes = {}
    for dig, d in cand.groupby('DIG_N'):
        postulantes[dig] = {
            'pais': {a: int(g['CANDIDATO_CODIGO'].nunique()) for a, g in d.groupby('ANIO')},
            'prov': {(a, p): int(g['CANDIDATO_CODIGO'].nunique())
                     for (a, p), g in d.groupby(['ANIO', 'PROVK'])},
            'cant': {(a, p, c): int(g['CANDIDATO_CODIGO'].nunique())
                     for (a, p, c), g in d.groupby(['ANIO', 'PROVK', 'CANTK'])},
            'parr': {(a, p, c, r): int(g['CANDIDATO_CODIGO'].nunique())
                     for (a, p, c, r), g in d.groupby(['ANIO', 'PROVK', 'CANTK', 'PARRK'])},
        }

    dignidades = [d for d in ETIQUETAS if d in set(df['DIG_N'])]
    reg_votos = {d: [(int(r.ANIO), r.PROVK, r.CANTK, r.PARRK, r.OPN, int(r.VOTOS))
                     for r in votos[votos['DIG_N'] == d].itertuples()]
                 for d in dignidades}
    reg_nb = {d: [(int(r.ANIO), r.PROVK, r.CANTK, r.PARRK, int(r.NUL), int(r.BLA))
                  for r in nb[nb['DIG_N'] == d].itertuples()]
              for d in dignidades}

    # ── Réplica: solo en el año en que falta una de las dos dignidades ─────
    # Y solo en los cantones que sí eligen la dignidad que falta en algún otro
    # año: un cantón sin parroquias rurales (Durán, Huaquillas…) nunca tuvo
    # concejales rurales y no se le crean. Los cantones que en ese año
    # pertenecían a otra provincia (Santa Elena y Salinas en Guayas, Santo
    # Domingo en Pichincha, en 2004) se buscan por su nombre.
    replicas = {}
    for a_dig, b_dig in PAREJAS:
        for anio in sorted(set(df['ANIO'])):
            tiene = {d: any(f[0] == anio for f in reg_votos.get(d, [])) for d in (a_dig, b_dig)}
            if tiene[a_dig] == tiene[b_dig]:
                continue                      # existen las dos (o ninguna): no se toca
            origen, destino = (a_dig, b_dig) if tiene[a_dig] else (b_dig, a_dig)
            con_destino = {(f[1], f[2]) for f in reg_votos.get(destino, []) if f[0] != anio}
            con_datos = {(f[1], f[2]) for d in (a_dig, b_dig) for f in reg_votos.get(d, []) if f[0] != anio}
            nombres_destino = {c for _, c in con_destino}

            def elige(p, c):
                if (p, c) in con_datos:           # el cantón sigue en su provincia
                    return (p, c) in con_destino
                return c in nombres_destino       # cambió de provincia después

            cantones = {(f[1], f[2]) for f in reg_votos[origen] if f[0] == anio}
            si = {k for k in cantones if elige(*k)}
            reg_votos.setdefault(destino, [])
            reg_nb.setdefault(destino, [])
            reg_votos[destino] += [f for f in reg_votos[origen] if f[0] == anio and (f[1], f[2]) in si]
            reg_nb[destino] += [f for f in reg_nb[origen] if f[0] == anio and (f[1], f[2]) in si]
            # Postulantes: cada candidatura es de un solo cantón, así que los de
            # la provincia y el país son la suma de los de sus cantones.
            po = postulantes.get(origen, {})
            pd_ = postulantes.setdefault(destino, {'pais': {}, 'prov': {}, 'cant': {}, 'parr': {}})
            cant = {k: v for k, v in po.get('cant', {}).items() if k[0] == anio and k[1:3] in si}
            pd_['cant'].update(cant)
            pd_['parr'].update({k: v for k, v in po.get('parr', {}).items()
                                if k[0] == anio and k[1:3] in si})
            prov = Counter()
            for (a, p_, c_), v in cant.items():
                prov[(a, p_)] += v
            pd_['prov'].update(prov)
            pd_['pais'][anio] = sum(cant.values())
            assert all(po['prov'][k] == sum(v for (a, p_, c_), v in po['cant'].items() if (a, p_) == k)
                       for k in po.get('prov', {}) if k[0] == anio), \
                'hay candidaturas en más de un cantón: los postulantes no se pueden sumar'
            replicas.setdefault(destino, []).append(anio)
            print(f'  réplica: {destino} {anio} ← {origen} {anio} en {len(si)} de {len(cantones)} cantones '
                  f'({sum(1 for f in reg_votos[destino] if f[0] == anio):,} registros); '
                  f'sin {destino.split("_")[-1].lower()} en ningún otro año: '
                  f'{", ".join(f"{c.title()} ({p.title()})" for p, c in sorted(cantones - si))}')
    for d in reg_votos:
        reg_votos[d].sort(key=lambda f: (f[0], f[1], f[2], f[3], f[4]))
        reg_nb[d].sort(key=lambda f: (f[0], f[1], f[2], f[3]))

    # ── Control: cada dignidad de concejales, en sus parroquias ─────────────
    # Urbanos en parroquias urbanas y rurales en rurales (propiedad «estado» de
    # la capa parroquial). Lo que no coincide se informa y se conserva: son
    # parroquias que la capa clasifica distinto que la base electoral.
    lista_unica = {a for anios_r in replicas.values() for a in anios_r}
    tipo = {'CONCEJALES_URBANOS': 'URBANA', 'CONCEJALES_RURALES': 'RURAL', 'VOCALES': 'RURAL'}
    for d, t in tipo.items():
        otras = Counter()
        for f in reg_votos.get(d, []):
            e = estado.get((f[1], f[2], f[3]))
            if f[0] not in lista_unica and e and e != t:
                otras[(f[1], f[2], f[3], e)] += f[5]
        if otras:
            print(f'  {d}: votos en parroquias que la capa marca como no {t.lower()}:')
            for (p, c, r, e), v in sorted(otras.items()):
                print(f'     {p} · {c} · {r} ({e}): {v:,} votos')

    # ── Tablas de nombres y registros por posición ──────────────────────────
    dignidades = [d for d in ETIQUETAS if reg_votos.get(d)]
    provs = sorted({f[1] for d in dignidades for f in reg_votos[d] + reg_nb[d]})
    cants = sorted({f[2] for d in dignidades for f in reg_votos[d] + reg_nb[d]})
    parrs = sorted({f[3] for d in dignidades for f in reg_votos[d] + reg_nb[d]})
    orgs = sorted({f[4] for d in dignidades for f in reg_votos[d]})
    for d in dignidades:
        for nivel in ['prov', 'cant', 'parr']:
            for k in postulantes.get(d, {}).get(nivel, {}):
                assert k[1] in provs and (nivel == 'prov' or k[2] in cants) \
                    and (nivel != 'parr' or k[3] in parrs), k
    iP = {v: i for i, v in enumerate(provs)}
    iC = {v: i for i, v in enumerate(cants)}
    iR = {v: i for i, v in enumerate(parrs)}
    iO = {v: i for i, v in enumerate(orgs)}

    def post(d):
        n = postulantes[d]
        return {
            'pais': {str(a): v for a, v in sorted(n['pais'].items())},
            'prov': [[a, iP[p], v] for (a, p), v in sorted(n['prov'].items())],
            'cant': [[a, iP[p], iC[c], v] for (a, p, c), v in sorted(n['cant'].items())],
            'parr': [[a, iP[p], iC[c], iR[r], v] for (a, p, c, r), v in sorted(n['parr'].items())],
        }

    salida = {
        'fuente': Path(sys.argv[1]).name,
        'etiquetas': {d: ETIQUETAS[d] for d in dignidades},
        'provincias': provs, 'cantones': cants, 'parroquias': parrs, 'organizaciones': orgs,
        'votos': {d: [[a, iP[p], iC[c], iR[r], iO[o], v] for a, p, c, r, o, v in reg_votos[d]]
                  for d in dignidades},
        'nuloblanco': {d: [[a, iP[p], iC[c], iR[r], n, b] for a, p, c, r, n, b in reg_nb[d]]
                       for d in dignidades},
        'postulantes': {d: post(d) for d in dignidades if d in postulantes},
        'replicas': replicas,
    }

    # ── Informe ─────────────────────────────────────────────────────────────
    for d in dignidades:
        filas = reg_votos[d]
        print(f'  {d}: {len(filas):,} filas de votos · {len({(f[1], f[2]) for f in filas})} cantones · '
              f'{len({(f[1], f[2], f[3]) for f in filas})} parroquias')
        for a in sorted({f[0] for f in filas}):
            v = sum(f[5] for f in filas if f[0] == a)
            n = sum(f[4] for f in reg_nb[d] if f[0] == a)
            b = sum(f[5] for f in reg_nb[d] if f[0] == a)
            p = postulantes.get(d, {}).get('pais', {}).get(a, '—')
            marca = '  (réplica)' if a in replicas.get(d, []) else ''
            print(f'     {a}: válidos {v:>10,} · nulos {n:>9,} · blancos {b:>9,} · postulantes {p}{marca}')
    print(f'  nombres unificados con la capa ({len(cambios)}):')
    for (a, p, c, r0), clave, regla in cambios:
        print(f'     {a} {p} · {c}: {r0} → {clave}  [{regla}]')
    print(f'  sin polígono en el mapa parroquial ({len(sin_cruce)}; cuentan en su cantón y provincia):')
    for a, p, c, r0 in sin_cruce:
        print(f'     {a} {p} · {c}: {r0}')

    SALIDA.write_text(json.dumps(salida, ensure_ascii=False, separators=(',', ':')),
                      encoding='utf-8')
    print(f'  → {SALIDA}  ({SALIDA.stat().st_size / 1024:.0f} KB)')


if __name__ == '__main__':
    main()
