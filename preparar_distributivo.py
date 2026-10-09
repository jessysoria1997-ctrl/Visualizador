#!/usr/bin/env python3
"""
Genera data/distributivo.json: juntas receptoras y recintos electorales de
todo el país, para el bloque «Electores» de Preinscritos (js/recintos.js).

Fuente
  · distributivo_2027.xlsx   un recinto por fila, con su provincia, cantón,
                             parroquia, juntas femeninas y masculinas,
                             electores y coordenadas

Todo sale de la base: no hay ningún valor escrito a mano.

  · Juntas: JUN FEM y JUN MAS de cada recinto (se comprueba que
    NUM JUNR = JUN FEM + JUN MAS en todos).
  · Recintos: uno por CODIGO RECINTO; se comprueba que no haya repetidos.
  · Territorio: provincia y cantón con los mismos alias que el resto del
    tablero (preparar_electores.py, js/data.js), para que cada recinto caiga
    en el cantón del mapa. La parroquia se busca en la capa parroquial por su
    código del CNE y, si no, por su nombre; si no aparece, se deja el nombre
    del distributivo.
  · Se comprueba que los electores por cantón coincidan con
    data/electores.json: el bloque y el panel de análisis territorial cuentan
    el mismo padrón.

Salida (compacta: los nombres largos van en tablas y cada recinto las cita
por posición, igual que resultados2023.json)
    cantones     ["PROVINCIA|CANTON", …]   claves del tablero
    parroquias   [nombre, …]               una entrada por parroquia de cada
                                           cantón, en el orden de la capa
    nombres      {clave: nombre con tildes} provincias y cantones
    recintos     [[cantón, parroquia, código, nombre, dirección,
                   juntas femeninas, juntas masculinas, electores, lat, lon], …]

Uso
    python preparar_distributivo.py RUTA/distributivo_2027.xlsx
"""
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

import pandas as pd

BASE = Path(__file__).parent
DATA = BASE / 'data'
SALIDA = DATA / 'distributivo.json'

# Mismos alias que js/data.js y preparar_electores.py.
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
# Las capas escriben las provincias sin tildes; para el título del bloque.
PROV_TILDES = {
    'BOLIVAR': 'BOLÍVAR',
    'GALAPAGOS': 'GALÁPAGOS',
    'LOS RIOS': 'LOS RÍOS',
    'MANABI': 'MANABÍ',
    'SUCUMBIOS': 'SUCUMBÍOS',
    'SANTO DOMINGO DE LOS TSACHILAS': 'SANTO DOMINGO DE LOS TSÁCHILAS',
}


def norm(s):
    """Réplica de normalizarTexto() de js/data.js."""
    s = str(s or '').upper().replace('Ð', 'Ñ').replace('Ñ', '\x01')
    s = ''.join(c for c in unicodedata.normalize('NFD', s)
                if unicodedata.category(c) != 'Mn')
    s = s.replace('\x01', 'N')
    s = re.sub(r'[^A-Z0-9]+', ' ', s)
    return s.strip()


def texto(x):
    if x is None or (isinstance(x, float) and pd.isna(x)):
        return ''
    return re.sub(r'\s+', ' ', str(x)).strip()


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    d = pd.read_excel(sys.argv[1])

    # ── Comprobaciones de la base ───────────────────────────────────────────
    assert d['CODIGO RECINTO'].is_unique, 'hay recintos repetidos en el distributivo'
    malas = d[d['NUM JUNR'] != d['JUN FEM'] + d['JUN MAS']]
    assert malas.empty, f'NUM JUNR no coincide con JUN FEM + JUN MAS en {len(malas)} recintos'
    assert d[['long', 'lat']].notna().all().all(), 'hay recintos sin coordenadas'

    d['PROVK'] = d['NOMBRE PROVINCIA'].map(lambda x: ALIAS_PROV.get(norm(x), norm(x)))
    d['CANTK'] = d['NOMBRE CANTON'].map(lambda x: ALIAS_CANT.get(norm(x), norm(x)))

    # ── Capas del tablero ───────────────────────────────────────────────────
    capa_c = json.loads((DATA / 'cantones.geojson').read_text(encoding='utf-8'))['features']
    nombres = {}
    for f in capa_c:
        p = f['properties']
        clave = f"{norm(p['dpa_despro'])}|{norm(p['dpa_descan'])}"
        # El nombre del CNE lleva tildes; se usa solo si es el mismo nombre
        # (Quito, por ejemplo, figura como «Distrito Metropolitano de Quito»).
        cne = texto(p.get('nombre_cne'))
        nombres[clave] = cne if cne and norm(cne) == norm(p['dpa_descan']) else texto(p['dpa_descan'])
    for f in json.loads((DATA / 'provincias.geojson').read_text(encoding='utf-8'))['features']:
        k = norm(f['properties']['dpa_despro'])
        nombres[k] = PROV_TILDES.get(k, texto(f['properties']['dpa_despro']))

    # Parroquias de cada cantón, en el orden de la capa. Se buscan por el
    # código del CNE (dpa_parroq = provincia · cantón · parroquia del CNE) y,
    # si no, por cualquiera de sus nombres.
    capa_p = json.loads((DATA / 'parroquias.geojson').read_text(encoding='utf-8'))['features']
    parr_orden = defaultdict(list)          # clave de cantón → [nombre de la capa]
    por_codigo, por_nombre = {}, {}
    for f in capa_p:
        p = f['properties']
        cant = f"{norm(p['dpa_despro'])}|{norm(p['dpa_descan'])}"
        nombre = texto(p['dpa_despar'])
        parr_orden[cant].append(nombre)
        por_codigo[str(p['dpa_parroq'])] = (cant, nombre)
        for n in [p['dpa_despar']] + str(p.get('nombres_cne') or '').split('|'):
            if norm(n):
                por_nombre[(cant, norm(n))] = nombre

    def parroquia(r, cant):
        cod = (f"{int(r['CODIGO PROVINCIA']):02d}{int(r['CODIGO CANTON']):04d}"
               f"{int(r['CODIGO PARROQUIA']):04d}")
        hit = por_codigo.get(cod)
        if hit and hit[0] == cant:
            return hit[1], True
        n = por_nombre.get((cant, norm(r['NOMBRE PARROQUIA'])))
        return (n, True) if n else (texto(r['NOMBRE PARROQUIA']), False)

    # ── Recintos ────────────────────────────────────────────────────────────
    filas, sin_capa = [], Counter()
    for _, r in d.iterrows():
        cant = f"{r['PROVK']}|{r['CANTK']}"
        nombre_p, en_capa = parroquia(r, cant)
        if not en_capa:
            sin_capa[(cant, nombre_p)] += 1
        filas.append({
            'cant': cant, 'parr': nombre_p,
            'codigo': int(r['CODIGO RECINTO']), 'nombre': texto(r['NOMBRE RECINTO']),
            'direccion': texto(r['DIRECCION RECINTO']),
            'f': int(r['JUN FEM']), 'm': int(r['JUN MAS']), 'electores': int(r['NUMERO ELECTORES']),
            'lat': round(float(r['lat']), 6), 'lon': round(float(r['long']), 6),
        })

    # Orden: cantón; dentro, parroquias como en la capa (las que no están, al
    # final por nombre); dentro, recintos por nombre. Es el orden en que el
    # tablero agrupa la lista de un cantón.
    cantones = sorted({x['cant'] for x in filas})
    ic = {c: i for i, c in enumerate(cantones)}
    parrs, ip = [], {}
    for c in cantones:
        propias = sorted({x['parr'] for x in filas if x['cant'] == c})
        orden = [p for p in parr_orden.get(c, []) if p in propias]
        orden += [p for p in propias if p not in orden]
        for p in orden:
            ip[(c, p)] = len(parrs)
            parrs.append(p)
    filas.sort(key=lambda x: (ic[x['cant']], ip[(x['cant'], x['parr'])], x['nombre']))

    # Cantones sin polígono en el mapa: se guardan igual (cuentan en su
    # provincia y en el país) con el nombre del distributivo.
    sin_poligono = [c for c in cantones if c not in nombres]
    for c in sin_poligono:
        fila = d[(d['PROVK'] + '|' + d['CANTK']) == c].iloc[0]
        nombres[c] = texto(fila['NOMBRE CANTON'])
    usados = set(cantones) | {c.split('|')[0] for c in cantones}
    nombres = {k: v for k, v in sorted(nombres.items()) if k in usados}

    # ── El mismo padrón que el panel de análisis territorial ───────────────
    el = json.loads((DATA / 'electores.json').read_text(encoding='utf-8'))
    por_cant = Counter()
    for x in filas:
        por_cant[x['cant']] += x['electores']
    distintos = {k: (v, el['cantones'].get(k)) for k, v in por_cant.items() if el['cantones'].get(k) != v}
    assert not distintos, f'electores distintos de data/electores.json: {distintos}'
    assert sum(por_cant.values()) == el['total'], 'el total de electores no coincide'

    salida = {
        'fuente': Path(sys.argv[1]).name,
        'cantones': cantones,
        'parroquias': parrs,
        'nombres': nombres,
        'recintos': [[ic[x['cant']], ip[(x['cant'], x['parr'])], x['codigo'], x['nombre'],
                      x['direccion'], x['f'], x['m'], x['electores'], x['lat'], x['lon']]
                     for x in filas],
    }
    SALIDA.write_text(json.dumps(salida, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')

    # ── Informe ─────────────────────────────────────────────────────────────
    jf, jm = sum(x['f'] for x in filas), sum(x['m'] for x in filas)
    print(f'✓ {SALIDA}  ({SALIDA.stat().st_size / 1024:.0f} KB)')
    print(f'  {len(filas):,} recintos · {jf + jm:,} juntas ({jf:,} femeninas, {jm:,} masculinas) · '
          f'{sum(por_cant.values()):,} electores (igual que data/electores.json)')
    print(f'  {len({c.split("|")[0] for c in cantones})} provincias, {len(cantones)} cantones, '
          f'{len(parrs)} parroquias')
    if sin_poligono:
        print(f'  cantones sin polígono en el mapa (cuentan en su provincia): {sin_poligono}')
    if sin_capa:
        print('  parroquias que no están en la capa parroquial (se usa el nombre del distributivo):')
        for (c, p), n in sorted(sin_capa.items()):
            print(f'    {c} · {p}: {n} recinto(s)')
    revisar_ubicacion(filas, capa_c)


def revisar_ubicacion(filas, capa_c):
    """Informe: recintos cuyas coordenadas caen fuera de su cantón. No cambia nada."""
    try:
        from shapely.geometry import Point, shape
    except ImportError:
        return
    geo = {f"{norm(f['properties']['dpa_despro'])}|{norm(f['properties']['dpa_descan'])}":
           shape(f['geometry']).buffer(0) for f in capa_c}
    lejos = []
    for x in filas:
        g = geo.get(x['cant'])
        if g is not None and not g.contains(Point(x['lon'], x['lat'])):
            km = g.distance(Point(x['lon'], x['lat'])) * 111
            if km > 1:
                lejos.append((km, x))
    if lejos:
        print('  recintos a más de 1 km de su cantón (revisar coordenadas en la base):')
        for km, x in sorted(lejos, key=lambda t: -t[0]):
            print(f"    {x['cant']} · {x['nombre']} ({x['codigo']}): {km:.1f} km")


if __name__ == '__main__':
    main()
