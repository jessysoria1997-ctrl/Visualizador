#!/usr/bin/env python3
"""
Genera data/vocales.json para la sección «Vocales-Escaños»: las parroquias
rurales que eligieron vocales de juntas parroquiales en 2023, con sus nombres
EXACTOS tal como están en la base del cliente, sus códigos, sus totales de
2023 y la composición de cada junta (5 o 7 vocales principales).

Fuente: Base_Consolidada_Concejales_Vocales_2004_2023.sav (la misma base de la
que sale data/historico_dignidades.json). Solo se leen las filas de 2023 con
DIGNIDAD_NOMBRE «VOCALES DE JUNTA PARROQUIAL»: ningún voto de alcaldes,
prefectos ni concejales entra aquí.

Qué guarda por parroquia
  claves     provK|cantK|parrK con la normalización y los alias de siempre
             (los de js/data.js), para cruzarla en el tablero con su polígono,
             con el registro de inscripción 2027 y con el padrón.
  nombres    provincia, cantón y parroquia LITERALES de la base (con su Ñ,
             sus barras y sus espacios): no se corrigen ni se acortan.
  códigos    PROVINCIA_CODIGO, CANTON_CODIGO, PARROQUIA_CODIGO.
  2023       sufragantes, votos válidos (suma de las organizaciones), nulos,
             blancos y número de organizaciones. La base trae cada parroquia
             partida por sexo (juntas de mujeres y de hombres): sufragantes,
             nulos y blancos se repiten en cada fila de la misma junta, así que
             se toma uno por (parroquia, sexo) y después se suma.
  vocales    principales que eligió en 2023: 5, salvo Calderón y Conocoto
             (Quito), que eligieron 7. El CNE eligió 4.109 vocales en 821
             parroquias (819 × 5 + 2 × 7); el script se detiene si la base no
             trae exactamente esas 821 parroquias.

Controles (quedan en «control» y se imprimen)
  parroquias duplicadas, organización repetida en una misma junta, votos
  ausentes o negativos, nombres distintos para un mismo código, juntas donde
  los sufragantes no coinciden con válidos + nulos + blancos (es un rasgo de la
  base oficial: se informa y no se corrige).

En el tablero, el número de vocales que se reparte es el del registro de
inscripción 2027 (cada lista inscribe tantos candidatos principales como
vocales se eligen), igual que en concejales; este archivo es el respaldo y la
referencia de 2023.

Uso
    python preparar_vocales.py RUTA/Base_Consolidada_Concejales_Vocales_2004_2023.sav

No necesita pyreadstat: trae su propio lector del formato .sav de SPSS
(compresión por bytecode), probado con esta base.
"""
import json
import struct
import sys
import unicodedata
from collections import Counter
from pathlib import Path

import numpy as np
import pandas as pd

BASE = Path(__file__).parent
SALIDA = BASE / 'data' / 'vocales.json'

# Mismos alias que preparar_historico_dignidades.py y js/data.js.
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
# Composición de las juntas en 2023: las de siete vocales.
SIETE_2023 = {('PICHINCHA', 'QUITO', 'CALDERON'), ('PICHINCHA', 'QUITO', 'CONOCOTO')}
PARROQUIAS_2023 = 821
VOCALES_2023 = 4109
FUENTE_COMPOSICION = ('CNE, elecciones seccionales 2023: 4.109 vocales de juntas parroquiales rurales en '
                      '821 parroquias; 819 eligen 5 y dos, Calderón y Conocoto (Quito), eligen 7 por superar '
                      'los 50.000 habitantes (cifras del CNE publicadas por Primicias el 3 de septiembre de 2022 '
                      'y el 5 de febrero de 2023).')


def norm(s):
    """Réplica de normalizarTexto() de js/data.js."""
    s = str(s if s is not None else '').upper().replace('Ñ', '\x01')
    s = ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')
    s = s.replace('\x01', 'N')
    s = ''.join(c if c.isalnum() else ' ' for c in s)
    return ' '.join(s.split())


# ── Lector del .sav (formato de sistema de SPSS, $FL2) ──────────────────────

def leer_sav(ruta):
    datos = Path(ruta).read_bytes()
    if datos[:4] != b'$FL2':
        raise SystemExit('Formato no admitido: ' + repr(datos[:4]) + ' (se espera $FL2).')
    e = '<' if struct.unpack_from('<i', datos, 64)[0] in (2, 3) else '>'
    case_size, comp, _peso, ncasos = struct.unpack_from(e + '4i', datos, 68)
    bias = struct.unpack_from(e + 'd', datos, 84)[0]
    i32 = lambda p: struct.unpack_from(e + 'i', datos, p)[0]
    pos, unidad, variables = 176, 0, []
    largos, codif = {}, None
    while True:
        rec = i32(pos)
        if rec == 2:
            tipo, etq, nmiss = struct.unpack_from(e + '3i', datos, pos + 4)
            nombre = datos[pos + 24:pos + 32].decode('latin-1').strip()
            pos += 32
            if etq:
                pos += 4 + ((i32(pos) + 3) // 4) * 4
            if nmiss:
                pos += abs(nmiss) * 8
            if tipo == -1:
                variables[-1]['seg'].append(unidad)
            else:
                variables.append({'corto': nombre, 'num': tipo == 0, 'seg': [unidad]})
            unidad += 1
        elif rec == 3:
            n = i32(pos + 4)
            pos += 8
            for _ in range(n):
                pos += 8 + ((datos[pos + 8] + 8) // 8) * 8
            if i32(pos) == 4:
                pos += 8 + 4 * i32(pos + 4)
        elif rec == 6:
            pos += 8 + 80 * i32(pos + 4)
        elif rec == 7:
            sub, tam, cnt = struct.unpack_from(e + '3i', datos, pos + 4)
            cuerpo = datos[pos + 16:pos + 16 + tam * cnt]
            if sub == 20:
                codif = cuerpo.decode('ascii').strip('\x00 ')
            elif sub == 13:
                for par in cuerpo.decode('latin-1').split('\t'):
                    if '=' in par:
                        a, b = par.split('=', 1)
                        largos[a.strip()] = b.strip()
            elif sub == 14:
                raise SystemExit('La base trae textos de más de 255 letras: este lector no los admite.')
            pos += 16 + tam * cnt
        elif rec == 999:
            pos += 8
            break
        else:
            raise SystemExit(f'Registro {rec} desconocido en el byte {pos}.')
    if comp != 1:
        raise SystemExit('Solo se admite la compresión por bytecode (la de esta base).')
    cuerpo = np.frombuffer(datos, dtype=np.uint8, offset=pos)
    b = bytes(cuerpo)
    inicios, p = [], 0
    while p + 8 <= len(b):
        bloque = b[p:p + 8]
        inicios.append(p)
        if 252 in bloque:
            break
        p += 8 + 8 * bloque.count(253)
    inicios = np.array(inicios, dtype=np.int64)
    cod = cuerpo[inicios[:, None] + np.arange(8)[None, :]]
    pos_crudo = (inicios[:, None] + 8 + 8 * (np.cumsum(cod == 253, axis=1) - 1)).reshape(-1)
    plano = cod.reshape(-1)
    fin = np.where(plano == 252)[0]
    if len(fin):
        plano, pos_crudo = plano[:fin[0]], pos_crudo[:fin[0]]
    validos = plano != 0
    codigos, pos_crudo = plano[validos], pos_crudo[validos]
    if len(codigos) != ncasos * case_size:
        raise SystemExit('La base está incompleta o dañada.')
    crudo = codigos == 253
    valores = cuerpo[pos_crudo[crudo][:, None] + np.arange(8)[None, :]]
    idx = np.full(len(codigos), -1, dtype=np.int64)
    idx[crudo] = np.arange(int(crudo.sum()))
    out = {}
    for v in variables:
        nombre = largos.get(v['corto'], v['corto'])
        if v['num']:
            u = np.arange(ncasos, dtype=np.int64) * case_size + v['seg'][0]
            c = codigos[u]
            col = np.full(ncasos, np.nan)
            m = (c >= 1) & (c <= 251)
            col[m] = c[m] - bias
            mc = c == 253
            col[mc] = valores[idx[u[mc]]].copy().view(e + 'f8').reshape(-1)
            out[nombre] = col
        else:
            trozos = np.full((ncasos, 8 * len(v['seg'])), 32, dtype=np.uint8)
            for j, s in enumerate(v['seg']):
                u = np.arange(ncasos, dtype=np.int64) * case_size + s
                mc = codigos[u] == 253
                bloque = np.full((ncasos, 8), 32, dtype=np.uint8)
                bloque[mc] = valores[idx[u[mc]]]
                trozos[:, 8 * j:8 * j + 8] = bloque
            ancho = trozos.shape[1]
            filas = trozos.tobytes()
            memo, col = {}, []
            for i in range(ncasos):
                r = filas[i * ancho:(i + 1) * ancho]
                t = memo.get(r)
                if t is None:
                    t = memo[r] = r.decode(codif or 'utf-8', errors='replace').rstrip(' \x00')
                col.append(t)
            out[nombre] = col
    return pd.DataFrame(out)


# ── Principal ───────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    ruta = Path(sys.argv[1])
    df = leer_sav(ruta)
    print(f'  {len(df):,} filas en la base')
    v = df[(df['FECHA_ELECCION'] == 2023) & (df['DIGNIDAD_NOMBRE'].str.strip() == 'VOCALES DE JUNTA PARROQUIAL')].copy()
    if v.empty:
        raise SystemExit('La base no trae filas de 2023 con DIGNIDAD_NOMBRE «VOCALES DE JUNTA PARROQUIAL».')
    print(f'  {len(v):,} filas de vocales 2023')
    COD = ['PROVINCIA_CODIGO', 'CANTON_CODIGO', 'PARROQUIA_CODIGO']
    UNI = COD + ['SEXO']
    control = {}

    # Votos ausentes o negativos: se detiene, no se rellenan.
    for c in ['VOTOS', 'VOTOS_BLANCOS', 'VOTOS_NULOS', 'SUFRAGANTES']:
        malos = int(v[c].isna().sum()) + int((v[c] < 0).sum())
        if malos:
            raise SystemExit(f'{malos} filas con {c} vacío o negativo: revisa la base.')
    control['votosAusentesONegativos'] = 0

    # Una organización no puede repetirse en la misma junta.
    rep = v.groupby(UNI + ['OP_CODIGO']).size()
    control['organizacionRepetida'] = int((rep > 1).sum())
    if control['organizacionRepetida']:
        raise SystemExit(f"{control['organizacionRepetida']} organizaciones repetidas dentro de una junta.")

    # Sufragantes, nulos y blancos: el mismo valor en todas las filas de una junta.
    g = v.groupby(UNI)
    for c in ['SUFRAGANTES', 'VOTOS_BLANCOS', 'VOTOS_NULOS']:
        n = int((g[c].nunique() > 1).sum())
        if n:
            raise SystemExit(f'{c} cambia dentro de {n} juntas: no se puede desduplicar.')

    # Un solo nombre por código (si no, ¿cuál es el exacto?).
    for col, k in [('PROVINCIA_NOMBRE', COD[:1]), ('CANTON_NOMBRE', COD[:2]), ('PARROQUIA_NOMBRE', COD)]:
        n = int((v.groupby(k)[col].nunique() > 1).sum())
        if n:
            raise SystemExit(f'{n} códigos con más de un {col}.')
    control['nombresDistintosPorCodigo'] = 0

    juntas = v.drop_duplicates(UNI)
    par = juntas.groupby(COD).agg(
        provincia=('PROVINCIA_NOMBRE', 'first'), canton=('CANTON_NOMBRE', 'first'),
        parroquia=('PARROQUIA_NOMBRE', 'first'), sufragantes=('SUFRAGANTES', 'sum'),
        blancos=('VOTOS_BLANCOS', 'sum'), nulos=('VOTOS_NULOS', 'sum'), juntas=('SEXO', 'size')).reset_index()
    votos = v.groupby(COD).agg(validos=('VOTOS', 'sum'), listas=('OP_CODIGO', 'nunique')).reset_index()
    par = par.merge(votos, on=COD, how='left')
    par['provK'] = par['provincia'].map(lambda x: norm(ALIAS_PROV.get(norm(x), norm(x))))
    par['cantK'] = par['canton'].map(lambda x: norm(ALIAS_CANT.get(norm(x), norm(x))))
    par['parrK'] = par['parroquia'].map(norm)

    claves = list(zip(par['provK'], par['cantK'], par['parrK']))
    dup = [k for k, n in Counter(claves).items() if n > 1]
    control['parroquiasDuplicadas'] = len(dup)
    if dup:
        raise SystemExit(f'Parroquias duplicadas: {dup[:5]}')
    if len(par) != PARROQUIAS_2023:
        raise SystemExit(f'La base trae {len(par)} parroquias de vocales 2023; el CNE eligió vocales en {PARROQUIAS_2023}.')
    faltan7 = [k for k in SIETE_2023 if k not in set(claves)]
    if faltan7:
        raise SystemExit(f'No están en la base: {faltan7}')
    par['vocales'] = [7 if k in SIETE_2023 else 5 for k in claves]
    if int(par['vocales'].sum()) != VOCALES_2023:
        raise SystemExit('La composición no suma 4.109 vocales.')

    emitidos = par['validos'] + par['nulos'] + par['blancos']
    distintas = par[par['sufragantes'] != emitidos]
    control.update({
        'parroquias': int(len(par)),
        'juntas': int(len(juntas)),
        'vocales': int(par['vocales'].sum()),
        'validos': int(par['validos'].sum()),
        'nulos': int(par['nulos'].sum()),
        'blancos': int(par['blancos'].sum()),
        'sufragantes': int(par['sufragantes'].sum()),
        'sufragantesDistintos': {
            'parroquias': int(len(distintas)),
            'diferencia': int((distintas['sufragantes'] - emitidos[distintas.index]).sum()),
            'nota': 'En la base oficial, en esas parroquias los sufragantes no coinciden con válidos + nulos + blancos. '
                    'Se conserva cada cifra como viene; el tablero, como en concejales, usa válidos + nulos + blancos.'
        }
    })

    par = par.sort_values(['provK', 'cantK', 'parrK']).reset_index(drop=True)
    campos = ['provK', 'cantK', 'parrK', 'provincia', 'canton', 'parroquia',
              'codProv', 'codCant', 'codParr', 'sufragantes', 'validos', 'nulos', 'blancos', 'listas', 'vocales']
    filas = [[r.provK, r.cantK, r.parrK, r.provincia, r.canton, r.parroquia,
              int(r.PROVINCIA_CODIGO), int(r.CANTON_CODIGO), int(r.PARROQUIA_CODIGO),
              int(r.sufragantes), int(r.validos), int(r.nulos), int(r.blancos), int(r.listas), int(r.vocales)]
             for r in par.itertuples()]
    salida = {
        'fuente': ruta.name.replace('__1_', '').replace('(1)', ''),
        'anio': 2023,
        'dignidad': 'VOCALES DE JUNTA PARROQUIAL',
        'composicion': {
            'regla': 'Cinco vocales principales por junta parroquial rural; siete en las parroquias de más de 50.000 habitantes.',
            'fuente': FUENTE_COMPOSICION,
            'total': VOCALES_2023,
            'siete': sorted('|'.join(k) for k in SIETE_2023)
        },
        'campos': campos,
        'parroquias': filas,
        'control': control
    }
    SALIDA.write_text(json.dumps(salida, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f"  {control['parroquias']} parroquias · {control['vocales']} vocales · válidos {control['validos']:,} · "
          f"nulos {control['nulos']:,} · blancos {control['blancos']:,} · sufragantes {control['sufragantes']:,}")
    print(f"  sufragantes ≠ válidos + nulos + blancos en {control['sufragantesDistintos']['parroquias']} parroquias "
          f"(diferencia total {control['sufragantesDistintos']['diferencia']:+,})")
    print(f'  → {SALIDA}  ({SALIDA.stat().st_size / 1024:.0f} KB)')


if __name__ == '__main__':
    main()
