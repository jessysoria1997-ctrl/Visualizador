#!/usr/bin/env python3
"""
Prepara los resultados electorales de 2023 para el dashboard.

De los 53 MB del TSV original solo se conserva lo que el tablero necesita:
los votos de cada candidato agregados por cantón, únicamente del año 2023.
El resto de años se descarta aquí y nunca llega al navegador.

Salida: data/resultados2023.json
"""
import json
import unicodedata
from pathlib import Path

import pandas as pd

ORIGEN = '/mnt/user-data/uploads/SECCIONALES_ALCALDE.csv'
DESTINO = Path('CARPETA_ELECTORAL/data/resultados2023.json')
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

# Agregación al nivel más fino que el tablero puede filtrar: el cantón.
g = (d.groupby(['DIG', 'PROVK', 'CANTK', 'CAND', 'OP'], sort=False)['VOTOS']
       .sum().reset_index())
print(f'  {len(g):,} combinaciones cantón × candidato')

# Tablas de nombres para no repetir cadenas largas en cada registro.
candidatos = sorted(g['CAND'].unique())
organizaciones = sorted(g['OP'].unique())
provincias = sorted(g['PROVK'].unique())
cantones = sorted(g['CANTK'].unique())

iC = {v: i for i, v in enumerate(candidatos)}
iO = {v: i for i, v in enumerate(organizaciones)}
iP = {v: i for i, v in enumerate(provincias)}
iN = {v: i for i, v in enumerate(cantones)}

registros = {}
for dig in sorted(g['DIG'].unique()):
    sub = g[g['DIG'] == dig]
    registros[dig] = [
        [iP[r.PROVK], iN[r.CANTK], iC[r.CAND], iO[r.OP], int(r.VOTOS)]
        for r in sub.itertuples()
    ]
    print(f'  {dig}: {len(registros[dig]):,} registros, '
          f'{sub["VOTOS"].sum():,} votos')

salida = {
    'anio': int(ANIO),
    'fuente': 'SECCIONALES_ALCALDE.csv',
    'etiquetas': {ident: etq for ident, etq in DIGNIDADES.values()},
    'candidatos': candidatos,
    'organizaciones': organizaciones,
    'provincias': provincias,
    'cantones': cantones,
    'registros': registros,
}

DESTINO.parent.mkdir(parents=True, exist_ok=True)
DESTINO.write_text(json.dumps(salida, ensure_ascii=False, separators=(',', ':')),
                   encoding='utf-8')
print(f'\nEscrito {DESTINO}  ({DESTINO.stat().st_size/1024:.0f} KB)')
