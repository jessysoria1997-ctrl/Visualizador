#!/usr/bin/env python3
"""
Genera data/parroquias.geojson a partir del SHP parroquial del CNE
(Parroquias_Ref_CP_2025) y lo cuadra con la base electoral del tablero.

Qué hace
  1. Simplifica el SHP y lo pasa de UTM 17S a coordenadas geográficas
     (WGS84), que es lo que dibuja el mapa. Usa mapshaper.
  2. Asigna cada parroquia al cantón de data/cantones.geojson, que es la
     capa cantonal del tablero y no se toca.
  3. Homologa los campos al esquema que ya lee el tablero (dpa_*), así que
     no hace falta cambiar nada en js/ para reconocer la capa.
  4. Cruza cada parroquia con los nombres de la base electoral
     (data/historico.json, 2004–2023) y guarda la equivalencia en el campo
     «nombres_cne» de cada polígono.
  5. Informa de todo lo que no cruza.

Uso
    python preparar_parroquias.py RUTA/Parroquias_Ref_CP_2025.shp

Requiere mapshaper (npm install -g mapshaper). Sin él, se puede hacer el
paso 1 en https://mapshaper.org —arrastrar los archivos .shp .dbf .shx .prj
.cpg, escribir en la consola el comando de SIMPLIFICAR y exportar en
GeoJSON— y pasarle a este script el .geojson resultante:

    python preparar_parroquias.py parroquias_wgs84.geojson
"""
import json
import re
import shutil
import subprocess
import sys
import tempfile
import unicodedata
from collections import defaultdict
from pathlib import Path

BASE = Path(__file__).parent
DATA = BASE / 'data'
SALIDA = DATA / 'parroquias.geojson'

# Más detalle en las parroquias urbanas, que son pequeñas: con un único
# umbral quedarían reducidas a triángulos al acercarse a una ciudad.
SIMPLIFICAR = ("-simplify variable interval=\"ESTADO == 'URBANA' ? 100 : 400\" "
               "keep-shapes -proj wgs84")

# Mismos alias que js/data.js y los scripts de preparación.
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

# ── Cantones del SHP que no existen como tales en la capa cantonal ───────
CANTON_SHP = {
    # Otra grafía del mismo cantón.
    ('GUAYAS', 'LOMAS SARGENTILLO'): ('GUAYAS', 'LOMAS DE SARGENTILLO'),
    # Cantón posterior a 2023. En la base electoral y en la capa cantonal su
    # territorio sigue siendo parte de Morona (99 % de su superficie).
    ('MORONA SANTIAGO', 'SEVILLA DON BOSCO'): ('MORONA SANTIAGO', 'MORONA'),
    # Zona en estudio, sin cantón en el SHP. El 97 % de su superficie está
    # dentro de Alausí en la capa cantonal; va ahí para no dejar un hueco.
    ('ZE JUVAL', 'ZONA EN ESTUDIO JUVAL'): ('CHIMBORAZO', 'ALAUSI'),
}

# ── Parroquias con otra grafía en la base electoral ──────────────────────
# Mismo código CNE en el SHP y en la base, nombre escrito distinto. El
# polígono toma el nombre de la base electoral, que es el que usan todos los
# años del histórico y los filtros.  (provincia, cantón, nombre en el SHP)
NOMBRE_ELECTORAL = {
    ('AZUAY', 'SAN FERNANDO', 'CHUMBIN'): 'CHUMBLIN',
    ('GUAYAS', 'LOMAS DE SARGENTILLO', 'LOMAS SARGENTILLO'): 'LOMAS DE SARGENTILLO',
    ('IMBABURA', 'COTACACHI', '6 DE JULIO CUELLAJE'): '6 DE JULIO DE CUELLAJE',
    ('LOJA', 'GONZANAMA', 'CHANGAIMNA LA LIBERTAD'): 'CHANGAIMINA / LA LIBERTAD',
    ('LOJA', 'SARAGURO', 'SAN SEBASTIAN DE YULOG'): 'SAN SEBASTIAN DE YULUC',
    ('MORONA SANTIAGO', 'LIMON INDANZA', 'YUNGANZA 7 EL ROSARIO'): 'YUNGANZA / EL ROSARIO',
    ('NAPO', 'CARLOS JULIO AROSEMENA TOLA', 'CARLOS J AROSEMENA'): 'CARLOS J. AROSEMENA TOLA',
    ('ORELLANA', 'AGUARICO', 'STA MARIA DE HUIRRIMA'): 'STA. MARIA DE HUIRIRIMA',
}

# ── Nombres de años anteriores ───────────────────────────────────────────
# La base electoral registró estas parroquias con otro nombre en elecciones
# pasadas. Sus votos de esos años van al polígono vigente.
NOMBRES_ANTERIORES = {
    ('PICHINCHA', 'CAYAMBE', 'AYORA'): 'SAN JOSE DE AYORA',            # 2004–2009
    ('ORELLANA', 'ORELLANA', 'ALEJANDRO'): 'ALEJANDRO LABAKA',          # 2004–2009
    ('LOS RIOS', 'BUENA FE', '7 DE AGOSTO'): 'SN JACINTO DE BUENA FE',  # 2004–2009
    ('LOS RIOS', 'BUENA FE', '11 DE OCTUBRE'): 'SN JACINTO DE BUENA FE',
    ('GUAYAS', 'GUAYAQUIL', 'CHONGON'): 'TARQUI',                       # 2004–2009
}

# ── Unidades electorales sin polígono vigente ────────────────────────────
# Existieron en elecciones pasadas y hoy no son parroquias de ese cantón. Sus
# votos cuentan en los totales del cantón y de la provincia; solo no se
# pintan en el mapa parroquial, porque no hay polígono al que pertenezcan.
SIN_POLIGONO = {
    ('PICHINCHA', 'QUITO'): ('parroquias urbanas antiguas (2004–2009); en 2014 '
                             'el CNE pasó a las 32 vigentes',
                             {'BENALCAZAR', 'CHAUPICRUZ', 'EL SALVADOR', 'GONZALEZ SUAREZ',
                              'GUAPULO', 'LA FLORESTA', 'LA VICENTINA', 'SAN BLAS',
                              'SAN MARCOS', 'SAN ROQUE', 'SAN SEBASTIAN', 'SANTA BARBARA',
                              'SANTA PRISCA', 'VILLA FLORA'}),
    ('EL ORO', 'HUAQUILLAS'): ('cabecera sin desglosar (2004–2014); desde 2019 '
                               'son cinco parroquias urbanas', {'HUAQUILLAS'}),
    ('EL ORO', 'PASAJE'): ('unidad urbana sin desglosar (solo 2014)', {'PASAJE'}),
    ('LOS RIOS', 'VENTANAS'): ('parroquia de Ventanas en 2004; hoy es el cantón '
                               'Quinsaloma', {'QUINSALOMA'}),
    ('AZUAY', 'SANTA ISABEL'): ('en 2004–2009 figuraba en Santa Isabel; hoy es '
                                'parroquia de Camilo Ponce Enríquez',
                                {'EL CARMEN DE PIJILI'}),
}


def norm(s):
    """Réplica de normalizarTexto() de js/data.js."""
    s = str(s or '').upper().replace('Ñ', '\x01')
    s = ''.join(c for c in unicodedata.normalize('NFD', s)
                if unicodedata.category(c) != 'Mn')
    s = s.replace('\x01', 'N')
    s = re.sub(r'[^A-Z0-9]+', ' ', s)
    return s.strip()


def ap(x): return norm(ALIAS_PROV.get(norm(x), norm(x)))
def ac(x): return norm(ALIAS_CANT.get(norm(x), norm(x)))


def limpiar(nombre):
    """Solo presentación: espacios alrededor de «/» y «(», sin comillas.
    La clave normalizada —la que cruza con la base— no cambia."""
    s = str(nombre).replace('"', ' ')
    s = re.sub(r'\s*/\s*', ' / ', s)
    s = re.sub(r'\s*\(\s*', ' (', s)
    s = re.sub(r'\s*\)', ')', s)
    return re.sub(r'\s+', ' ', s).strip(' /')


def orden_de_referencia(anterior):
    """Orden de las parroquias dentro de cada cantón, que es el de los
    selectores. Se conserva el de la capa anterior para que los cantones que
    ya estaban no cambien:
      · capa ya generada por este script → cada parroquia conserva su lugar;
      · capa del INEC (cabecera primero y luego las rurales por código) →
        cada parroquia toma el lugar de la parroquia del INEC con la que más
        se superpone (requiere shapely; sin él, orden alfabético)."""
    if not anterior:
        return lambda canton, x: ('', 0, x['key'])
    feats = anterior['features']
    if any('nombres_cne' in f['properties'] for f in feats):
        pos = {(f['properties']['dpa_canton'], norm(f['properties']['dpa_despar'])): i
               for i, f in enumerate(feats)}
        return lambda canton, x: (f"{pos.get((canton, x['key']), 10 ** 6):07d}", 0, x['key'])
    try:
        from shapely.geometry import shape
    except ImportError:
        return lambda canton, x: ('', 0, x['key'])
    porCanton = defaultdict(list)
    for f in feats:
        p = f['properties']
        porCanton[p['dpa_canton']].append((p['dpa_parroq'], norm(p['dpa_despar']),
                                           shape(f['geometry']).buffer(0)))

    def clave(canton, x):
        s = shape(x['f']['geometry']).buffer(0)
        comun = [(s.intersection(g).area, cod, nom) for cod, nom, g in porCanton.get(canton, [])
                 if s.intersects(g)]
        if not comun or max(comun)[0] <= 0:
            return ('999999', 1, x['key'])
        _, cod, nom = max(comun)
        return (cod, 0 if nom == x['key'] else 1, x['key'])
    return clave


def leer_capa(ruta):
    ruta = Path(ruta)
    if ruta.suffix.lower() in ('.geojson', '.json'):
        return json.loads(ruta.read_text(encoding='utf-8'))
    exe = shutil.which('mapshaper-xl') or shutil.which('mapshaper')
    if not exe:
        sys.exit('No se encontró mapshaper. Instálalo con  npm install -g mapshaper\n'
                 'o simplifica el SHP en https://mapshaper.org (ver la ayuda de arriba).')
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / 'capa.geojson'
        cmd = (f'"{exe}" -i "{ruta}" encoding=utf8 {SIMPLIFICAR} '
               f'-o format=geojson precision=0.0001 "{out}"')
        subprocess.run(cmd, shell=True, check=True)
        return json.loads(out.read_text(encoding='utf-8'))


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    capa = leer_capa(sys.argv[1])

    # ── Cantones de la capa del tablero ──────────────────────────────────
    cantones = json.loads((DATA / 'cantones.geojson').read_text(encoding='utf-8'))
    INEC = {}
    for f in cantones['features']:
        p = f['properties']
        INEC[(ap(p['dpa_despro']), norm(p['dpa_descan']))] = p

    # ── Nombres de la base electoral, por cantón y con sus años ─────────
    h = json.loads((DATA / 'historico.json').read_text(encoding='utf-8'))
    base = defaultdict(lambda: defaultdict(set))
    for dig in h['votos']:
        for a, p, c, r, _o, _v in h['votos'][dig]:
            base[(h['provincias'][p], h['cantones'][c])][h['parroquias'][r]].add(h['anios'][a])

    # ── 1 · Cantón y nombre de cada polígono ─────────────────────────────
    porCanton = defaultdict(list)
    sinCanton = []
    for f in capa['features']:
        a = f['properties']
        k = (ap(a['PROVINCIA']), ac(a['CANTON']))
        k = CANTON_SHP.get(k, k)
        if k not in INEC:
            sinCanton.append(f"{a['PROVINCIA']} / {a['CANTON']} / {a['PARROQUIA']}")
            continue
        nombreShp = norm(a['PARROQUIA'])
        nombre = NOMBRE_ELECTORAL.get(k + (nombreShp,)) or limpiar(a['PARROQUIA'])
        porCanton[k].append({'f': f, 'a': a, 'nombre': nombre, 'key': norm(nombre),
                             'renombrada': norm(nombre) != nombreShp, 'cne': set()})

    for k, parrs in porCanton.items():
        claves = [x['key'] for x in parrs]
        repetidas = {c for c in claves if claves.count(c) > 1}
        if repetidas:
            sys.exit(f'Nombre repetido dentro de {k}: {repetidas}')

    # ── 2 · Cruce con la base electoral ──────────────────────────────────
    # Mismo orden que parroquiaGeografica() en js/secciones.js.
    documentadas, pendientes, fuera = [], [], []
    for k, nombres in base.items():
        parrs = porCanton.get(k)
        if not parrs:
            fuera.extend(f'{k[0]} / {k[1]} / {n}' for n in nombres)
            continue
        for n, anios in nombres.items():
            sinEsp = n.replace(' ', '')
            destino = (next((x for x in parrs if x['key'] == n), None) or
                       next((x for x in parrs if x['key'].replace(' ', '') == sinEsp), None))
            if not destino and k + (n,) in NOMBRES_ANTERIORES:
                objetivo = NOMBRES_ANTERIORES[k + (n,)]
                destino = next((x for x in parrs if x['key'] == objetivo), None)
            if destino:
                destino['cne'].add(n)
                continue
            fila = f"{k[0]} / {k[1]} / {n}  ({', '.join(map(str, sorted(anios)))})"
            if n in SIN_POLIGONO.get(k, ('', set()))[1]:
                documentadas.append(fila)
            else:
                pendientes.append(fila)

    # ── 3 · Escritura en el esquema del tablero ──────────────────────────
    anterior = (json.loads(SALIDA.read_text(encoding='utf-8'))
                if SALIDA.exists() else None)
    orden = orden_de_referencia(anterior)
    salida = []
    for k in sorted(porCanton):
        canton = INEC[k]['dpa_canton']
        for x in sorted(porCanton[k], key=lambda x: orden(canton, x)):
            a, inec = x['a'], INEC[k]
            props = {
                'dpa_parroq': f"{a['CODPRO']}{int(a['CODCAN']):04d}{int(a['CODPAR']):04d}",
                'dpa_despar': x['nombre'],
                'dpa_canton': inec['dpa_canton'],
                'dpa_descan': inec['dpa_descan'],
                'dpa_provin': inec['dpa_provin'],
                'dpa_despro': inec['dpa_despro'],
                'estado': a['ESTADO'],
                'nombres_cne': '|'.join(sorted(x['cne'])),
            }
            if x['renombrada']:
                props['nombre_shp'] = a['PARROQUIA']
            if (ap(a['PROVINCIA']), ac(a['CANTON'])) != k:
                props['canton_shp'] = a['CANTON']
            salida.append({'type': 'Feature', 'geometry': x['f']['geometry'],
                           'properties': props})

    lineas = [json.dumps(f, ensure_ascii=False, separators=(',', ':')) for f in salida]
    SALIDA.write_text('{"type":"FeatureCollection", "features": [\n' +
                      ',\n'.join(lineas) + '\n]}', encoding='utf-8')

    # ── Informe ──────────────────────────────────────────────────────────
    sinDatos = [f"{k[0]} / {k[1]} / {x['nombre']}" for k in porCanton
                for x in porCanton[k] if not x['cne']]
    print(f'✓ {SALIDA}  ({SALIDA.stat().st_size / 1024:.0f} KB)')
    print(f'  {len(salida)} parroquias en {len(porCanton)} cantones')
    print(f"  {sum(1 for k in porCanton for x in porCanton[k] if x['renombrada'])} "
          'toman el nombre de la base electoral (otra grafía en el SHP)')
    if sinCanton:
        print(f'\n✗ {len(sinCanton)} sin cantón en la capa cantonal (se omiten):')
        for s in sinCanton:
            print('    ' + s)
    print(f'\nParroquias del SHP sin votos en la base ({len(sinDatos)}): '
          'creadas después de 2023 o zonas en estudio')
    for s in sorted(sinDatos):
        print('    ' + s)
    print(f'\nUnidades de años anteriores sin polígono vigente ({len(documentadas)}):')
    for k, (motivo, nombres) in SIN_POLIGONO.items():
        print(f'    {k[1]}: {motivo} — {len(nombres)}')
    print(f'\nCantones de la base con otra provincia en años anteriores ({len(fuera)}): '
          'no llegan al nivel parroquial')
    if pendientes:
        print(f'\n✗ {len(pendientes)} nombres de la base electoral SIN polígono (revisar):')
        for s in sorted(pendientes):
            print('    ' + s)
        sys.exit(1)
    print('\n✓ Todas las parroquias de la base electoral tienen su polígono '
          '(salvo las unidades históricas indicadas)')


if __name__ == '__main__':
    main()
