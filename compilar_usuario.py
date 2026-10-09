#!/usr/bin/env python3
"""
Genera una copia del tablero recortada a un solo territorio.

A diferencia del límite por usuario que aplica el navegador, aquí los datos
de los demás territorios **no se incluyen en los archivos**. Aunque alguien
mire la pestaña de Red o descargue los .json directamente, solo encontrará el
territorio de esta compilación, porque el resto no está publicado.

Uso:
    python compilar_usuario.py                    → Pedernales (por defecto)
    python compilar_usuario.py COTOPAXI "LA MANA" → La Maná
    python compilar_usuario.py MANABI JIPIJAPA    → otro cantón
    python compilar_usuario.py GUAYAS             → una provincia entera
Ninguna carpeta lleva contraseña: todas abren directo. El recorte es real,
los datos de los demás territorios no se incluyen en los archivos.

Salida:  ../CARPETA_ELECTORAL_<TERRITORIO>/
"""
import json
import re
import shutil
import sys
import unicodedata
from pathlib import Path

import pandas as pd

BASE = Path(__file__).parent
DATA = BASE / 'data'

PROVINCIA = (sys.argv[1] if len(sys.argv) > 1 else 'MANABI').upper()
# Con solo la provincia se compila la provincia entera.
CANTON = (sys.argv[2] if len(sys.argv) > 2 else
          ('' if len(sys.argv) > 1 else 'PEDERNALES')).upper()

# Territorio de cada compilación recortada (provincia, cantón), con los
# nombres normalizados: sin tildes y en mayúsculas.
#
# NINGUNA CARPETA LLEVA CONTRASEÑA. Todas abren directo: la compilación quita
# el formulario de entrada y el botón de salir del index.html. No hace falta
# proteger nada con una pantalla, porque el recorte ya ocurrió aquí: los datos
# de los demás territorios no se incluyen en los archivos.
#
# El 'nombre' es solo el rótulo del encabezado. El 'usuario' se conserva
# porque acceso.js abre sesión con él, pero ya no se escribe en ninguna parte.
USUARIOS = {
    ('MANABI', 'PEDERNALES'): {'usuario': 'pedernales', 'nombre': 'Pedernales'},
    ('COTOPAXI', 'LA MANA'): {'usuario': 'lamana', 'nombre': 'La Maná'},
    ('PICHINCHA', ''): {'usuario': 'pichincha', 'nombre': 'Pichincha'},
}

# Las candidaturas a prefecto son provinciales y no llevan cantón. Se
# conservan las de la provincia porque son las que aparecen en la papeleta de
# este cantón; sin ellas, la vista de Prefectos quedaría vacía.
# Ponlo en False para un recorte estricto al cantón.
INCLUIR_PREFECTOS_PROVINCIALES = True


def norm(s):
    s = str(s).upper().replace('Ñ', '\x01')
    s = ''.join(c for c in unicodedata.normalize('NFD', s)
                if unicodedata.category(c) != 'Mn')
    s = s.replace('\x01', 'N')
    s = ''.join(c if c.isalnum() else ' ' for c in s)
    return ' '.join(s.split())


PROVK, CANTK = norm(PROVINCIA), norm(CANTON)
DESTINO = BASE.parent / ('CARPETA_ELECTORAL_' + (CANTK or PROVK).replace(' ', '_'))
USUARIO = USUARIOS.get((PROVK, CANTK))
if not USUARIO:
    sys.exit(f'Falta el usuario de {PROVK}' + (f' / {CANTK}' if CANTK else '') +
             ': agrégalo en USUARIOS, al inicio de este archivo.')

print(f'Recortando a: {PROVK}' + (f' / {CANTK}' if CANTK else ' (provincia entera)'))
print(f'Destino: {DESTINO}\n')


def reindexar(obj, tablas, columna, filas):
    """
    Reduce las tablas de nombres a lo realmente usado y reescribe los índices.

    Los archivos guardan los nombres largos aparte y los registros solo llevan
    su posición. Al recortar los registros hay que recortar también esas
    tablas, o el archivo seguiría publicando la lista completa de cantones,
    parroquias, organizaciones y candidatos del país.
    """
    mapas = {}
    for tabla in tablas:
        col = columna.get(tabla)
        if col is None or tabla not in obj:
            continue
        usados = sorted({f[col] for f in filas})
        nuevos = [obj[tabla][i] for i in usados]
        mapa = {viejo: i for i, viejo in enumerate(usados)}
        for f in filas:
            f[col] = mapa[f[col]]
        obj[tabla] = nuevos
        mapas[tabla] = mapa
    return mapas


def leer(n):
    p = DATA / n
    return json.loads(p.read_text(encoding='utf-8')) if p.exists() else None


def escribir(n, obj):
    p = DESTINO / 'data' / n
    p.write_text(json.dumps(obj, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'   {n}  ({p.stat().st_size / 1024:.0f} KB)')


# ── Copia del código, sin los scripts que necesitan las bases originales ──
if DESTINO.exists():
    shutil.rmtree(DESTINO)
(DESTINO / 'data').mkdir(parents=True)
for item in ['index.html', 'css', 'js', 'assets', 'asignacion', 'servidor.py']:
    o = BASE / item
    (shutil.copytree if o.is_dir() else shutil.copy2)(o, DESTINO / item)
print('1 · Código copiado (sin los scripts de preparación)\n')

# ── Cartografía ──────────────────────────────────────────────────────────
print('2 · Cartografía')
prov = leer('provincias.geojson')
prov['features'] = [f for f in prov['features']
                    if norm(f['properties']['dpa_despro'].replace('Ð', 'Ñ')) == PROVK]
escribir('provincias.geojson', prov)

cant = leer('cantones.geojson')
cant['features'] = [f for f in cant['features']
                    if norm(f['properties']['dpa_despro'].replace('Ð', 'Ñ')) == PROVK
                    and (not CANTK or norm(f['properties']['dpa_descan'].replace('Ð', 'Ñ')) == CANTK)]
escribir('cantones.geojson', cant)

parr = leer('parroquias.geojson')
if parr:
    parr['features'] = [f for f in parr['features']
                        if norm(f['properties']['dpa_despro'].replace('Ð', 'Ñ')) == PROVK
                        and (not CANTK or norm(f['properties']['dpa_descan'].replace('Ð', 'Ñ')) == CANTK)]
    escribir('parroquias.geojson', parr)

# ── Preinscritos ─────────────────────────────────────────────────────────
print('\n3 · Preinscritos')
df = pd.read_excel(DATA / 'preinscritos.xlsx', dtype=str).fillna('')
mask = df['PROVINCIA'].map(norm) == PROVK
if CANTK:
    esCanton = df['CANTON'].map(norm) == CANTK
    sinCanton = df['CANTON'].map(norm) == ''
    mask &= (esCanton | (sinCanton if INCLUIR_PREFECTOS_PROVINCIALES else False))
sub = df[mask]
with pd.ExcelWriter(DESTINO / 'data' / 'preinscritos.xlsx', engine='openpyxl') as w:
    sub.to_excel(w, sheet_name='PREINSCRITOS', index=False)
print(f'   preinscritos.xlsx  ({len(sub)} de {len(df)} filas)')
print(f'     {sub["DIGNIDAD"].value_counts().to_dict()}')

# ── Electores ────────────────────────────────────────────────────────────
print('\n4 · Electores')
el = leer('electores.json')
if el:
    clave = f'{PROVK}|{CANTK}' if CANTK else None
    el['cantones'] = {k: v for k, v in el['cantones'].items()
                      if k.startswith(PROVK + '|') and (not clave or k == clave)}
    el['provincias'] = {PROVK: sum(el['cantones'].values())}
    el['total'] = sum(el['cantones'].values())
    escribir('electores.json', el)
    print(f'     {el["total"]:,} electores')

# ── Grupos etarios ───────────────────────────────────────────────────────
print('\n5 · Grupos etarios')
et = leer('etario2027.json')
if et:
    clave = f'{PROVK}|{CANTK}' if CANTK else None
    et['cantones'] = {k: v for k, v in et['cantones'].items()
                      if k.startswith(PROVK + '|') and (not clave or k == clave)}
    tot = [sum(v[i] for v in et['cantones'].values()) for i in range(len(et['grupos']))]
    et['provincias'] = {PROVK: tot}
    et['pais'] = tot
    et['exterior'] = [0] * len(et['grupos'])
    escribir('etario2027.json', et)
    print(f'     {sum(tot):,} electores por grupo')

# ── Resultados 2023 ──────────────────────────────────────────────────────
print('\n6 · Resultados 2023')
rs = leer('resultados2023.json')
if rs:
    for dig in list(rs['registros']):
        rs['registros'][dig] = [
            r for r in rs['registros'][dig]
            if rs['provincias'][r[0]] == PROVK
            and (not CANTK or rs['cantones'][r[1]] == CANTK)]
    # Las tablas de nombres se reconstruyen con lo que queda: si no, el
    # archivo seguiría listando los 1.730 candidatos del país aunque sus
    # registros ya no estén.
    filas = [r for v in rs['registros'].values() for r in v]
    # La parroquia va con -1 cuando la base no la ubica en ningún polígono;
    # reindexar() no sabría qué hacer con ese valor, así que esas filas se
    # apartan, se reindexa el resto y se vuelven a unir con su -1 intacto.
    conParr = [r for r in filas if r[2] >= 0]
    reindexar(rs, ['parroquias'], {'parroquias': 2}, conParr)
    reindexar(rs, ['provincias', 'cantones', 'candidatos', 'organizaciones'],
              {'provincias': 0, 'cantones': 1, 'candidatos': 3, 'organizaciones': 4},
              filas)
    escribir('resultados2023.json', rs)
    n = sum(len(v) for v in rs['registros'].values())
    print(f"     {n} candidaturas · {len(rs['candidatos'])} nombres, "
          f"{len(rs['organizaciones'])} organizaciones, "
          f"{len(rs.get('parroquias', []))} parroquias")

# ── Escaños por cantón ───────────────────────────────────────────────────
print('\n6b · Escaños por cantón')
es = leer('escanos.json')
if es:
    def mio(k):
        return k.startswith(PROVK + '|') and (not CANTK or k == f'{PROVK}|{CANTK}')
    for bloque in ('escanos', 'circunscripciones'):
        for dig in list(es.get(bloque, {})):
            es[bloque][dig] = {k: v for k, v in es[bloque][dig].items() if mio(k)}
    escribir('escanos.json', es)
    print('     ' + ', '.join(f'{d}: {len(v)}' for d, v in es['escanos'].items()))

# ── Histórico ────────────────────────────────────────────────────────────
print('\n7 · Histórico electoral')
h = leer('historico.json')
if h:
    # La escala de color se calcula ANTES de recortar y se guarda en el
    # archivo, para que los colores signifiquen lo mismo que en el tablero
    # completo sin necesidad de publicar los datos del resto del país.
    from collections import defaultdict
    esc = {}
    for nivel, corte in [('provincia', 3), ('canton', 4), ('parroquia', 5)]:
        acc = defaultdict(lambda: [0, 0, 0])
        for dig in h['votos']:
            for reg in h['votos'][dig]:
                acc[tuple([dig] + reg[:corte - 1])][0] += reg[5]
            for reg in h['nuloblanco'][dig]:
                k = tuple([dig] + reg[:corte - 1])
                acc[k][1] += reg[4]
                acc[k][2] += reg[5]
        r = {'pctValidos': [1e9, -1e9], 'pctNulos': [1e9, -1e9], 'pctBlancos': [1e9, -1e9]}
        for v, n_, b in acc.values():
            em = v + n_ + b
            if em < 50:
                continue
            for k, x in [('pctValidos', v), ('pctNulos', n_), ('pctBlancos', b)]:
                p = x * 100 / em
                r[k][0] = min(r[k][0], p)
                r[k][1] = max(r[k][1], p)
        esc[nivel] = r
    h['escalas'] = esc
    print('   escala de color nacional conservada: '
          f"nulos por cantón {esc['canton']['pctNulos'][0]:.2f} – "
          f"{esc['canton']['pctNulos'][1]:.2f} %")

    ip = h['provincias'].index(PROVK)
    ic = h['cantones'].index(CANTK) if CANTK else None
    for dig in list(h['votos']):
        h['votos'][dig] = [r for r in h['votos'][dig]
                           if r[1] == ip and (ic is None or r[2] == ic)]
        h['nuloblanco'][dig] = [r for r in h['nuloblanco'][dig]
                                if r[1] == ip and (ic is None or r[2] == ic)]
    # Igual que en resultados: sin esto quedarían listadas las 1.099
    # parroquias y las 1.178 organizaciones del país.
    # La tabla de candidaturas se recorta a las elecciones que quedan, antes
    # de reindexar: si no, publicaría los 6.711 nombres del país.
    if h.get('porEleccion'):
        usados = set()
        nuevo_pe = {}
        for dig, tabla in h['porEleccion'].items():
            m = {}
            for k, ci in tabla.items():
                partes = [int(x) for x in k.split('|')]
                if partes[1] != ip:
                    continue
                if dig == 'ALCALDES' and ic is not None and partes[2] != ic:
                    continue
                m[k] = ci
                usados.add(ci)
            nuevo_pe[dig] = m
        orden = sorted(usados)
        mapaC = {v: i for i, v in enumerate(orden)}
        h['candidatos'] = [h['candidatos'][i] for i in orden]
        h['porEleccion'] = {d: {k: mapaC[v] for k, v in m.items()}
                            for d, m in nuevo_pe.items()}
        print(f"     {len(h['candidatos'])} candidaturas conservadas")

    filas = ([r for v in h['votos'].values() for r in v] +
             [r for v in h['nuloblanco'].values() for r in v])
    # Las claves de porEleccion llevan índices de año, provincia, cantón y
    # organización, así que hay que reescribirlas junto con las tablas.
    claves_pe = {d: list(m.items()) for d, m in (h.get('porEleccion') or {}).items()}
    mapas = reindexar(h, ['provincias', 'cantones', 'parroquias', 'organizaciones'],
                      {'provincias': 1, 'cantones': 2, 'parroquias': 3},
                      filas)
    mapas.update(reindexar(h, ['organizaciones'], {'organizaciones': 4},
                           [r for v in h['votos'].values() for r in v]))
    if claves_pe:
        h['porEleccion'] = {}
        for dig, pares in claves_pe.items():
            m = {}
            for k, ci in pares:
                p_ = [int(x) for x in k.split('|')]
                if dig == 'ALCALDES':
                    a_, pr_, ca_, op_ = p_
                    nk = (f"{a_}|{mapas['provincias'][pr_]}|{mapas['cantones'][ca_]}"
                          f"|{mapas['organizaciones'][op_]}")
                else:
                    a_, pr_, op_ = p_
                    nk = f"{a_}|{mapas['provincias'][pr_]}|{mapas['organizaciones'][op_]}"
                m[nk] = ci
            h['porEleccion'][dig] = m
    escribir('historico.json', h)
    n = sum(len(v) for v in h['votos'].values())
    print(f"     {n} registros · {len(h['parroquias'])} parroquias, "
          f"{len(h['organizaciones'])} organizaciones")

# ── Concejales y vocales (Histórico) ─────────────────────────────────────
# Mismo recorte que historico.json: se filtran las filas y las tablas de
# nombres se reducen a lo que queda. Una dignidad sin filas sale del archivo y
# su botón no aparece en el tablero; el archivo se publica igual (aunque quede
# vacío) para que el navegador no registre una petición fallida.
print('\n7b · Concejales y vocales (histórico)')
hd = leer('historico_dignidades.json')
if hd:
    P, C = hd['provincias'], hd['cantones']

    def dentro(p, c=None):
        return P[p] == PROVK and (c is None or not CANTK or C[c] == CANTK)
    for dig in list(hd.get('votos', {})):
        hd['votos'][dig] = [r for r in hd['votos'][dig] if dentro(r[1], r[2])]
        hd['nuloblanco'][dig] = [r for r in hd['nuloblanco'].get(dig, []) if dentro(r[1], r[2])]
    for dig, n in (hd.get('postulantes') or {}).items():
        n['prov'] = [f for f in n['prov'] if dentro(f[1])]
        n['cant'] = [f for f in n['cant'] if dentro(f[1], f[2])]
        n['parr'] = [f for f in n['parr'] if dentro(f[1], f[2])]
        pais = {}
        for f in (n['cant'] if CANTK else n['prov']):
            pais[str(f[0])] = pais.get(str(f[0]), 0) + f[-1]
        n['pais'] = pais
    for dig in [d for d, filas in hd['votos'].items() if not filas]:
        for campo in ['votos', 'nuloblanco', 'etiquetas', 'postulantes', 'replicas']:
            (hd.get(campo) or {}).pop(dig, None)
    # Tablas de nombres: solo lo que siguen citando los registros.
    votos = [r for v in hd['votos'].values() for r in v]
    nb = [r for v in hd['nuloblanco'].values() for r in v]
    post = {nivel: [f for n in (hd.get('postulantes') or {}).values() for f in n[nivel]]
            for nivel in ['prov', 'cant', 'parr']}
    reindexar(hd, ['provincias'], {'provincias': 1},
              votos + nb + post['prov'] + post['cant'] + post['parr'])
    reindexar(hd, ['cantones'], {'cantones': 2}, votos + nb + post['cant'] + post['parr'])
    reindexar(hd, ['parroquias'], {'parroquias': 3}, votos + nb + post['parr'])
    reindexar(hd, ['organizaciones'], {'organizaciones': 4}, votos)
    escribir('historico_dignidades.json', hd)
    print(f"     dignidades con datos: {', '.join(hd['votos']) or 'ninguna (sus botones no aparecen)'}")
    print(f"     {len(votos)} registros · {len(hd['parroquias'])} parroquias, "
          f"{len(hd['organizaciones'])} organizaciones")

# ── Postulantes ──────────────────────────────────────────────────────────
print('\n8 · Postulantes')
po = leer('postulantes.json')
if po:
    for dig in po['niveles']:
        n = po['niveles'][dig]
        n['prov'] = {k: v for k, v in n['prov'].items() if k.split('|')[1] == PROVK}
        n['cant'] = {k: v for k, v in n['cant'].items()
                     if k.split('|')[1] == PROVK
                     and (not CANTK or k.split('|')[2] == CANTK)}
        n['parr'] = {k: v for k, v in n['parr'].items()
                     if k.split('|')[1] == PROVK
                     and (not CANTK or k.split('|')[2] == CANTK)}
        base = n['cant'] if CANTK else n['prov']
        pais = {}
        for k, v in base.items():
            pais[k.split('|')[0]] = pais.get(k.split('|')[0], 0) + v
        n['pais'] = pais
    escribir('postulantes.json', po)

# ── Juntas y recintos (distributivo) ─────────────────────────────────────
# Solo los recintos del territorio. Las tablas de cantones, parroquias y
# nombres se reducen a lo que queda, como en resultados2023.json.
print('\n8b · Juntas y recintos (distributivo)')
di = leer('distributivo.json')
if di:
    def en_territorio(clave):
        p, c = clave.split('|')
        return p == PROVK and (not CANTK or c == CANTK)
    di['recintos'] = [r for r in di['recintos'] if en_territorio(di['cantones'][r[0]])]
    reindexar(di, ['cantones', 'parroquias'], {'cantones': 0, 'parroquias': 1}, di['recintos'])
    di['nombres'] = {k: v for k, v in di['nombres'].items()
                     if k == PROVK or ('|' in k and en_territorio(k))}
    escribir('distributivo.json', di)
    print(f"     {len(di['recintos'])} recintos, "
          f"{sum(r[5] + r[6] for r in di['recintos'])} juntas")

# ── Un solo usuario en la pantalla de acceso ─────────────────────────────
print('\n9 · Acceso')
ac = (DESTINO / 'js' / 'acceso.js').read_text(encoding='utf-8')
bloque = f"""  usuarios: [
    {{
      usuario: '{USUARIO['usuario']}',
      nombre: '{USUARIO['nombre']}',
      /* Esta compilación solo contiene este territorio: el alcance no hace
         falta para recortar nada, sirve para rotularlo en el encabezado. */
      alcance: {{ provincia: '{PROVK}'{f", canton: '{CANTK}'" if CANTK else ''} }}
    }}
  ],"""
ac = re.sub(r'  usuarios: \[.*?\n  \],', bloque, ac, count=1, flags=re.S)
bloqueUsuarios = re.search(r'  usuarios: \[.*?\n  \],', ac, re.S).group(0)
assert USUARIO['usuario'] in bloqueUsuarios and "'admin'" not in bloqueUsuarios, \
    'no se reemplazó la lista de usuarios'
(DESTINO / 'js' / 'acceso.js').write_text(ac, encoding='utf-8')

# Sin formulario de acceso, iniciarAcceso() abre sesión sola con el único
# usuario de la lista (ver js/acceso.js). Se quitan también el botón de salir
# y su hueco en el encabezado, que ya no llevan a ninguna parte. La carpeta
# completa ya viene sin ellos, así que puede no haber nada que quitar.
ix = (DESTINO / 'index.html').read_text(encoding='utf-8')
antes = len(ix)
ix = re.sub(r'\n<!-- ══ ACCESO [═ ]*-->\n<div id="capa-acceso".*?\n</div>\n',
            '\n', ix, count=1, flags=re.S)
ix = re.sub(r'\n *<button type="button" id="btn-salir".*?</button>\n',
            '\n', ix, count=1, flags=re.S)
assert 'capa-acceso' not in ix and 'btn-salir' not in ix, \
    'quedó algo de la pantalla de acceso en index.html'
(DESTINO / 'index.html').write_text(ix, encoding='utf-8')
assert 'clave' not in re.search(r'  usuarios: \[.*?\n  \],', ac, re.S).group(0), \
    'quedó una contraseña en acceso.js'
print(f'   sin contraseña: el tablero abre directo como «{USUARIO["nombre"]}»')
print(f'   un solo usuario: {USUARIO["usuario"]} (se eliminó admin)'
      + (f' · index.html: {antes - len(ix)} caracteres menos' if antes != len(ix) else ''))

# ── Verificación: nada ajeno debe quedar en los archivos ─────────────────
print('\n10 · Verificación')
rasgos = lambda n: json.loads((DATA / n).read_text(encoding='utf-8'))['features']
dep = lambda f, k: norm(f['properties'][k].replace('Ð', 'Ñ'))

cantones = rasgos('cantones.geojson')
todos = {dep(f, 'dpa_descan') for f in cantones}
todos |= {dep(f, 'dpa_despro') for f in rasgos('provincias.geojson')}

# Territorio de esta compilación: la provincia y el cantón elegido o —si se
# compila la provincia entera— todos sus cantones.
dentro = lambda f: dep(f, 'dpa_despro') == PROVK and (not CANTK or dep(f, 'dpa_descan') == CANTK)
permitidos = {PROVK} | {dep(f, 'dpa_descan') for f in cantones if dentro(f)}
if (DATA / 'parroquias.geojson').exists():
    parrs = rasgos('parroquias.geojson')
    propias = {dep(f, 'dpa_despar') for f in parrs if dentro(f)}
    # Las parroquias de fuera también se vigilan, salvo las que se llaman
    # igual que una propia (hay homónimas en otras provincias).
    todos |= {dep(f, 'dpa_despar') for f in parrs} - propias
    permitidos |= propias

def territorioHistorico():
    """
    Cantones y parroquias que la BASE ELECTORAL registra dentro de este
    territorio, aunque la cartografía de hoy no los tenga ahí.

    Son de dos clases, y en ambas los votos son de esta provincia:
      · unidades que cambiaron de provincia —Santo Domingo fue cantón de
        Pichincha hasta 2007, y votó así en 2004—;
      · parroquias que ya no existen con ese nombre —las urbanas de Quito
        anteriores a 2014, como San Blas o Santa Prisca—, que además se
        llaman igual que parroquias de otras provincias.
    Quitarlas de esta copia cambiaría las cifras de esos años respecto de la
    carpeta completa, así que se conservan; lo que se comprueba es que no
    entre nada de OTRO territorio.
    """
    out = set()
    for nombre in ['historico.json', 'historico_dignidades.json']:
        base = leer(nombre)
        if not base or PROVK not in base.get('provincias', []):
            continue
        ip = base['provincias'].index(PROVK)
        ic = base['cantones'].index(CANTK) if CANTK and CANTK in base['cantones'] else None
        for dig in base.get('votos', {}):
            for anio, fp, fc, fr, *_ in base['votos'][dig]:
                if fp != ip or (ic is not None and fc != ic):
                    continue
                out.add(base['cantones'][fc])
                out.add(base['parroquias'][fr])
    return out


historicos = territorioHistorico() - permitidos
permitidos |= historicos
ajenos = todos - permitidos

def texto_revisable(p):
    """
    El archivo tal cual, salvo los campos de texto libre: el nombre y la
    direccion de un recinto citan calles y colegios que se llaman como otros
    territorios (EUGENIO ESPEJO, BAHIA DE CARAQUEZ) sin serlo.
    """
    txt = p.read_text(encoding='utf-8')
    if p.name != 'distributivo.json':
        return txt
    j = json.loads(txt)
    j['recintos'] = [r[:3] + r[5:] for r in j.get('recintos', [])]
    j.pop('nombres', None)
    return json.dumps(j, ensure_ascii=False)


problemas = []
for p in sorted((DESTINO / 'data').glob('*.json')):
    txt = texto_revisable(p)
    fuera = [c for c in ajenos if c and f'"{c}"' in txt]
    if fuera:
        problemas.append(f'{p.name}: {fuera[:4]}')
if problemas:
    print('   \u2717 quedan territorios ajenos:')
    for x in problemas:
        print('      ' + x)
    sys.exit(1)
print(f'   \u2713 ningún otro cantón aparece en los datos publicados')
if historicos:
    usados = sorted(c for c in historicos
                    if any(f'"{c}"' in texto_revisable(q)
                           for q in (DESTINO / 'data').glob('*.json')))
    if usados:
        print(f'   · se conservan, por haber pertenecido a {PROVK} en los años '
              f'en que se votó: {", ".join(usados)}')

tam = sum(f.stat().st_size for f in DESTINO.rglob('*') if f.is_file())
orig = sum(f.stat().st_size for f in BASE.rglob('*') if f.is_file())
print(f'\n\u2713 Listo. {tam / 1024 / 1024:.1f} MB (el completo ocupa {orig / 1024 / 1024:.1f} MB)')
print(f'   cd {DESTINO.name} && python servidor.py')
