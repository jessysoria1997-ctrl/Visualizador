#!/usr/bin/env python3
"""
Prepara el número de electores para el dashboard.

Toma el distributivo de recintos electorales y suma NUMERO ELECTORES por
provincia y por cantón. Sustituye al dato de población que traía la capa
parroquial, que correspondía al censo de 2010.

Salida: data/electores.json
"""
import json
import unicodedata
from pathlib import Path

import pandas as pd

ORIGEN = '/mnt/user-data/uploads/distributivo.xlsx'
DESTINO = Path('CARPETA_ELECTORAL/data/electores.json')

COL_PROVINCIA = 'NOMBRE PROVINCIA'
COL_CANTON = 'NOMBRE CANTON'
COL_ELECTORES = 'NUMERO ELECTORES'

# Mismos alias que js/data.js, para que las claves encajen con la cartografía.
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


def norm(s):
    s = str(s).upper().replace('Ñ', '\x01')
    s = ''.join(c for c in unicodedata.normalize('NFD', s)
                if unicodedata.category(c) != 'Mn')
    s = s.replace('\x01', 'N')
    s = ''.join(c if c.isalnum() else ' ' for c in s)
    return ' '.join(s.split())


print('Leyendo el distributivo…')
df = pd.read_excel(ORIGEN, dtype=str)
print(f'  {len(df):,} recintos electorales')

df['EL'] = pd.to_numeric(df[COL_ELECTORES], errors='coerce').fillna(0).astype(int)
df['PROVK'] = df[COL_PROVINCIA].map(lambda x: norm(ALIAS_PROV.get(norm(x), norm(x))))
df['CANTK'] = df[COL_CANTON].map(lambda x: norm(ALIAS_CANT.get(norm(x), norm(x))))

total = int(df['EL'].sum())
provincias = {k: int(v) for k, v in df.groupby('PROVK')['EL'].sum().items()}
cantones = {f'{p}|{c}': int(v)
            for (p, c), v in df.groupby(['PROVK', 'CANTK'])['EL'].sum().items()}

# El total nacional se guarda aparte: sumar los cantones dejaría fuera a los
# que no tienen geometría en el mapa (Sevilla Don Bosco).
assert sum(provincias.values()) == total, 'la suma por provincia no cuadra'
assert sum(cantones.values()) == total, 'la suma por cantón no cuadra'

print(f'  {len(provincias)} provincias, {len(cantones)} cantones')
print(f'  electores: {total:,}')

DESTINO.parent.mkdir(parents=True, exist_ok=True)
DESTINO.write_text(json.dumps({
    'fuente': 'distributivo.xlsx',
    'total': total,
    'provincias': provincias,
    'cantones': cantones,
}, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(f'\nEscrito {DESTINO}  ({DESTINO.stat().st_size/1024:.0f} KB)')
