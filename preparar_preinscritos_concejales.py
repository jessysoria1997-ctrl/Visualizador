#!/usr/bin/env python3
"""
Añade los concejales preinscritos a data/preinscritos.xlsx, para la dignidad
«Concejales» de Preinscritos.

Fuente
  · Reporte_de_Candidatos_Preinscritos_Concejales.xls   una candidatura por
    fila: concejales urbanos, rurales y urbanos por circunscripción

Qué hace
  · Deja intactas las filas que ya tiene la base (prefectos y alcaldes): los
    concejales se agregan al final, con las mismas columnas.
  · Cada columna del reporte va a su columna de la base:
        DIGNIDAD                 → DIGNIDAD   (tal cual: el tablero reconoce
                                               «CONCEJAL» en el texto)
        PROVINCIA, CANTÓN        → PROVINCIA, CANTON
        LISTA                    → LISTA
        ORGANIZACIÓN POLÍTICA    → PARTIDO
        CÉDULA, NOMBRE           → CEDULA, NOMBRE
        ORDEN_CANDIDATO          → ORDEN
        CEDULA_SUPLENTE          → CEDULA_SUPLENTE
        NOM_CANDIDATO_SUPLENTE   → NOMBRE_SUPLENTE
        CIRCUNS. CANTONAL        → CIRCUNSCRIPCION  (columna nueva; vacía en
                                                     las demás filas)
    Solo se quitan espacios sobrantes; ningún valor se cambia ni se inventa.
  · Se puede volver a ejecutar: primero retira los concejales que haya
    agregado antes, así que nunca quedan duplicados.

Uso
    python preparar_preinscritos_concejales.py RUTA/Reporte_de_Candidatos_Preinscritos_Concejales.xls

Requiere pandas, openpyxl y xlrd (pip install xlrd) para leer el .xls.
"""
import re
import sys
import unicodedata
from pathlib import Path

import openpyxl
import pandas as pd

BASE = Path(__file__).parent
BASE_XLSX = BASE / 'data' / 'preinscritos.xlsx'

# Columna de la base ← columna del reporte.
COLUMNAS = {
    'DIGNIDAD': 'DIGNIDAD',
    'PROVINCIA': 'PROVINCIA',
    'CANTON': 'CANTÓN',
    'PARROQUIA': None,
    'LISTA': 'LISTA',
    'PARTIDO': 'ORGANIZACIÓN POLÍTICA',
    'CEDULA': 'CÉDULA',
    'NOMBRE': 'NOMBRE',
    'ORDEN': 'ORDEN_CANDIDATO',
    'CEDULA_SUPLENTE': 'CEDULA_SUPLENTE',
    'NOMBRE_SUPLENTE': 'NOM_CANDIDATO_SUPLENTE',
    'CIRCUNSCRIPCION': 'CIRCUNS. CANTONAL',
}


def norm(s):
    s = str(s or '').upper().replace('Ñ', '\x01')
    s = ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')
    s = s.replace('\x01', 'N')
    return re.sub(r'[^A-Z0-9]+', ' ', s).strip()


def texto(x):
    if x is None or (isinstance(x, float) and pd.isna(x)):
        return None
    t = re.sub(r'\s+', ' ', str(x)).strip()
    return t or None


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    rep = pd.read_excel(sys.argv[1], dtype=str)
    faltan = [c for c in COLUMNAS.values() if c and c not in rep.columns]
    if faltan:
        sys.exit(f'Al reporte le faltan columnas: {faltan}')
    no_conc = rep[~rep['DIGNIDAD'].map(norm).str.contains('CONCEJAL')]
    if len(no_conc):
        sys.exit(f'{len(no_conc)} filas del reporte no son de concejales: {no_conc["DIGNIDAD"].unique()}')

    wb = openpyxl.load_workbook(BASE_XLSX)
    ws = wb.active
    cab = [c.value for c in ws[1]]
    if 'CIRCUNSCRIPCION' not in cab:
        ws.cell(row=1, column=len(cab) + 1, value='CIRCUNSCRIPCION')
        cab.append('CIRCUNSCRIPCION')
    faltan = [c for c in COLUMNAS if c not in cab]
    if faltan:
        sys.exit(f'A la base le faltan columnas: {faltan}')

    # Concejales agregados en una ejecución anterior: siempre al final.
    idig = cab.index('DIGNIDAD')
    previas = [i for i, fila in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2)
               if 'CONCEJAL' in norm(fila[idig])]
    if previas:
        if previas != list(range(previas[0], ws.max_row + 1)):
            sys.exit('La base tiene concejales intercalados con otras filas: revísala a mano.')
        ws.delete_rows(previas[0], len(previas))
    originales = ws.max_row - 1

    for _, r in rep.iterrows():
        ws.append([texto(r[COLUMNAS[c]]) if COLUMNAS.get(c) else None for c in cab])
    wb.save(BASE_XLSX)

    # ── Comprobación: las filas que ya estaban siguen iguales ───────────────
    nueva = pd.read_excel(BASE_XLSX, dtype=str)
    print(f'✓ {BASE_XLSX}')
    print(f'  {originales} filas que ya estaban (sin cambios) + {len(rep)} concejales = {len(nueva)}')
    print('  ' + ', '.join(f'{k}: {v}' for k, v in nueva['DIGNIDAD'].value_counts().items()))
    if previas:
        print(f'  (se reemplazaron {len(previas)} concejales de una ejecución anterior)')


if __name__ == '__main__':
    main()
