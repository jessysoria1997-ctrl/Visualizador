#!/usr/bin/env python3
"""
Prepara las bases de las secciones nuevas del dashboard.

Genera tres archivos en data/:
  · historico.json    votos por organización política a nivel parroquia,
                      más nulos y blancos ya desduplicados, para todos los
                      años y las dos dignidades.
  · postulantes.json  número de postulantes distintos por territorio.
  · etario2027.json   padrón 2027 por grupo etario y cantón.

Sobre nulos y blancos: en la base vienen repetidos en cada fila de candidato,
así que sumarlos directamente los multiplica por diez. Se aplica la misma
lógica del modelo de Power BI: MAX dentro de cada unidad electoral y suma
después.
"""
import json
import unicodedata
from pathlib import Path

import pandas as pd

TSV = '/mnt/user-data/uploads/SECCIONALES_ALCALDE.csv'
XLSX_ETARIO = '/mnt/user-data/uploads/distributivo_2027_nivelcanton_etario.xlsx'
DATA = Path('CARPETA_ELECTORAL/data')

# Unidad electoral: dentro de ella, nulos y blancos son un único valor
# repetido en cada fila de candidato.
UNIDAD = ['AÑO', 'DIGNIDAD_CODIGO', 'PROVINCIA_CODIGO', 'CANTON_CODIGO',
          'PARROQUIA_CODIGO', 'SEXO']
# CIRCUNSCRIPCION_CODIGO está vacía en las 173.130 filas: se omite porque
# pandas descartaría todos los grupos al agrupar por una clave nula.

DIGNIDADES = {'PREFECTO': ('PREFECTOS', 'Prefecto'),
              'ALCALDE': ('ALCALDES', 'Alcalde')}

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


def clasificar(dig):
    t = norm(dig)
    for clave, (ident, _) in DIGNIDADES.items():
        if clave in t:
            return ident
    return None


def escribir(nombre, obj):
    p = DATA / nombre
    p.write_text(json.dumps(obj, ensure_ascii=False, separators=(',', ':')),
                 encoding='utf-8')
    print(f'  → {p}  ({p.stat().st_size/1024:.0f} KB)')


# ══════════════════════════════════════════════════════════════════════════
print('1 · Histórico electoral')
df = pd.read_csv(TSV, sep='\t', dtype=str, low_memory=False)
for c in ['CANDIDATO_VOTOS', 'VOTOS_NULOS', 'VOTOS_EN_BLANCO']:
    df[c] = pd.to_numeric(df[c], errors='coerce').fillna(0).astype(int)

df['DIG'] = df['DIGNIDAD_NOMBRE'].map(clasificar)
df = df[df['DIG'].notna()].copy()
df['ANIO'] = df['AÑO'].astype(int)
df['PROVK'] = df['PROVINCIA_NOMBRE'].map(lambda x: norm(ALIAS_PROV.get(norm(x), norm(x))))
df['CANTK'] = df['CANTON_NOMBRE'].map(lambda x: norm(ALIAS_CANT.get(norm(x), norm(x))))
df['PARRK'] = df['PARROQUIA_NOMBRE'].map(norm)
df['OPN'] = df['OP_NOMBRE'].str.strip()

print(f'  {len(df):,} filas, años {sorted(df["ANIO"].unique())}')

# --- Votos válidos por organización, a nivel parroquia -------------------
votos = (df.groupby(['ANIO', 'DIG', 'PROVK', 'CANTK', 'PARRK', 'OPN'],
                    sort=False)['CANDIDATO_VOTOS'].sum().reset_index())
print(f'  {len(votos):,} combinaciones parroquia × organización')

# --- Nulos y blancos: MAX por unidad electoral, luego suma ---------------
uni = df.groupby(UNIDAD, sort=False).agg(
    NUL=('VOTOS_NULOS', 'max'), BLA=('VOTOS_EN_BLANCO', 'max')).reset_index()
llave = df[UNIDAD + ['ANIO', 'DIG', 'PROVK', 'CANTK', 'PARRK']].drop_duplicates(UNIDAD)
uni = uni.merge(llave, on=UNIDAD, how='left')
nb = (uni.groupby(['ANIO', 'DIG', 'PROVK', 'CANTK', 'PARRK'], sort=False)
        .agg(NUL=('NUL', 'sum'), BLA=('BLA', 'sum')).reset_index())

ing = int(df['VOTOS_NULOS'].sum())
cor = int(nb['NUL'].sum())
print(f'  nulos: suma directa {ing:,} → desduplicados {cor:,} (x{ing/cor:.1f} menos)')
print(f'  blancos desduplicados: {int(nb["BLA"].sum()):,}')

anios = [int(a) for a in sorted(votos['ANIO'].unique())]
ops = sorted(votos['OPN'].unique())
provs = sorted(set(votos['PROVK']))
cants = sorted(set(votos['CANTK']))
parrs = sorted(set(votos['PARRK']))
iA = {v: i for i, v in enumerate(anios)}
iO = {v: i for i, v in enumerate(ops)}
iP = {v: i for i, v in enumerate(provs)}
iC = {v: i for i, v in enumerate(cants)}
iR = {v: i for i, v in enumerate(parrs)}

reg = {}
for dig in sorted(votos['DIG'].unique()):
    sub = votos[votos['DIG'] == dig]
    reg[dig] = [[iA[r.ANIO], iP[r.PROVK], iC[r.CANTK], iR[r.PARRK], iO[r.OPN],
                 int(r.CANDIDATO_VOTOS)] for r in sub.itertuples()]

regnb = {}
for dig in sorted(nb['DIG'].unique()):
    sub = nb[nb['DIG'] == dig]
    regnb[dig] = [[iA[r.ANIO], iP[r.PROVK], iC[r.CANTK], iR[r.PARRK],
                   int(r.NUL), int(r.BLA)] for r in sub.itertuples()]

escribir('historico.json', {
    'anios': anios, 'etiquetas': {i: e for i, e in DIGNIDADES.values()},
    'organizaciones': ops, 'provincias': provs, 'cantones': cants,
    'parroquias': parrs, 'votos': reg, 'nuloblanco': regnb,
})

# ══════════════════════════════════════════════════════════════════════════
print('\n2 · Postulantes')
# Los postulantes se cuentan como candidaturas distintas. Un candidato a
# alcalde pertenece a un cantón y uno a prefecto a una provincia, así que el
# recuento no se puede sumar entre niveles: se guarda cada nivel aparte.
post = {}
for dig in sorted(df['DIG'].unique()):
    d = df[df['DIG'] == dig]
    niveles = {}
    niveles['pais'] = {str(int(a)): int(g['CANDIDATO_CODIGO'].nunique())
                       for a, g in d.groupby('ANIO')}
    niveles['prov'] = {f'{int(a)}|{p}': int(g['CANDIDATO_CODIGO'].nunique())
                       for (a, p), g in d.groupby(['ANIO', 'PROVK'])}
    niveles['cant'] = {f'{int(a)}|{p}|{c}': int(g['CANDIDATO_CODIGO'].nunique())
                       for (a, p, c), g in d.groupby(['ANIO', 'PROVK', 'CANTK'])}
    niveles['parr'] = {f'{int(a)}|{p}|{c}|{r}': int(g['CANDIDATO_CODIGO'].nunique())
                       for (a, p, c, r), g in d.groupby(['ANIO', 'PROVK', 'CANTK', 'PARRK'])}
    post[dig] = niveles
    print(f'  {dig}: {len(niveles["cant"]):,} cantón-año, {len(niveles["parr"]):,} parroquia-año')

escribir('postulantes.json', {'anios': anios, 'niveles': post})

# ══════════════════════════════════════════════════════════════════════════
print('\n3 · Grupos etarios 2027')
et = pd.read_excel(XLSX_ETARIO, dtype=str)
GRUPOS = [('16-17', 'DE 16 A 17 AÑOS DE EDAD'),
          ('18-29', 'DE 18 A 29 AÑOS DE EDAD'),
          ('30-64', 'DE 30 A 64 AÑOS DE EDAD'),
          ('65+', 'DE 65 AÑOS DE EDAD Y MAS')]
for _, c in GRUPOS:
    et[c] = pd.to_numeric(et[c], errors='coerce').fillna(0).astype(int)

# El archivo incluye el voto en el exterior, que no tiene lugar en el mapa.
ext = et[et['TERRITORIO_NOMBRE'].str.upper() != 'NACIONAL']
et = et[et['TERRITORIO_NOMBRE'].str.upper() == 'NACIONAL'].copy()
print(f'  {len(et)} cantones nacionales, {len(ext)} entradas del exterior '
      f'({int(ext[[c for _, c in GRUPOS]].sum().sum()):,} electores) → excluidas del mapa')

et['PROVK'] = et['PROVINCIA_NOMBRE'].map(lambda x: norm(ALIAS_PROV.get(norm(x), norm(x))))
et['CANTK'] = et['CANTON_NOMBRE'].map(lambda x: norm(ALIAS_CANT.get(norm(x), norm(x))))

cant_et, prov_et = {}, {}
for r in et.itertuples():
    fila = [int(getattr(r, f'_{i+7}')) for i in range(len(GRUPOS))]
    cant_et[f'{r.PROVK}|{r.CANTK}'] = fila
    acc = prov_et.setdefault(r.PROVK, [0] * len(GRUPOS))
    for i, v in enumerate(fila):
        acc[i] += v
pais_et = [sum(v[i] for v in prov_et.values()) for i in range(len(GRUPOS))]

print(f'  total nacional: {sum(pais_et):,} electores')
for i, (etq, _) in enumerate(GRUPOS):
    print(f'    {etq:<6} {pais_et[i]:>11,}  ({100*pais_et[i]/sum(pais_et):.1f} %)')

escribir('etario2027.json', {
    'anio': 2027,
    'grupos': [e for e, _ in GRUPOS],
    'pais': pais_et, 'provincias': prov_et, 'cantones': cant_et,
    'exterior': [int(ext[c].sum()) for _, c in GRUPOS],
})

print('\nListo.')
