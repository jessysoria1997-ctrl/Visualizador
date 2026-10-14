#!/usr/bin/env python3
"""
Qué cantones eligen sus concejales urbanos por circunscripción, y con qué
parroquias y qué padrón cada una.

Fuente
  · 14_DISTRI_FEBRERO_2026_zona_CIRCUNS_1.xls — el distributivo del CNE por
    zona, que trae COD/NOM_CIRCUNSCRIPCION, la parroquia, si es urbana o
    rural y el número de electores de cada zona.

Qué se guarda
  Solo los cantones con MÁS DE UNA circunscripción urbana, que son los que
  necesitan un selector: en los demás el cantón entero es una sola
  circunscripción y no hay nada que elegir.

  De cada circunscripción se guarda su nombre, su número, sus parroquias y
  sus electores, más la proporción que representa dentro del padrón urbano
  del cantón. El tablero usa esa proporción —no el número absoluto— para
  repartir el padrón urbano que ya maneja (el de los recintos de 2027), y así
  no mezclar dos padrones distintos en la misma cuenta.

Salida: data/circunscripciones.json

Uso
    python preparar_circunscripciones.py RUTA/14_DISTRI_FEBRERO_2026_zona_CIRCUNS_1.xls

Requiere xlrd (pip install xlrd).
"""
import json
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

import xlrd

BASE = Path(__file__).parent
DESTINO = BASE / 'data' / 'circunscripciones.json'
CANTONES = BASE / 'data' / 'electores.json'

ALIAS_PROV = {
    'STO DGO TSACHILAS': 'SANTO DOMINGO DE LOS TSACHILAS',
    'SANTO DOMINGO': 'SANTO DOMINGO DE LOS TSACHILAS',
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
    """Réplica de normalizarTexto() de js/data.js."""
    s = str(s if s is not None else '').upper().replace('Ñ', '\x01')
    s = ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')
    s = s.replace('\x01', 'N')
    return re.sub(r'[^A-Z0-9]+', ' ', s).strip()


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    ruta = Path(sys.argv[1])
    print(f'Leyendo {ruta.name}…')
    sh = xlrd.open_workbook(ruta).sheet_by_index(0)
    cab = [str(c.value).strip() for c in sh.row(0)]
    col = {c: k for k, c in enumerate(cab)}
    for c in ('NOM_PROVINCIA', 'NOM_CANTON', 'NOM_CIRCUNSCRIPCION', 'NOM_PARROQUIA',
              'EST_PARROQUIA', 'NUMELE_ZONA'):
        if c not in col:
            sys.exit(f'Falta la columna {c} en el archivo.')

    datos = defaultdict(lambda: defaultdict(lambda: {'electores': 0, 'parroquias': set()}))
    for r in range(1, sh.nrows):
        f = sh.row(r)
        prov = norm(f[col['NOM_PROVINCIA']].value)
        cant = norm(f[col['NOM_CANTON']].value)
        prov = ALIAS_PROV.get(prov, prov)
        cant = ALIAS_CANT.get(cant, cant)
        cir = str(f[col['NOM_CIRCUNSCRIPCION']].value).strip().upper()
        if not cir:
            continue
        d = datos[f'{prov}|{cant}'][cir]
        d['electores'] += int(f[col['NUMELE_ZONA']].value or 0)
        d['parroquias'].add(str(f[col['NOM_PARROQUIA']].value).strip())

    conocidos = set(json.loads(CANTONES.read_text(encoding='utf-8'))['cantones'])
    salida, sueltos = {}, []
    for clave, circs in sorted(datos.items()):
        urbanas = sorted(c for c in circs if 'URBANA' in c)
        if len(urbanas) < 2:
            continue                      # sin selector: el cantón es una sola
        if clave not in conocidos:
            sueltos.append(clave)
            continue
        padronUrbano = sum(circs[c]['electores'] for c in urbanas)
        salida[clave] = {
            'urbanas': [{
                'n': int(re.search(r'(\d+)\s*$', c).group(1)),
                'nombre': c.title().replace('Circunscripcion', 'Circunscripción'),
                'electores': circs[c]['electores'],
                'parte': round(circs[c]['electores'] / padronUrbano, 6) if padronUrbano else 0,
                'parroquias': sorted(circs[c]['parroquias'])
            } for c in urbanas],
            'electoresUrbanos': padronUrbano
        }

    if sueltos:
        print('\n✗ Cantones del archivo que el tablero no reconoce:')
        for k in sueltos:
            print('   ', k)
        sys.exit('Añade el alias que falte y vuelve a correrlo.')

    DESTINO.parent.mkdir(parents=True, exist_ok=True)
    DESTINO.write_text(json.dumps({'fuente': ruta.name, 'anio': 2026, 'cantones': salida},
                                  ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'\n✓ {DESTINO}  ({DESTINO.stat().st_size / 1024:.0f} KB)')
    print(f'  {len(salida)} cantones eligen sus concejales urbanos por circunscripción:')
    for k, v in salida.items():
        trozos = ' · '.join(f"{c['nombre'].split()[-1]}: {c['electores']:,} ({c['parte'] * 100:.1f} %)"
                            for c in v['urbanas'])
        print(f'     {k:<46} {trozos}')


if __name__ == '__main__':
    main()
