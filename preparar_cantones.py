#!/usr/bin/env python3
"""
Genera data/cantones.geojson a partir del SHP cantonal del CNE
(LIMITE_CANTONAL_CONALI_CNE_2022).

Qué hace
  1. Simplifica el SHP y lo pasa de UTM 17S a coordenadas geográficas
     (WGS84), que es lo que dibuja el mapa. Usa mapshaper.
  2. Cruza cada cantón del CNE con el cantón de la capa anterior y le pone
     EXACTAMENTE el mismo nombre, código y población. Todas las bases del
     tablero (preinscritos, electores, resultados, histórico, parroquias)
     se unen a los cantones por esos datos, así que siguen cruzando igual:
     solo cambia el dibujo de los límites.
  3. Guarda además el nombre oficial del CNE (con tildes) en «nombre_cne» y
     su código en «codigo_cne».
  4. Se detiene si algún cantón no cruza.

Uso
    python preparar_cantones.py RUTA/LIMITE_CANTONAL_CONALI_CNE_2022.shp

Requiere mapshaper (npm install -g mapshaper). Sin él, se puede hacer el
paso 1 en https://mapshaper.org —arrastrar los archivos .shp .dbf .shx .prj
.cpg, escribir en la consola el comando de SIMPLIFICAR y exportar en
GeoJSON— y pasarle a este script el .geojson resultante.
"""
import json
import re
import shutil
import subprocess
import sys
import tempfile
import unicodedata
from pathlib import Path

BASE = Path(__file__).parent
DATA = BASE / 'data'
SALIDA = DATA / 'cantones.geojson'

# «ISLA» (código 999) son islotes frente a Manabí sin cantón asignado.
SIMPLIFICAR = ("-filter \"CANTON != 'ISLA'\" -simplify interval=250 keep-shapes "
               "-proj wgs84")

ALIAS_PROV = {'STO DGO TSACHILAS': 'SANTO DOMINGO DE LOS TSACHILAS'}
# Nombre del CNE → nombre de la capa anterior (el que usan todas las bases).
ALIAS_CANT = {
    'ALFREDO BAQUERIZO MORENO JUJAN': 'ALFREDO BAQUERIZO MORENO',
    'CORONEL MARCELINO MARIDUENA': 'CRNEL MARCELINO MARIDUENA',
    'EL EMPALME': 'EMPALME',
    'GENERAL ANTONIO ELIZALDE': 'GNRAL ANTONIO ELIZALDE',
    'FRANCISCO DE ORELLANA': 'ORELLANA',
    'DISTRITO METROPOLITANO DE QUITO': 'QUITO',
}


def norm(s):
    s = str(s or '').upper().replace('Ð', 'Ñ').replace('Ñ', '\x01')
    s = ''.join(c for c in unicodedata.normalize('NFD', s)
                if unicodedata.category(c) != 'Mn')
    s = s.replace('\x01', 'N')
    s = re.sub(r'[^A-Z0-9]+', ' ', s)
    return s.strip()


def simplificar(ruta):
    if ruta.suffix.lower() == '.geojson':
        return json.loads(ruta.read_text(encoding='utf-8'))
    ms = shutil.which('mapshaper')
    if not ms:
        sys.exit('Falta mapshaper (npm install -g mapshaper). Ver la ayuda del script.')
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / 'cantones.geojson'
        cmd = f'"{ms}" "{ruta}" encoding=utf8 {SIMPLIFICAR} -o format=geojson precision=0.00001 "{out}"'
        subprocess.run(cmd, shell=True, check=True)
        return json.loads(out.read_text(encoding='utf-8'))


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    nueva = simplificar(Path(sys.argv[1]))
    anterior = json.loads(SALIDA.read_text(encoding='utf-8'))

    por_nombre = {}
    for f in anterior['features']:
        p = f['properties']
        por_nombre[(norm(p['dpa_despro']), norm(p['dpa_descan']))] = p

    salida, usados, sin_cruce = [], set(), []
    for f in nueva['features']:
        p = f['properties']
        prov = ALIAS_PROV.get(norm(p['PROVINCIA']), norm(p['PROVINCIA']))
        cant = ALIAS_CANT.get(norm(p['CANTON']), norm(p['CANTON']))
        viejo = por_nombre.get((prov, cant))
        if not viejo:
            sin_cruce.append((p['PROVINCIA'], p['CANTON']))
            continue
        usados.add((prov, cant))
        props = {k: viejo[k] for k in ['poblacion', 'dpa_descan', 'dpa_provin', 'dpa_despro', 'dpa_canton']
                 if k in viejo}
        props['nombre_cne'] = p['CANTON'].strip()
        props['codigo_cne'] = str(p['CODCAN']).strip()
        salida.append({'type': 'Feature', 'properties': props, 'geometry': f['geometry']})

    if sin_cruce:
        sys.exit(f'Cantones del CNE sin equivalente en la capa anterior: {sin_cruce}')
    fuera = sorted(set(por_nombre) - usados)
    print(f'  {len(salida)} cantones del CNE cruzados con la capa anterior')
    print(f'  de la capa anterior no pasan (zonas no delimitadas, hoy dentro de un cantón): {fuera}')
    if any(k[0] != 'ZONA NO DELIMITADA' for k in fuera):
        sys.exit('Hay cantones de la capa anterior que no están en la del CNE.')

    SALIDA.write_text(json.dumps({'type': 'FeatureCollection', 'features': salida},
                                 ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'  → {SALIDA}  ({SALIDA.stat().st_size / 1024:.0f} KB)')
    provincias_desde_cantones()


def provincias_desde_cantones():
    """
    La capa provincial se recalcula uniendo los cantones nuevos: así el borde
    de cada provincia coincide exactamente con el de sus cantones en el mapa.
    Nombre, código y población se conservan de la capa provincial anterior.
    """
    ruta = DATA / 'provincias.geojson'
    anterior = {f['properties']['dpa_despro']: f['properties']
                for f in json.loads(ruta.read_text(encoding='utf-8'))['features']}
    ms = shutil.which('mapshaper')
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / 'provincias.geojson'
        subprocess.run(f'"{ms}" "{SALIDA}" -dissolve dpa_despro copy-fields=dpa_provin '
                       f'-o format=geojson precision=0.00001 "{out}"', shell=True, check=True)
        nueva = json.loads(out.read_text(encoding='utf-8'))
    feats = []
    for f in nueva['features']:
        viejo = anterior.get(f['properties']['dpa_despro'])
        if not viejo:
            sys.exit(f"Provincia sin equivalente en la capa anterior: {f['properties']['dpa_despro']}")
        feats.append({'type': 'Feature', 'properties': dict(viejo), 'geometry': f['geometry']})
    fuera = sorted(set(anterior) - {f['properties']['dpa_despro'] for f in feats})
    ruta.write_text(json.dumps({'type': 'FeatureCollection', 'features': feats},
                               ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'  → {ruta}  ({len(feats)} provincias, {ruta.stat().st_size / 1024:.0f} KB); '
          f'no pasan: {fuera}')


if __name__ == '__main__':
    main()
