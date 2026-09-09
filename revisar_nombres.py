#!/usr/bin/env python3
"""
Revisa qué nombres de territorio NO cruzan con la cartografía.

Recorre todas las bases del proyecto y, para cada una, dice qué provincias,
cantones o parroquias se quedan sin geometría y por lo tanto sin pintar en el
mapa. Cada aviso indica también dónde se corrige.

Uso:
    python revisar_nombres.py
"""
import json
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

DATA = Path(__file__).parent / 'data'

# Mismos alias que js/data.js. Al añadir uno hay que replicarlo en los tres
# scripts de preparación y en js/data.js (ver README, §5).
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
}


def norm(s):
    s = str(s).upper().replace('Ñ', '\x01')
    s = ''.join(c for c in unicodedata.normalize('NFD', s)
                if unicodedata.category(c) != 'Mn')
    s = s.replace('\x01', 'N')
    s = ''.join(c if c.isalnum() else ' ' for c in s)
    return ' '.join(s.split())


def ap(x): return norm(ALIAS_PROV.get(norm(x), norm(x)))
def ac(x): return norm(ALIAS_CANT.get(norm(x), norm(x)))


def cargar(nombre):
    p = DATA / nombre
    if not p.exists():
        return None
    return json.loads(p.read_text(encoding='utf-8'))


# ── Cartografía de referencia ────────────────────────────────────────────
geo_c = cargar('cantones.geojson')
geo_p = cargar('provincias.geojson')
geo_r = cargar('parroquias.geojson')
if not geo_c or not geo_p:
    sys.exit('Faltan las capas provincias.geojson o cantones.geojson en data/.')

PROV = {ap(f['properties']['dpa_despro'].replace('Ð', 'Ñ')) for f in geo_p['features']}
CANT = {(ap(f['properties']['dpa_despro'].replace('Ð', 'Ñ')),
         ac(f['properties']['dpa_descan'].replace('Ð', 'Ñ'))) for f in geo_c['features']}
PARR = defaultdict(set)
URBANA = {}
if geo_r:
    for f in geo_r['features']:
        pr = f['properties']
        k = (ap(pr['dpa_despro'].replace('Ð', 'Ñ')), ac(pr['dpa_descan'].replace('Ð', 'Ñ')))
        PARR[k].add(norm(pr['dpa_despar'].replace('Ð', 'Ñ')))
        if str(pr.get('dpa_parroq', '')).endswith('50'):
            URBANA[k] = norm(pr['dpa_despar'].replace('Ð', 'Ñ'))

print(f'Cartografía: {len(PROV)} provincias · {len(CANT)} cantones · '
      f'{sum(len(v) for v in PARR.values())} parroquias\n')

problemas = 0


def avisar(titulo, faltan, donde):
    global problemas
    if not faltan:
        print(f'  \u2713 {titulo}: todo cruza')
        return
    problemas += 1
    print(f'  \u2717 {titulo}: {len(faltan)} sin geometría')
    for x in sorted(faltan)[:12]:
        print(f'      · {x}')
    if len(faltan) > 12:
        print(f'      · … y {len(faltan) - 12} más')
    print(f'    → se corrige en: {donde}')


# ── 1 · Preinscritos ─────────────────────────────────────────────────────
print('1 · preinscritos.xlsx')
try:
    import pandas as pd
    df = pd.read_excel(DATA / 'preinscritos.xlsx', dtype=str)
    faltan = set()
    for _, r in df.iterrows():
        p, c = ap(r['PROVINCIA']), ac(r.get('CANTON') or '')
        if not c:
            if p not in PROV:
                faltan.add(f"provincia {r['PROVINCIA']}")
        elif (p, c) not in CANT:
            faltan.add(f"{r['PROVINCIA']} / {r['CANTON']}")
    avisar('territorios del Excel', faltan,
           'js/data.js → CONFIG.aliasProvincia / CONFIG.aliasCanton')
except ImportError:
    print('  (requiere pandas para leer el Excel)')
except Exception as e:
    print(f'  no se pudo revisar: {e}')

# ── 2 · Electores ────────────────────────────────────────────────────────
print('\n2 · electores.json')
el = cargar('electores.json')
if el:
    avisar('provincias', {k for k in el['provincias'] if k not in PROV},
           'preparar_electores.py → ALIAS_PROV')
    avisar('cantones', {k for k in el['cantones']
                        if tuple(k.split('|')) not in CANT},
           'preparar_electores.py → ALIAS_CANT')
else:
    print('  (no está)')

# ── 3 · Grupos etarios ───────────────────────────────────────────────────
print('\n3 · etario2027.json')
et = cargar('etario2027.json')
if et:
    avisar('provincias', {k for k in et['provincias'] if k not in PROV},
           'preparar_secciones.py → ALIAS_PROV')
    avisar('cantones', {k for k in et['cantones']
                        if tuple(k.split('|')) not in CANT},
           'preparar_secciones.py → ALIAS_CANT')
else:
    print('  (no está)')

# ── 4 · Histórico electoral ──────────────────────────────────────────────
print('\n4 · historico.json')
h = cargar('historico.json')
if h:
    faltanP, faltanC, sinParr, aUrbana, exacta = set(), set(), set(), 0, 0
    vistos = set()
    for dig in h['votos']:
        for a, p, c, r, o, v in h['votos'][dig]:
            k = (h['provincias'][p], h['cantones'][c], h['parroquias'][r])
            if k in vistos:
                continue
            vistos.add(k)
            if k[0] not in PROV:
                faltanP.add(k[0])
            if (k[0], k[1]) not in CANT:
                faltanC.add(f'{k[0]} / {k[1]}')
                continue
            ps = PARR.get((k[0], k[1]), set())
            if not ps:
                continue
            if k[2] in ps or k[2].replace(' ', '') in {x.replace(' ', '') for x in ps}:
                exacta += 1
            elif (k[0], k[1]) in URBANA:
                aUrbana += 1
            else:
                sinParr.add(' / '.join(k))
    avisar('provincias', faltanP, 'preparar_secciones.py → ALIAS_PROV')
    avisar('cantones', faltanC, 'preparar_secciones.py → ALIAS_CANT')
    print(f'  \u2139 parroquias: {exacta} cruzan por nombre, {aUrbana} se pliegan '
          f'al polígono urbano del cantón')
    avisar('parroquias sin destino', sinParr,
           'no hay polígono urbano en ese cantón: revisar parroquias.geojson')
else:
    print('  (no está)')

# ── 5 · Resultados 2023 ──────────────────────────────────────────────────
print('\n5 · resultados2023.json')
rs = cargar('resultados2023.json')
if rs:
    faltan = set()
    for dig in rs['registros']:
        for p, c, ca, o, v in rs['registros'][dig]:
            par = (rs['provincias'][p], rs['cantones'][c])
            if par not in CANT:
                faltan.add(' / '.join(par))
    avisar('cantones', faltan, 'preparar_resultados.py → ALIAS_CANT')
else:
    print('  (no está)')

print('\n' + ('\u2713 Todas las bases cruzan por completo'
              if not problemas else
              f'\u26a0 {problemas} punto(s) con territorios sin geometría'))
