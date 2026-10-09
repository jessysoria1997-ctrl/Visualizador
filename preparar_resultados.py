#!/usr/bin/env python3
"""
Prepara los resultados electorales de 2023 para el dashboard.

De los 53 MB del TSV original solo se conserva lo que el tablero necesita:
los votos de cada candidato agregados POR PARROQUIA, únicamente del año 2023.
El resto de años se descarta aquí y nunca llega al navegador.

La parroquia se guarda ya emparejada con su polígono de data/parroquias.geojson
—misma regla que js/data.js: nombre exacto, nombre sin espacios y, si no,
la lista «nombres_cne» del polígono—, de modo que el navegador filtra
comparando claves y no nombres. Las parroquias del CNE que no tienen polígono
guardan -1: sus votos siguen contando en el cantón y en la provincia, pero no
se pueden desglosar en el mapa parroquial. Sumar las parroquias de un cantón
devuelve exactamente el total de ese cantón; aquí no se reparte ni se ajusta
ningún voto.

Salida: data/resultados2023.json
"""
import json
import unicodedata
from pathlib import Path

import pandas as pd

ORIGEN = '/mnt/user-data/uploads/SECCIONALES_ALCALDE.csv'
DESTINO = Path('CARPETA_ELECTORAL/data/resultados2023.json')
CAPA_PARR = Path('CARPETA_ELECTORAL/data/parroquias.geojson')
ANIO = '2023'

# Mismo criterio de normalización y mismos alias que js/data.js, para que las
# claves de territorio encajen con las que ya usa el tablero.
ALIAS_PROV = {
    'STO DGO TSACHILAS': 'SANTO DOMINGO DE LOS TSACHILAS',
    'SANTO DOMINGO': 'SANTO DOMINGO DE LOS TSACHILAS',
    'STO DOMINGO': 'SANTO DOMINGO DE LOS TSACHILAS',
    'SANTO DOMINGO TSACHILAS': 'SANTO DOMINGO DE LOS TSACHILAS',
}
ALIAS_CANT = {
    'A BAQUERIZO MORENO': 'ALFREDO BAQUERIZO MORENO',
    'CRNL MARCELINO MARIDUENAS': 'CRNEL MARCELINO MARIDUENA',
    'EL EMPALME': 'EMPALME',
    'GRAL A ELIZALDE': 'GNRAL ANTONIO ELIZALDE',
    'NOBOL PIEDRAHITA': 'NOBOL',
    'YAGUACHI': 'SAN JACINTO DE YAGUACHI',
    'C J AROSEMENA TOLA': 'CARLOS JULIO AROSEMENA TOLA',
    'FCO DE ORELLANA': 'ORELLANA',
    'JOYA DE LOS SACHAS': 'LA JOYA DE LOS SACHAS',
    'PUEBLO VIEJO': 'PUEBLOVIEJO',
    'RIO VERDE': 'RIOVERDE',
    'URCUQUI': 'SAN MIGUEL DE URCUQUI',
    'BANOS': 'BANOS DE AGUA SANTA',
    'PELILEO': 'SAN PEDRO DE PELILEO',
    'PILLARO': 'SANTIAGO DE PILLARO',
    'YANZATZA': 'YANTZAZA',
}

# Homologación de dignidad pedida: se aplica solo a la salida, el TSV original
# no se toca.
DIGNIDADES = {
    'PREFECTO': ('PREFECTOS', 'Prefecto'),
    'ALCALDE': ('ALCALDES', 'Alcalde'),
}


def norm(s):
    s = str(s).upper().replace('Ñ', '\x01')
    s = ''.join(c for c in unicodedata.normalize('NFD', s)
                if unicodedata.category(c) != 'Mn')
    s = s.replace('\x01', 'N')
    s = ''.join(c if c.isalnum() else ' ' for c in s)
    return ' '.join(s.split())


def clasificar(dignidad):
    t = norm(dignidad)
    for clave, (ident, _) in DIGNIDADES.items():
        if clave in t:
            return ident
    return None


print('Leyendo el TSV original…')
df = pd.read_csv(ORIGEN, sep='\t', dtype=str, low_memory=False)
print(f'  {len(df):,} filas, años {sorted(df["AÑO"].unique())}')

d = df[df['AÑO'] == ANIO].copy()
print(f'  {len(d):,} filas del año {ANIO}')
assert set(d['AÑO'].unique()) == {ANIO}, 'se coló otro año'

d['DIG'] = d['DIGNIDAD_NOMBRE'].map(clasificar)
sin_clasificar = d['DIG'].isna().sum()
print(f'  dignidades: {d["DIG"].value_counts().to_dict()}  (sin clasificar: {sin_clasificar})')

d['VOTOS'] = pd.to_numeric(d['CANDIDATO_VOTOS'], errors='coerce').fillna(0).astype(int)
d['PROVK'] = d['PROVINCIA_NOMBRE'].map(lambda x: ALIAS_PROV.get(norm(x), norm(x)))
d['PROVK'] = d['PROVK'].map(norm)
d['CANTK'] = d['CANTON_NOMBRE'].map(lambda x: ALIAS_CANT.get(norm(x), norm(x)))
d['CANTK'] = d['CANTK'].map(norm)
d['CAND'] = d['CANDIDATO_NOMBRE'].str.strip()
d['OP'] = d['OP_NOMBRE'].str.strip()
d['PARRCNE'] = d['PARROQUIA_NOMBRE'].map(norm)

# ── La parroquia del CNE, emparejada con su polígono ─────────────────────
# Misma regla que resolverParroquia() en js/data.js. El tablero filtra por la
# clave del polígono, así que el emparejamiento se hace aquí, una sola vez.
capa = json.loads(CAPA_PARR.read_text(encoding='utf-8'))
porCanton = {}
for f in capa['features']:
    pr = f['properties']
    clave = (norm(pr['dpa_despro'].replace('\u00d0', 'Ñ')),
             norm(pr['dpa_descan'].replace('\u00d0', 'Ñ')))
    nombre = norm(pr['dpa_despar'].replace('\u00d0', 'Ñ'))
    alias = {norm(x) for x in str(pr.get('nombres_cne') or '').split('|') if norm(x)}
    porCanton.setdefault(clave, []).append((nombre, alias))


def polígono(provK, cantK, parrCNE):
    """Clave del polígono que recoge esa parroquia del CNE, o '' si ninguno."""
    ps = porCanton.get((provK, cantK), [])
    for nombre, _ in ps:
        if nombre == parrCNE:
            return nombre
    sin = parrCNE.replace(' ', '')
    for nombre, _ in ps:
        if nombre.replace(' ', '') == sin:
            return nombre
    for nombre, alias in ps:
        if parrCNE in alias:
            return nombre
    return ''


pares = d[['PROVK', 'CANTK', 'PARRCNE']].drop_duplicates()
mapa = {(r.PROVK, r.CANTK, r.PARRCNE): polígono(r.PROVK, r.CANTK, r.PARRCNE)
        for r in pares.itertuples()}
d['PARRK'] = [mapa[(a, b, c)] for a, b, c in zip(d['PROVK'], d['CANTK'], d['PARRCNE'])]

sin_poligono = sorted({(a, b, c) for (a, b, c), v in mapa.items() if not v})
votos_sin = int(d.loc[d['PARRK'] == '', 'VOTOS'].sum())
print(f'  parroquias del CNE: {len(mapa):,} · con polígono: {len(mapa) - len(sin_poligono):,} '
      f'· sin polígono: {len(sin_poligono)} ({votos_sin:,} votos, cuentan en su cantón)')
for a, b, c in sin_poligono[:12]:
    print(f'     {a} · {b} · {c}')

# Agregación al nivel más fino de la base: la parroquia.
g = (d.groupby(['DIG', 'PROVK', 'CANTK', 'PARRK', 'CAND', 'OP'], sort=False)['VOTOS']
       .sum().reset_index())
print(f'  {len(g):,} combinaciones parroquia × candidato')

# Tablas de nombres para no repetir cadenas largas en cada registro.
candidatos = sorted(g['CAND'].unique())
organizaciones = sorted(g['OP'].unique())
provincias = sorted(g['PROVK'].unique())
cantones = sorted(g['CANTK'].unique())
parroquias = sorted(x for x in g['PARRK'].unique() if x)

iC = {v: i for i, v in enumerate(candidatos)}
iO = {v: i for i, v in enumerate(organizaciones)}
iP = {v: i for i, v in enumerate(provincias)}
iN = {v: i for i, v in enumerate(cantones)}
iR = {v: i for i, v in enumerate(parroquias)}

registros = {}
for dig in sorted(g['DIG'].unique()):
    sub = g[g['DIG'] == dig]
    registros[dig] = [
        [iP[r.PROVK], iN[r.CANTK], iR.get(r.PARRK, -1), iC[r.CAND], iO[r.OP], int(r.VOTOS)]
        for r in sub.itertuples()
    ]
    print(f'  {dig}: {len(registros[dig]):,} registros, '
          f'{sub["VOTOS"].sum():,} votos')

# ── Comprobación: la suma por cantón no cambia al bajar a parroquia ──────
porCantonNuevo = d.groupby(['DIG', 'PROVK', 'CANTK'])['VOTOS'].sum()
porCantonViejo = (g.groupby(['DIG', 'PROVK', 'CANTK'])['VOTOS'].sum())
assert porCantonNuevo.equals(porCantonViejo), 'la agregación parroquial cambió algún total cantonal'
print('  ✓ los totales por cantón son idénticos a los de la base')

salida = {
    'anio': int(ANIO),
    'fuente': 'SECCIONALES_ALCALDE.csv',
    'etiquetas': {ident: etq for ident, etq in DIGNIDADES.values()},
    'candidatos': candidatos,
    'organizaciones': organizaciones,
    'provincias': provincias,
    'cantones': cantones,
    'parroquias': parroquias,
    'registros': registros,
}

DESTINO.parent.mkdir(parents=True, exist_ok=True)
DESTINO.write_text(json.dumps(salida, ensure_ascii=False, separators=(',', ':')),
                   encoding='utf-8')
print(f'\nEscrito {DESTINO}  ({DESTINO.stat().st_size/1024:.0f} KB)')
