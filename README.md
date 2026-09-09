# Análisis Electoral Territorial — Dashboard georreferenciado

Plataforma de análisis de preinscritos por territorio para Ecuador.
Selecciona una dignidad, navega de Ecuador → provincia → cantón, y el mapa,
los indicadores, los gráficos y la tabla se recalculan al instante.

La aplicación **ya viene funcionando** con tus dos bases de preinscritos y
con tus tres capas cartográficas oficiales (provincias, cantones y
parroquias). Puedes abrirla y usarla sin configurar nada.

---

## 1 · Puesta en marcha (2 minutos)

Los navegadores bloquean la lectura de archivos locales por seguridad (CORS),
así que **abrir `index.html` con doble clic no funciona**: el mapa aparecería
vacío. Hay que servir la carpeta desde un servidor local. Cualquiera de estas
tres opciones sirve.

### Opción A — El servidor incluido (recomendada)

Abre una terminal **dentro de la carpeta del proyecto** y ejecuta:

```bash
python servidor.py
```

Abre el navegador solo en <http://localhost:8000>. Si ese puerto está ocupado,
usa otro: `python servidor.py 8080`.

Es `http.server` con tres arreglos que se agradecen en el día a día:

- **No ensucia la consola.** El `python -m http.server` normal escupe una traza
  larga de `ConnectionResetError` cada vez que el navegador cancela una
  descarga a medias — al recargar la página mientras baja un GeoJSON, por
  ejemplo. Son inofensivas, pero asustan y tapan los errores de verdad. Aquí
  solo verás los 4xx y 5xx.
- **No deja nada en caché.** Al cambiar colores, textos o los GeoJSON, basta
  con recargar; no hace falta Ctrl+F5.
- **Sirve los `.geojson` con su tipo MIME correcto.**

> En algunos equipos el comando es `python3 servidor.py` o `py servidor.py`.

Si prefieres el de siempre, `python -m http.server 8000` también funciona:
ignora las trazas de `ConnectionResetError` que aparezcan.

### Opción B — Visual Studio Code + Live Server

1. Instala la extensión **Live Server** (autor: Ritwick Dey).
2. Abre la carpeta del proyecto en VS Code.
3. Clic derecho sobre `index.html` → **Open with Live Server**.

### Opción C — Node.js

```bash
npx serve .
```

### Publicación en GitHub Pages

El proyecto es 100 % estático, así que se publica sin cambios:

1. Sube la carpeta a un repositorio.
2. Settings → Pages → Source: `main` / carpeta raíz.
3. Espera un minuto y entra a la URL que te asigne GitHub.

---

## 1a · Acceso

Al abrir el tablero se pide usuario y contraseña. Vienen configurados dos:

| Usuario | Contraseña | Ve |
|---|---|---|
| `admin` | `124569Gfr` | Todo el país |
| `pedernales` | `156235Jty` | Solo el cantón Pedernales, en Manabí |

La sesión dura mientras la pestaña siga abierta; el botón de la esquina
superior derecha la cierra.

### ⚠️ Esto NO es seguridad

La comprobación ocurre en el navegador. **Cualquiera que abra las
herramientas de desarrollo (F12) puede leer las contraseñas en
`js/acceso.js` y saltarse la pantalla.** Sirve como control de acceso para
presentaciones y uso interno —que cada quien entre a lo suyo—, no para
proteger información confidencial.

Si los datos son sensibles, la contraseña tiene que pedirla el servidor:
autenticación básica del hosting, un `.htaccess`, o el control de acceso de la
plataforma donde lo publiques. Un tablero estático no puede hacerlo solo.

### El límite territorial sí es real

Lo que sí funciona de verdad es el recorte de datos. Al usuario limitado se le
podan las bases **en memoria, antes de construir el mapa**: la cartografía se
queda con un solo cantón, los preinscritos con sus 6 registros, el histórico
con los suyos y el padrón con sus 54.009 electores. Ni los mapas, ni las
tablas, ni los gráficos, ni las exportaciones llegan a tener los otros
territorios, porque nunca están cargados.

Una excepción deliberada: las candidaturas **provinciales** (prefecto) no
llevan cantón, así que se conservan las de Manabí. Son las que aparecen en la
papeleta de Pedernales; recortarlas dejaría esa vista vacía. Para un recorte
estricto al cantón, cambia la condición marcada en `js/acceso.js`.

La escala de color del mapa se calcula **antes** de podar, de modo que los
colores significan lo mismo para los dos usuarios.

### Cambiar usuarios y contraseñas

Todo está en el bloque `ACCESO.usuarios`, al inicio de `js/acceso.js`:

```js
{
  usuario: 'pedernales',
  clave: '156235Jty',
  nombre: 'Pedernales',
  alcance: { provincia: 'MANABI', canton: 'PEDERNALES' }
}
```

`alcance: null` da acceso completo. Los nombres van como en la cartografía,
en mayúsculas y sin tildes. Se puede limitar solo a provincia omitiendo
`canton`.

---

## 1b · Las dos secciones

La barra bajo el encabezado alterna entre dos secciones:

| Sección | Responde a | Años |
|---|---|---|
| 👥 **Preinscritos** | ¿Cómo está compuesto el padrón de preinscritos y de electores? | 2027 |
| 📊 **Histórico electoral** | ¿Cómo ha cambiado el voto y qué pasó en la última elección? | 2004 → 2023 |

**Preinscritos conserva todo lo que ya tenía** y suma al final un
**histograma de distribución por grupo etario** (2027), que muestra solo el
porcentaje de cada tramo. Responde a los mismos filtros de provincia y cantón
que el resto de esa página.

**Provincia, cantón y dignidad se comparten entre las dos secciones.** Al
cambiar de una a otra, la que se abre adopta la selección de la que se deja:
si eliges Guayas, Guayaquil y Alcalde en Preinscritos, Histórico se abre con
ese mismo territorio, y al revés. La parroquia solo la tiene Histórico, y se
conserva mientras no cambie el cantón.

La sincronización ocurre al cambiar de sección, no de forma continua, para que
ninguna repinte por algo que pasa en la otra mientras está oculta.

**Histórico electoral** reúne la evolución 2004–2023, los resultados de la
última elección y dos mapas de diagnóstico.

### Sin filtros de año

No hay ningún selector, desplegable ni control de año. Los cinco años se
comparan automáticamente dentro de cada gráfico y de la tabla. Los mapas y el
bloque de resultados usan siempre la última elección disponible, y lo indican
en su título.

### Índice de fragmentación

Sigue la fórmula del modelo de Power BI: **1 / Σ(pᵢ²)**, con pᵢ = votos de cada
organización sobre el total válido del ámbito. Equivale al número efectivo de
organizaciones.

Se presenta como barras comparadas año a año: **organizaciones presentadas** y
**organizaciones efectivas** (el índice), las dos sobre el mismo eje para que
la comparación sea directa. Con ejes separados cada barra se medía con una
regla distinta y un índice de 3 podía dibujarse más alto que 6 organizaciones.
Como el índice nunca supera al número de organizaciones —es su número
efectivo—, su barra queda siempre por debajo. Debajo, la tabla con año,
organizaciones, índice y concentración.

### El mapa electoral

La sección tiene **un solo mapa** y es su primer elemento; debajo va todo lo
demás.

El mapa usa **la misma plantilla que el de Preinscritos**: la rejilla
`fila-mapa` con la tarjeta del mapa a la izquierda y un panel lateral de
296 px a la derecha, el mismo alto mínimo y la misma barra superior. La
**escala de color va en ese panel lateral**, en el mismo sitio y con el mismo
formato que el panel de análisis territorial de Preinscritos, no debajo del
mapa.

En la barra superior están sus dos controles, y ambos afectan únicamente al
mapa:

- **Año** — 2004, 2009, 2014, 2019, 2023. Cambiarlo repinta el mapa y nada
  más: las tarjetas, los gráficos, la tabla de fragmentación y los resultados
  siguen comparando todos los años.
- **Indicador** — % votos válidos, % votos nulos, % votos blancos.

El color es un **degradado continuo**: se interpola sobre la escala de la
dignidad activa, de modo que un porcentaje bajo sale claro y uno alto sale
intenso.

#### La escala es general, no del filtro

El rango de cada indicador se calcula una sola vez sobre todo el conjunto de
datos —los cinco años y las dos dignidades— y **no se recalcula al filtrar**.
Un mismo color significa siempre el mismo porcentaje, así que los mapas de
distintas provincias o años se pueden comparar entre sí.

Cada indicador tiene su propio rango, y hay uno por nivel territorial:

| Indicador | Provincia | Cantón | Parroquia |
|---|---|---|---|
| % válidos | 70,2 – 95,5 | 58,8 – 98,6 | 35,7 – 100 |
| % nulos | 2,5 – 19,1 | 0,9 – 22,8 | 0 – 62,1 |
| % blancos | 0,5 – 17,7 | 0,2 – 33,7 | 0 – 46,1 |

Se guarda un rango por nivel porque los porcentajes se comportan de forma muy
distinta al agregar: los nulos van del 2 % al 19 % entre provincias pero del
0 % al 62 % entre parroquias. Con un rango único, todas las provincias
caerían en una franja estrecha y saldrían casi del mismo color.

Las unidades con menos de 50 votos emitidos quedan fuera del cálculo del
rango, aunque sí se pintan en el mapa: una parroquia de 2004 con 3 votos y los
3 nulos marcaba un máximo del 100 % y aplastaba la escala de las 12.000
restantes. El umbral está en `MINIMO_EMITIDOS_ESCALA`, en `js/secciones.js`.

La leyenda del panel lateral muestra ese mínimo y ese máximo.

**El nivel territorial se profundiza con el filtro de la izquierda:** sin
provincia se pintan las 24 provincias, con una provincia sus cantones, con un
cantón sus parroquias y, al elegir una parroquia concreta, **solo esa**: las
demás desaparecen del mapa y el encuadre se ajusta a su geometría.

El degradado se recalcula en cada nivel para aprovechar todo el rango de
color. La excepción es cuando se enfoca una sola parroquia: ahí la escala se
calcula sobre todas las parroquias del cantón, de modo que el color siga
diciendo si está alta o baja respecto a sus vecinas en vez de salir siempre al
máximo.

#### Parroquias urbanas

El CNE desglosa las parroquias urbanas una por una —Quito tiene 79 y ninguna
se llama «QUITO»— mientras que la cartografía del INEC las reúne en un único
polígono, el de código terminado en 50. Sin consolidarlas ahí se quedaría sin
pintar el 55 % de los votos del país, justo en las ciudades.

El mapa las pliega en ese polígono urbano y ningún voto se pierde: la suma de
las parroquias del mapa coincide exactamente con el total del cantón. La misma
equivalencia se aplica al filtro de parroquia, así que elegir la parroquia
urbana de Quito alimenta los gráficos con las 49 parroquias del CNE que le
corresponden en lugar de dejarlos vacíos.

### Nulos y blancos, desduplicados

En la base original vienen repetidos en cada fila de candidato: sumarlos en
crudo da 87 millones de nulos, casi diez veces la cifra real. Se aplica la
lógica del modelo de Power BI —máximo dentro de cada unidad electoral y suma
después— en `preparar_secciones.py`. Al navegador llegan ya limpios: 8.765.822
nulos y 6.669.974 blancos entre las dos dignidades.

Para regenerar las bases:

```bash
python preparar_secciones.py
```

---

## 2 · Estructura del proyecto

```
CARPETA_ELECTORAL/
├── index.html              Estructura de la página
├── servidor.py             Servidor local (ver §1)
├── css/
│   └── styles.css          Sistema visual completo
├── js/
│   ├── secciones.js        Histórico, Resultados y Análisis territorial
│   ├── data.js             ⭐ CONFIGURACIÓN + carga y cruce de datos
│   ├── map.js              Mapa Leaflet, coropletas, leyenda, exportar PNG
│   ├── charts.js           Los cuatro gráficos
│   └── app.js              Filtros, KPIs, tabla, exportaciones
├── data/
│   ├── provincias.geojson    24 provincias + zona no delimitada (356 KB)
│   ├── cantones.geojson      224 cantones                       (822 KB)
│   ├── parroquias.geojson    1.040 parroquias                   (1,7 MB)
│   ├── preinscritos.xlsx     Base de preinscritos               (119 KB)
│   ├── resultados2023.json   Resultados electorales 2023        (138 KB)
│   ├── electores.json        Padrón por provincia y cantón      (6 KB)
│   ├── historico.json        Histórico 2004–2023 por parroquia  (2,1 MB)
│   ├── postulantes.json      Postulantes por territorio y año   (529 KB)
│   └── etario2027.json       Padrón 2027 por grupo etario       (10 KB)
└── assets/
    └── logo.svg            Logo (reemplazable)
```

**Casi todo lo que necesitas cambiar está en `js/data.js`**, dentro del bloque
`CONFIG` al inicio del archivo. Cada punto editable está marcado con `✏️ EDITAR`.

---

## 3 · Dónde colocar los archivos

Todo va dentro de la carpeta `data/`. Copia ahí tus archivos desde
`C:\Users\Admin\Downloads\Carpeta\SHP\` y conserva estos nombres:

| Archivo | Obligatorio | Qué es |
|---|---|---|
| `data/provincias.geojson` | Sí | Capa provincial |
| `data/cantones.geojson` | Sí | Capa cantonal |
| `data/parroquias.geojson` | No | Capa parroquial (se carga en segundo plano) |
| `data/preinscritos.xlsx` | No* | Base de preinscritos |
| `data/resultados2023.json` | No | Resultados electorales de 2023 |

\* Si no hay Excel, la aplicación arranca en **modo demostración** con datos
ficticios y muestra una etiqueta amarilla en el encabezado. La etiqueta
desaparece sola cuando el archivo real está disponible.

Si prefieres otros nombres de archivo, cámbialos aquí:

```js
// js/data.js
archivos: {
  provincias: 'data/provincias.geojson',
  cantones:   'data/cantones.geojson',
  parroquias: 'data/parroquias.geojson',
  excel:      'data/preinscritos.xlsx'
},
```

Para cambiar de base, sustituye el archivo en `data/` y recarga.

---

## 4 · Cómo configurar los nombres de las columnas

La aplicación detecta las columnas sola. Para cada campo lógico prueba una
lista de nombres posibles y usa el primero que encuentre; la comparación
ignora tildes, mayúsculas y símbolos, así que `CANTÓN`, `canton` y
`Cantón_Nombre` se reconocen igual.

Si tu base usa un encabezado distinto, **agrégalo al inicio de la lista**
correspondiente:

```js
// js/data.js
columnasExcel: {
  dignidad:  ['DIGNIDAD', 'DIGNIDAD_NOMBRE', 'CARGO'],
  provincia: ['PROVINCIA', 'PROVINCIA_NOMBRE', 'NOMBRE_PROVINCIA'],
  canton:    ['CANTON', 'CANTÓN', 'CANTON_NOMBRE'],
  parroquia: ['PARROQUIA', 'PARROQUIA_NOMBRE'],
  partido:   ['PARTIDO', 'ORGANIZACION_POLITICA', 'MOVIMIENTO'],
  // ...
  preinscritos: ['PREINSCRITOS', 'TOTAL_PREINSCRITOS', 'CANTIDAD']
},
```

### Cómo se cuentan los preinscritos

- **Si tu base NO tiene columna de conteo** (una fila = una persona), el
  sistema cuenta las filas. Así funcionan tus archivos actuales.
- **Si tu base SÍ tiene columna `PREINSCRITOS`** con el total ya sumado, el
  sistema usa ese número en lugar de contar filas. No hay que cambiar nada:
  se detecta solo.

### Si falta una columna obligatoria

Aparece un panel de error que dice exactamente qué columna falta y qué
encabezados sí encontró en el archivo. No verás errores técnicos de
JavaScript.

---

## 5 · Cómo se cruzan el Excel y el GeoJSON

El cruce usa esta prioridad, de más fiable a menos:

1. **Código de cantón** (`dpa_canton`)
2. **Código de provincia** (`dpa_provin`)
3. **Nombre normalizado** con la función `normalizarTexto()`, que elimina
   tildes, mayúsculas, espacios sobrantes y caracteres especiales.
4. **Diccionario de alias** para las diferencias reales entre la nomenclatura
   del CNE y la cartográfica.

Tus capas traen los códigos DPA oficiales, así que la jerarquía interna
(parroquia → cantón → provincia) se arma **por código**, no por nombre: no hay
forma de que un cantón cuelgue de la provincia equivocada. Tus bases de
preinscritos no traen columnas de código, de modo que el Excel se enlaza por
nombre normalizado más alias; si algún día exportas la base con
`CANTON_CODIGO`, el sistema lo detecta y pasa a cruzar por código sin que
tengas que cambiar nada.

Los alias ya cubren los casos de tus bases:

```js
// js/data.js
aliasCanton: {
  'FCO DE ORELLANA':    'ORELLANA',
  'C J AROSEMENA TOLA': 'CARLOS JULIO AROSEMENA TOLA',
  'YAGUACHI':           'SAN JACINTO DE YAGUACHI',
  'BANOS':              'BANOS DE AGUA SANTA',
  // ... 16 equivalencias en total
},
```

Con tus archivos actuales **cruza el 99,6 % de los registros**. El único
territorio sin geometría es **Sevilla Don Bosco** (Morona Santiago), un cantón
creado después de la cartografía base. Sus 6 registros siguen contando en los
KPIs, la tabla y las exportaciones; simplemente no se pintan en el mapa. El
panel lateral avisa de esto con un recuadro naranja.

Para añadir una equivalencia nueva, escribe **a la izquierda el nombre del
Excel y a la derecha el del GeoJSON**, ambos en mayúsculas y sin tildes.

### Nombres que verás en pantalla

Cuando un registro cruza, el tablero usa el **nombre de la cartografía
oficial**, no el del Excel. Así el mapa, la tabla y los gráficos nombran el
territorio igual: verás *Santo Domingo de los Tsáchilas* y no
*STO DGO TSACHILAS*. Si un registro no cruza, se conserva el nombre del Excel
para que puedas identificarlo.

### Si usas otro GeoJSON

Las propiedades se detectan solas (`dpa_despro`, `PROVINCIA`, `province`,
etc.). Si no las reconoce, indícalas a mano:

```js
// js/data.js
camposGeo: {
  provincia: { codigo: 'DPA_PROVIN', nombre: 'DPA_DESPRO' },
  canton:    { codigo: 'DPA_CANTON', nombre: 'DPA_DESCAN' },
  parroquia: { codigo: 'DPA_PARROQ', nombre: 'DPA_DESPAR' }
},
```

**Sobre el sistema de coordenadas:** las capas incluidas ya están en WGS84
(latitud/longitud), que es lo que Leaflet necesita. Tu `parroquias.geojson`
original venía en UTM zona 17S (EPSG:32717) y fue reproyectado. Si sustituyes
una capa por otra en UTM, el mapa aparecerá vacío: hay que reproyectarla antes,
por ejemplo con `mapshaper entrada.geojson -proj wgs84 from=EPSG:32717
-o salida.geojson` o con QGIS.

---

## 6 · La capa parroquial

Ya está incluida y activa: 1.040 parroquias agrupadas bajo sus 224 cantones.
Aparece con líneas finas punteadas al seleccionar un cantón concreto en
análisis de Alcaldes, y el cuarto nivel de la ruta geográfica muestra cuántas
parroquias tiene ese cantón (por ejemplo, *34 parroquias* en Quito).

**Se carga en segundo plano.** Pesa más que las otras dos capas juntas y solo
hace falta al entrar en un cantón, así que el tablero se pinta primero con
provincias y cantones y la capa parroquial se incorpora sola un instante
después. No hay que hacer nada: cuando llega, la casilla *División parroquial*
del control de capas se habilita y el cuarto nivel de la ruta se activa.

Si prefieres quitarla para acelerar aún más la carga, borra el archivo
`data/parroquias.geojson`. La aplicación seguirá funcionando con tres niveles.

Para sustituirla por otra versión, basta con reemplazar el archivo. Cada
polígono necesita en sus propiedades el código o el nombre de su cantón
(`dpa_canton` / `dpa_descan`) para poder ubicarse.

### Un apunte sobre las parroquias de Guayaquil y Quito

La cartografía del INEC agrupa las parroquias urbanas de las ciudades grandes
en un solo polígono. Por eso Guayaquil aparece con 6 parroquias y no con las
16 urbanas que tiene administrativamente. Es una característica de la fuente,
no un error del procesamiento.

---

## 6b · Mapa base y alcance visible

### El fondo del mapa

Por defecto el mapa **no usa teselas**: dibuja la coropleta sobre un lienzo
limpio. Es como se imprimen los mapas electorales, hace que la escala de color
se lea mejor y no depende de ningún servicio externo, así que funciona sin
internet y sin marcas de agua.

CARTO, que se usaba antes, pasó a exigir una clave: sin ella estampa
«API KEY REQUIRED» sobre cada tesela.

Para poner un mapa base, cambia una línea:

```js
// js/data.js
mapaBase: {
  fondo: 'ninguno',   // 'ninguno' | 'osm' | 'esriGris' | 'carto'
  color: '#EAEFF4',   // color del lienzo cuando fondo = 'ninguno'
  ...
}
```

- `osm` — OpenStreetMap. Libre y sin clave, pero con mucho color y detalle:
  compite visualmente con la coropleta.
- `esriGris` — canvas gris claro de Esri. Sobrio, va bien con los colores.
- `carto` — el original. Necesita clave propia: regístrate en carto.com y
  sustituye `TU_CLAVE` en la URL.

### Qué se ve al filtrar

Al elegir una provincia el mapa muestra **solo esa provincia**: el resto del
país desaparece, incluidas las líneas divisorias de las demás. Y al elegir un
cantón en análisis de Alcaldes, solo ese cantón con sus parroquias.

Si en algún momento quieres ver el entorno, activa **Territorio circundante**
en el control de capas (el icono de capas, arriba a la derecha del mapa). Para
que sea el comportamiento por defecto, cambia `contexto: false` a `true` en
`js/map.js → MAPA.opciones`.

---

## 6c · Resultados electorales 2023

Bajo el mapa aparece el bloque **Resultados electorales 2023**, con el
candidato ganador y la tabla completa de candidaturas ordenada de mayor a
menor votación. Se actualiza con los mismos filtros que el resto del tablero:
dignidad, provincia y cantón.

### De dónde salen

Del archivo `SECCIONALES_ALCALDE.csv` que entregaste (en realidad separado por
tabuladores, no por comas). Son 53 MB con cinco años: 2004, 2009, 2014, 2019 y
2023. **El filtrado a 2023 se hace al preparar los datos**, no en el
navegador: `data/resultados2023.json` contiene únicamente ese año, así que
ningún otro puede aparecer por error.

Del original solo se conserva lo que el tablero necesita —votos de cada
candidatura agregados por cantón—, y de 53 MB se pasa a 138 KB.

Para regenerarlo tras actualizar la base:

```bash
python preparar_resultados.py
```

El script vive fuera de la carpeta del proyecto; ajusta la ruta `ORIGEN` si tu
archivo está en otro sitio. Las variables que usa son las que indicaste:
`DIGNIDAD_NOMBRE`, `OP_NOMBRE`, `CANDIDATO_NOMBRE` y `CANDIDATO_VOTOS`.

La homologación `PREFECTO Y VICEPREFECTO → Prefecto` y
`ALCALDE MUNICIPAL → Alcalde` se aplica solo a la salida; el archivo original
no se toca.

### Ganador frente a más votado

Cuando el filtro corresponde a **una sola elección** —un cantón para alcalde,
una provincia para prefecto— el primer puesto es el ganador y así se rotula.

Cuando el ámbito abarca varias elecciones —Guayas entera con dignidad Alcalde
son 25 carreras municipales distintas— sumar los votos da el candidato **más
votado del conjunto**, que no es lo mismo que un ganador. En ese caso el
bloque cambia el rótulo y el subtítulo indica cuántas elecciones se están
sumando. Es la diferencia entre un dato correcto y uno que induce a error en
una presentación.

### Cobertura

Los 221 cantones del país tuvieron elección en 2023 y todos cruzan con la
cartografía. Sin resultados quedan solo las tres zonas no delimitadas y
Sevilla Don Bosco, creado después; en esos casos el bloque muestra un mensaje
claro en lugar de quedarse en blanco.

### Nota sobre el nivel parroquial

El original llega hasta parroquia, pero el tablero no tiene filtro parroquial
—la parroquia es una capa del mapa, no un selector—, así que los datos se
agregan hasta cantón. Si más adelante añades un selector de parroquia, cambia
`groupby([...])` en `preparar_resultados.py` para incluir `PARROQUIA_NOMBRE`.

---

## 7 · Cómo cambiar los colores

Hay dos escalas, una por dignidad. El acento de toda la interfaz cambia con
ella, de modo que el color indica en qué nivel de análisis estás: **ámbar =
provincial (Prefectos)**, **turquesa = cantonal (Alcaldes)**.

```js
// js/data.js
paleta: {
  PREFECTOS: {
    acento: '#F5B44A',
    rampa: ['#FFF1D2', '#FAD489', '#F0A93F', '#DA7420', '#A2450C']
  },
  ALCALDES: {
    acento: '#4ED8CB',
    rampa: ['#DDF3EF', '#A2E0D7', '#5CC4BA', '#2C9A97', '#16626C']
  },
  sinDatos:  '#E4E9F0',   // territorios sin registros
  contexto:  '#F2F5F8',   // territorio fuera del filtro
  seleccion: '#0A111E'    // borde del territorio seleccionado
},
```

La rampa va **de menor a mayor**: primer color = menos preinscritos.
Los colores de fondo de la interfaz están en `css/styles.css`, en el bloque
`:root` del inicio.

### Sobre los rangos de la leyenda

Los cortes se calculan solos según los datos que haya. Con conteos pequeños
(2–15 preinscritos) usa intervalos iguales, que se leen mejor; con bases
grandes ya agregadas usa cuantiles redondeados. Si mañana cargas una base con
valores de 0 a 3.000, la leyenda se reajusta sin que toques nada.

La escala se calcula sobre los territorios que se están comparando entre sí:
todas las provincias en análisis provincial, y los cantones de la provincia
enfocada en análisis cantonal. La leyenda lo indica ("por cantón · Guayas")
para que no se comparen mapas con escalas distintas por descuido.

---

## 8 · Cómo cambiar el logo y el nombre de la empresa

```js
// js/data.js
marca: {
  empresa:   'INTELIGENCIA TERRITORIAL',
  titulo:    'ANÁLISIS ELECTORAL TERRITORIAL',
  subtitulo: 'Plataforma de inteligencia geográfica y análisis de preinscritos',
  logo:      'assets/logo.svg',
  ciclo:     'Elecciones Seccionales 2027'
},
```

Para el logo: deja tu archivo en `assets/` y apunta la ruta ahí
(`assets/logo.png` también funciona). Se muestra a 34 px de alto; si el
archivo no existe, el espacio se oculta y no se rompe nada.

Estos textos aparecen en el encabezado y también en la cartela del mapa que
se descarga como PNG.

---

## 9 · Qué hace cada parte

**Panel lateral.** Dignidad, provincia, cantón y limpiar filtros. El selector
de cantón está deshabilitado hasta que elijas una provincia.

**Mapa.** Zoom, escala, pantalla completa, control de capas, volver a Ecuador,
volver a la provincia y leyenda dinámica.

Los dos mapas del tablero **no hacen zoom con gestos**: ni con la rueda del
ratón, ni con doble clic, ni arrastrando con Shift. Así, pasar el cursor por
encima para leer un territorio no descuadra el mapa ni secuestra el
desplazamiento de la página. El zoom sigue disponible en los botones + / − y
en el encuadre automático al cambiar de filtro, y el mapa se puede arrastrar
a propósito. Para volver al comportamiento anterior, quita
`scrollWheelZoom: false` de `js/map.js` y `js/secciones.js`. Al pasar el cursor sobre un
territorio aparecen sus preinscritos, participación y ranking. Al hacer clic
se enfoca; al volver a hacer clic sobre el mismo, se deselecciona.

- En **Prefectos** el mapa colorea provincias y dibuja encima las divisiones
  cantonales, para no perder el detalle del territorio.
- En **Alcaldes** colorea cantones y marca los límites provinciales.

**Ruta geográfica.** La barra superior del mapa (Ecuador › Provincia › Cantón
› Parroquia) muestra en qué nivel estás y sirve para subir de nivel con un
clic. El cuarto tramo indica cuántas parroquias tiene el cantón enfocado.

**Electores.** El panel de análisis y el tooltip del mapa muestran el padrón
electoral del territorio y los *preinscritos por cada 100.000 electores*. Esa
métrica permite comparar territorios de tamaño muy distinto: 8 preinscritos
sobre los 2.019.614 electores de Guayaquil no significan lo mismo que 8 en un
cantón de 5.000.

El dato sale de `data/electores.json`, generado desde el distributivo de
recintos electorales:

```bash
python preparar_electores.py
```

Suma la columna `NUMERO ELECTORES` por provincia y por cantón: 13.330.679
electores en 4.399 recintos. Antes este indicador mostraba la población del
censo de 2010 que venía en la capa parroquial, que estaba un 14,5 % por debajo
del censo de 2022 y desigualmente repartida. El campo de población sigue
guardado en el índice territorial por si alguna vez hace falta; simplemente ya
no se muestra.

**Tabla.** Dos vistas: *Territorios* (agregado con porcentaje y ranking) y
*Preinscritos* (una fila por persona, con lista y organización política).
Ambas con búsqueda, orden por columna y paginación.

**Exportaciones y carga manual de Excel.** Los botones *Excel*, *CSV* y
*Descargar mapa*, y la zona para arrastrar otro Excel, se retiraron del panel
lateral a petición. El código sigue ahí y funciona: para reponerlos hay que
devolver los botones a `index.html` y sus `addEventListener` en
`cablearInterfaz()` (`js/app.js`). Los comentarios del propio archivo lo
indican en el sitio exacto.

---

## 10 · Problemas frecuentes

**El mapa sale vacío y aparece un panel de error.**
Estás abriendo el archivo con doble clic. Usa un servidor local (§1).

**Dice "MODO DEMOSTRACIÓN" y los datos no son los míos.**
No encontró `data/preinscritos.xlsx`. Revisa el nombre exacto y que esté
dentro de `data/`.

**Un territorio sale gris aunque tiene preinscritos.**
El nombre no coincide entre el Excel y el GeoJSON. Añade la equivalencia en
`aliasCanton` (§5). Para saber cuál es, abre la consola del navegador (F12):
al arrancar se registra la lista de registros sin geometría.

**Sustituí una capa y el mapa quedó vacío.**
Lo más probable es que esté en UTM y no en WGS84. Reproyéctala (§5).

**La división parroquial tarda un momento en habilitarse.**
Es lo esperado: se carga en segundo plano para que el tablero aparezca antes
(§6).

**Cambié los archivos pero el problema sigue igual.**
El navegador está ejecutando la copia vieja que tiene en caché. Comprueba el
número de versión al pie del panel lateral izquierdo: si no coincide con el de
la entrega, es eso. Soluciones, de más simple a más segura:

1. Recarga forzada: **Ctrl + Shift + R** (o Ctrl + F5).
2. Usa `python servidor.py` en vez de `python -m http.server`: envía
   `Cache-Control: no-store` y el problema no vuelve a ocurrir.
3. F12 → pestaña **Red** → marca **Inhabilitar caché** → recarga.

Ocurre porque el ZIP conserva la fecha original de cada archivo, así que al
descomprimirlo encima el servidor responde «no ha cambiado» (304) y el
navegador reutiliza el JavaScript antiguo. Las rutas de los scripts llevan
`?v=` justamente para evitarlo, pero `index.html` también puede quedar
cacheado.

**Aparece el panel «No se pudo completar la carga».**
Despliega **Ver detalle técnico** dentro del panel: ahí está el mensaje y la
traza exactos. La misma información queda en la consola del navegador (F12 →
Consola), donde se puede copiar entera.

**La consola del servidor se llena de `ConnectionResetError` / `WinError 10054`.**
Es el navegador cancelando una descarga a medias, no un fallo. Usa
`python servidor.py` en vez de `python -m http.server` y desaparecen (§1).

**Dice que el puerto ya está en uso.**
Tienes otro servidor levantado. Usa otro puerto: `python servidor.py 8080`.

**Los acentos se ven mal en el CSV.**
Ábrelo con *Datos → Desde texto/CSV* en Excel y elige codificación UTF-8.

**El logo no aparece.**
Revisa la ruta en `CONFIG.marca.logo`. Si el archivo no existe, el hueco se
oculta a propósito.

---

## 11 · Tecnologías

HTML5, CSS3 y JavaScript sin framework ni proceso de compilación.
[Leaflet 1.9](https://leafletjs.com) para el mapa,
[Chart.js 4](https://www.chartjs.org) para los gráficos y
[SheetJS](https://sheetjs.com) para leer y escribir Excel.
Mapa base CartoDB Positron. Las tres librerías se cargan desde CDN, así que la
primera carga necesita conexión a internet.

Probado con cinco suites automatizadas. Una de ellas monta el tablero con
**Leaflet y Chart.js reales** y comprueba que el mapa dibuja de verdad sus
polígonos, que las coordenadas caen en rango (una capa mal proyectada se
detecta ahí) y que los controles se construyen. Otra revisa la hoja de estilos
de forma estática: comprueba que ninguna regla anule el atributo `hidden`, un
fallo que las pruebas de JavaScript no pueden ver porque consultan la
propiedad del DOM y no lo que se pinta. Las demás cubren 70 comprobaciones
sobre la capa de datos
(normalización, detección de columnas, jerarquía por código DPA, carga
diferida de parroquias, cruce territorial, agregación y clasificación de
color) y 70 sobre la interfaz (filtros, KPIs, panel territorial, tabla,
ordenamiento, paginación, exportaciones, nivel parroquial y sincronización con
el mapa).

Las capas de `data/` se derivaron de las tres que entregaste: se reproyectó la
parroquial de UTM 17S a WGS84, se corrigió un problema de codificación en
*Logroño*, se simplificaron las geometrías a 200 m conservando la topología, y
las capas cantonal y provincial se generaron **disolviendo** la parroquial, de
modo que los límites de los tres niveles encajan exactamente entre sí. El
tamaño total pasó de 312 MB a 2,9 MB sin pérdida visible al zoom de trabajo.
