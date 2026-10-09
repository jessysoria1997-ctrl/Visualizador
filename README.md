# Análisis Electoral Territorial — Dashboard georreferenciado

Plataforma de análisis de preinscritos por territorio para Ecuador.
Selecciona una dignidad, navega de Ecuador → provincia → cantón → parroquia, y
el mapa, los indicadores, los gráficos y la tabla se recalculan al instante.
Cada dignidad llega hasta el nivel en que se elige: provincial en prefectos,
cantonal en alcaldes y concejales, parroquial en vocales.

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

**No hay contraseñas. Las cuatro carpetas abren directo**: se descomprimen, se
arranca el servidor y el tablero aparece. Ninguna trae pantalla de entrada ni
botón de salir.

En la esquina superior derecha sigue el rótulo del territorio de cada carpeta
—*Administración · Acceso completo*, *La Maná*, *Pedernales*, *Pichincha*—,
que ahora solo informa de qué contiene la copia que estás abriendo.

### Por qué quitarlas no te deja más expuesto

La contraseña se comprobaba **en el navegador**: cualquiera que abriera las
herramientas de desarrollo (F12) podía leerla en `js/acceso.js` y saltarse la
pantalla. Nunca fue seguridad real, así que quitarla no cambia a quién puede
ver los datos de una carpeta que tenga en sus manos.

Si necesitas limitar quién entra —porque la publicas en internet, por
ejemplo—, la contraseña tiene que pedirla el servidor: autenticación básica
del hosting, un `.htaccess`, o el control de acceso de la plataforma donde lo
publiques. Un tablero estático no puede hacerlo solo.

### Para dar a alguien solo su territorio

**Compílale su carpeta.** Ahí el límite sí es real: los datos de los demás
territorios no se incluyen en los archivos, así que no hay nada que destapar
ni con F12 ni descargando los `.json`. Es lo que ya hacen
`CARPETA_ELECTORAL_PEDERNALES`, `CARPETA_ELECTORAL_LA_MANA` y
`CARPETA_ELECTORAL_PICHINCHA`.

### Si quieres devolver la pantalla de acceso

El código sigue entero en `js/acceso.js` (`iniciarAcceso`, `buscarUsuario`).
Hacen falta dos cosas: añadir una `clave: '…'` a los usuarios de
`ACCESO.usuarios`, y devolver a `index.html` el bloque `#capa-acceso` con su
formulario y el botón `#btn-salir` del encabezado. En cuanto el formulario
existe, `iniciarAcceso()` vuelve a pedir usuario y contraseña.

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

### El bloque de usuarios

Sigue en `js/acceso.js`, pero sin contraseñas. **Sin pantalla de entrada se
usa siempre el primero de la lista**; los demás se quedan como referencia de
los territorios que se compilan aparte:

```js
{
  usuario: 'pedernales',
  nombre: 'Pedernales',
  alcance: { provincia: 'MANABI', canton: 'PEDERNALES' }
}
```

`alcance: null` da acceso completo. Los nombres van como en la cartografía,
en mayúsculas y sin tildes. Se puede limitar solo a provincia omitiendo
`canton`. El `nombre` es el rótulo del encabezado.

### Carpetas recortadas por territorio

`CARPETA_ELECTORAL_PEDERNALES`, `CARPETA_ELECTORAL_LA_MANA` y
`CARPETA_ELECTORAL_PICHINCHA` son copias del tablero que **solo contienen los
datos de su territorio**. Aunque alguien abra F12 o descargue los archivos, no
encuentra otros territorios porque no están publicados. Se generan desde esta
carpeta:

```bash
python compilar_usuario.py                      # Pedernales (cantón)
python compilar_usuario.py COTOPAXI "LA MANA"   # La Maná (cantón)
python compilar_usuario.py PICHINCHA            # Pichincha (provincia entera)
```

Con un solo argumento se compila la **provincia entera**, con sus cantones y
sus parroquias; con dos, un cantón.

El territorio y el rótulo de cada una se definen en `USUARIOS`, al inicio de
`compilar_usuario.py`. Para añadir otro territorio, agrega su entrada ahí:

```python
('GUAYAS', 'DAULE'): {'usuario': 'daule', 'nombre': 'Daule'},
```

**Todas abren directo, sin contraseña.** La compilación quita de su
`index.html` el formulario de entrada y el botón de salir, y deja en su
`acceso.js` un único usuario sin clave. El encabezado sigue rotulando el
territorio, y el paso 9 comprueba que no quede ninguna contraseña.

#### Qué comprueba la compilación

El último paso recorre los archivos publicados y falla si encuentra el nombre
de un territorio ajeno. Dos matices, porque si no daría falsas alarmas:

- **No mira el nombre ni la dirección de los recintos**, que citan calles y
  colegios llamados como otros territorios (*Eugenio Espejo*, *Bahía de
  Caráquez*) sin serlo.
- **Conserva los territorios que la base electoral registra bajo esta
  provincia en los años en que le pertenecían**, y los enumera al terminar.
  En Pichincha son el cantón Santo Domingo y sus parroquias —fue de Pichincha
  hasta 2007 y votó así en 2004— y las parroquias urbanas de Quito anteriores
  a 2014. Sus votos cuentan en los totales de la provincia igual que en la
  carpeta completa; quitarlos cambiaría las cifras de esos años.

---

## 1b · Las tres secciones

La barra bajo el encabezado alterna entre tres secciones:

| Sección | Responde a | Años |
|---|---|---|
| 👥 **Preinscritos** | ¿Cómo está compuesto el padrón de preinscritos y de electores? | 2027 |
| 📊 **Histórico electoral** | ¿Cómo ha cambiado el voto y qué pasó en la última elección? | 2004 → 2023 |
| 🪑 **Asignación** | Con esta participación, ¿cuántos concejales le toca a cada lista? | 2004 → 2023 |

**Preinscritos conserva todo lo que ya tenía** y suma al final un
**histograma de distribución por grupo etario** (2027), que muestra solo el
porcentaje de cada tramo. Responde a los mismos filtros de provincia y cantón
que el resto de esa página.

**Provincia, cantón y dignidad se comparten entre las dos secciones.** Al
cambiar de una a otra, la que se abre adopta la selección de la que se deja:
si eliges Guayas, Guayaquil y Alcalde en Preinscritos, Histórico se abre con
ese mismo territorio, y al revés. La parroquia solo la tiene Histórico, y se
conserva mientras no cambie el cantón.

Con la dignidad pasa lo mismo: *Concejales · Urbanos* de Preinscritos abre
*Concejales urbanos* en el histórico, *Rurales* abre *Concejales rurales*, y al
revés. Con *Vocales*, que Preinscritos no tiene, cada sección conserva la suya.

La sincronización ocurre al cambiar de sección, no de forma continua, para que
ninguna repinte por algo que pasa en la otra mientras está oculta.

**Histórico electoral** reúne la evolución 2004–2023, los resultados de la
última elección y dos mapas de diagnóstico.

### Electores: juntas y recintos (en Preinscritos)

Justo debajo del mapa, el bloque **Electores · *territorio*** amplía los
electores del territorio seleccionado: el país entero, una provincia o un
cantón. Las tarjetas de *Electores* y *Por 100 mil electores* del panel
lateral siguen exactamente igual. El bloque trae:

- **Juntas receptoras del voto**: total, femeninas y masculinas.
- **Recintos electorales**, en una pestaña plegable que empieza cerrada. Al
  hacer clic en ella se despliega la lista y aparecen los recintos como puntos
  pequeños sobre el mapa de Preinscritos; al volver a hacer clic se pliega y
  los puntos desaparecen. La lista depende del territorio:
  - **Cantón**: cada recinto con sus juntas, agrupados por parroquia. En los
    cantones con muchos recintos (Quito, Guayaquil…) la lista se desplaza
    dentro de su recuadro.
  - **Provincia**: recintos y juntas de cada cantón.
  - **País**: recintos y juntas de cada provincia.

  Los puntos del país o de una provincia son más pequeños, porque se juntan
  muchos, y recuperan su tamaño al acercarse. Al pasar el ratón por uno se ve
  su nombre, parroquia, dirección, juntas y electores.

Los usuarios limitados a un territorio solo ven sus recintos, y las carpetas
recortadas solo los publican.

Todo sale de `data/distributivo.json`, que genera `preparar_distributivo.py` a
partir del distributivo de recintos (4.399 recintos, 40.787 juntas):

```bash
python preparar_distributivo.py RUTA\distributivo_2027.xlsx
```

El script comprueba que cada recinto tenga juntas femeninas + masculinas =
total, que no haya recintos repetidos y que los electores por cantón sean
exactamente los de `data/electores.json` (los del panel de análisis). Ubica cada
recinto en su parroquia por el código del CNE y, si no, por el nombre. Al
terminar informa de lo que conviene revisar en la base: tres parroquias que no
están en la capa parroquial (Urbimanta, Shuar Pastaza y Sevilla Don Bosco, que
no tiene polígono de cantón) y tres recintos cuyas coordenadas caen a más de
1 km de su cantón —uno de Babahoyo a 117 km—; se dibujan donde dice la base.

### Concejales y vocales (en Preinscritos)

Debajo de **Prefectos** y **Alcaldes**, Preinscritos tiene **Concejales** y
**Vocales**, con el mismo mapa, indicadores, panel, gráficos, tabla y grupo
etario.

**Concejales.** Al elegirlo se despliegan dos botones, **Urbanos** y
**Rurales**, y se ve uno u otro: Urbanos reúne los concejales urbanos y los
urbanos por circunscripción (5.290 candidaturas); Rurales, los rurales (2.386).
Al volver a Concejales se retoma el último elegido. En la tabla de detalle, la
columna *Dignidad* dice a cuál pertenece cada fila y, en las de
circunscripción, cuál (por ejemplo *Concejales urbanos por circunscripción
(urbana 1)*). El análisis es cantonal, como el de alcaldes.

**Vocales** de juntas parroquiales rurales (18.344 candidaturas, 824
parroquias). Se eligen por parroquia, así que **el análisis llega hasta ese
nivel**: bajo los selectores de provincia y cantón aparece uno de **Parroquia**
—solo con esta dignidad— y el mapa pinta parroquias en vez de cantones. La
ruta de niveles, el panel de análisis territorial, la tabla, los gráficos y la
exportación siguen el mismo nivel. El padrón de la parroquia sale del
distributivo de recintos (`electores.json` solo llega al cantón).

El nivel de cada dignidad se declara en `CONFIG.dignidades` (`js/data.js`) con
`nivel: 'provincia' | 'canton' | 'parroquia'`; para agrupar dignidades en un
botón con subbotones basta con darles el mismo `grupo` y describirlo en
`CONFIG.gruposDignidad`.

El bloque *Resultados electorales 2023* no aparece con Concejales ni con
Vocales: la base de resultados solo trae prefectos y alcaldes. Sus resultados
históricos están en Histórico electoral.

Concejales y vocales se agregan al final de `data/preinscritos.xlsx`, con las
mismas columnas y dos más, `CIRCUNSCRIPCION` y `PARROQUIA`; las filas de
prefectos y alcaldes no se tocan. Para actualizarlos con un reporte nuevo:

```bash
python preparar_preinscritos_listas.py RUTA\Reporte_compacto_Pre_inscritos_Estadistica.xls
```

Se puede ejecutar las veces que haga falta: primero retira los concejales y
vocales que agregó antes. Al terminar informa de las parroquias del reporte que
no tienen polígono en la capa: sus candidaturas cuentan en el cantón y en la
provincia, pero no se pintan en el mapa parroquial (hoy solo *Shuar Pastaza*,
en Pastaza).

### Concejales y vocales (en Histórico electoral)

Debajo de **Prefectos** y **Alcaldes**, el selector de dignidad del histórico
suma **Concejales urbanos**, **Concejales rurales** y **Vocales de juntas
parroquiales**, con el mismo mapa, indicadores, gráficos y tablas, y separados
igual que los publica el CNE. Cubren **todo el país**, 2004–2023.

Los datos salen de `Base_Consolidada_Concejales_Vocales_2004_2023.sav`:

```bash
python preparar_historico_dignidades.py RUTA\Base_Consolidada_Concejales_Vocales_2004_2023.sav
```

Genera `data/historico_dignidades.json` (2,4 MB) con la misma lógica que
`historico.json`: votos por organización y parroquia, nulos y blancos
desduplicados (un valor por unidad electoral) y postulantes. Al generarlo:

- **Voto en plancha de 2009.** Ese año la base guarda aparte el voto en
  plancha de concejales (`OP_VOTOS_EN_PLANCHA`). Cada voto en plancha es un
  voto para cada candidato de la lista, así que se suma a cada candidato, como
  ya viene sumado en los demás años. Sin él, los concejales de 2009 tendrían
  menos de la cuarta parte de sus votos (6,6 millones de votos válidos urbanos
  en vez de 35,6). Vocales y los demás años no cambian.
- **Parroquias repartidas entre dos circunscripciones** (Tarqui en Guayaquil,
  Milagro, Eloy Alfaro en Durán y Quevedo): los nulos y blancos de cada
  circunscripción se cuentan por separado.
- **Nombres.** Provincia y cantón llevan los mismos alias que el resto del
  tablero, más cuatro grafías de esta base (*Joya de los Sagchas*,
  *Olmedo/Puca*, *Sta. Isabel* y *Tiwinza*). Las parroquias se cruzan con la
  capa parroquial; los nombres truncados o abreviados de 2004 se unifican
  (*OCTAVIO CORDERO P* → *Octavio Cordero Palacios*, *SN* → *San*…). El script
  lista cada cambio. Lo que no tiene polígono —las parroquias urbanas antiguas
  de Quito, la cabecera sin desglosar de Huaquillas, los cantones que en 2004
  pertenecían a otra provincia— cuenta en su cantón y su provincia, igual que
  en `historico.json`. Ningún voto se cambia ni se mueve de cantón.

**Parroquias de cada dignidad.** Con *Concejales urbanos* el selector de
parroquia solo ofrece las urbanas (en La Maná: La Maná, El Carmen y El
Triunfo) y con *Concejales rurales* solo las rurales (Guasaganda y Pucayaco),
según la propiedad `estado` de la capa parroquial. Se suman las pocas que la
capa clasifica distinto que la base electoral pero donde la base registra esa
dignidad: *Sevilla Don Bosco* (Morona) y *Tiputini* (Aguarico), rurales en la
base; *Juan Montalvo* y *San José de Ayora* (Cayambe), con concejales urbanos.

**Réplica de 2004.** En 2004 los concejales se elegían en una sola lista para
todo el cantón y la base solo trae esa dignidad (con el código de concejales
urbanos). Para mantener la comparación histórica, *Concejales rurales* 2004 es
una copia exacta de esos registros: mismos territorios, organizaciones, votos,
nulos, blancos y postulantes. Como ese año hubo una sola lista, urbanos y
rurales muestran los dos el total de concejales del cantón. Solo se hace en los
cantones que eligen concejales rurales en algún otro año: a los 39 que no
tienen parroquias rurales (Durán, Huaquillas, Playas…) no se les crean. Los
años en que existen las dos dignidades no se tocan. Cuando la vista incluye un año replicado aparece el aviso «Esta
dignidad no existía de forma independiente en este año; se replica la
información disponible para mantener la comparación histórica».

Otros avisos que la propia sección muestra:

- Hasta 2019 cada elector podía votar por varios candidatos, así que los votos
  válidos suman preferencias y pueden superar al número de votantes; en 2023
  se votó por listas. Los porcentajes de nulos y blancos de 2004–2019 no son
  comparables con los de 2023.
- La base de 2023 no trae candidatos: los postulantes de ese año aparecen como «—».
- La escala de color del mapa es la general de siempre, calculada con
  prefectos y alcaldes: los colores de esas dos dignidades no cambian.

### El ganador, más visible

En los resultados de cada dignidad el ganador tiene un poco más de tamaño,
peso y aire que el resto, sin cambiar colores ni estructura: la tarjeta y la
primera fila de *Resultados electorales* en Preinscritos, y en el histórico la
primera fila de *Participantes por año*, la primera fuerza y la primera fila de
*Todas las organizaciones*.

### Un solo control de año

No hay desplegables de año, sino **una sola fila de años** que aparece dos
veces —en la barra del mapa y en la tarjeta *Participantes por año*— y que es
la misma: se pulse donde se pulse, todo lo que depende del año se mueve junto.

| Sigue el año elegido | Compara los cinco años siempre |
|---|---|
| el mapa electoral | evolución y fragmentación |
| las cuatro tarjetas de arriba | composición del voto |
| *Participantes por año* | nulos y blancos |

Los *Resultados de la última elección* y la distribución territorial que los
acompaña usan siempre la última elección disponible, y lo dicen en su título.
La sección arranca en el año más reciente y lo conserva al cambiar de
territorio o de dignidad.

### Participantes por año

La tarjeta muestra **todas las candidaturas** de una elección, no solo las dos
primeras. Arriba, una fila de años (2004 · 2009 · 2014 · 2019 · 2023): al
pulsar uno, el gráfico y la tabla pasan a ese año.

- El **gráfico** es una barra por candidatura, de mayor a menor, con su
  porcentaje. La más votada va en el color de la dignidad y el resto en gris:
  el orden ya dice quién ganó. El alto crece con el número de barras para que
  ningún nombre quede fuera.
- La **tabla** repite la lista con posición, candidato, organización política,
  votos y porcentaje. Nadie se agrupa en «otros» ni se queda fuera.

El porcentaje es **sobre los votos válidos de ese año y de ese ámbito**, que
es el único denominador que corresponde: nunca se mezclan dos elecciones. Por
eso la columna suma 100 %, y el pie de la tarjeta recuerda que los nulos y los
blancos quedan fuera del reparto.

El nombre del candidato solo aparece cuando el filtro llega al ámbito de una
sola elección: un cantón para alcalde, una provincia para prefecto. Por encima
de ese nivel la misma organización presenta decenas de candidaturas distintas
y no existe «el candidato»; en ese caso se muestra únicamente la organización
y la interfaz explica por qué.

Se recalcula con los filtros de la sección: provincia, cantón, parroquia y
dignidad. **La fila de años es la misma que la del mapa**: pulsar 2014 aquí
lleva el mapa a 2014, y al revés. El año se conserva al cambiar de territorio
o de dignidad.

Si la dignidad o el territorio no tienen datos de ese año —no todas las
combinaciones tienen las cinco elecciones—, la tarjeta muestra el último año
con datos sin arrastrar al mapa a un año que no se pidió.

### Las cuatro tarjetas de arriba

Encima de ellas va una línea que dice de qué son: **el año elegido** en el
ámbito y la dignidad filtrados. Las cuatro siguen la fila de años —la del mapa
y la de *Participantes por año*—, y cada título repite el año para que la fila
se entienda sin contexto:

| Tarjeta | Qué cuenta |
|---|---|
| **Votos válidos 2023** | votos a candidaturas; debajo, cuánto ha cambiado frente al primer año de la serie (en ese primer año, «primera elección de la serie») |
| **Votos nulos 2023** | sobre los votos emitidos (válidos + nulos + blancos) |
| **Votos en blanco 2023** | sobre los votos emitidos |
| **Candidatos 2023** | personas distintas que se presentaron — **listas**, en concejales y vocales |

La cuarta merece una nota: cuando el ámbito reúne varias contiendas, el
subtítulo lo dice. *71 candidatos* en Pichincha a alcalde son los de sus **ocho
elecciones cantonales** juntas, no los de una sola papeleta. Sale de
`data/postulantes.json`, que cuenta códigos de candidato distintos por año y
territorio; por eso no se puede sumar entre niveles y cada nivel se guarda
aparte.

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

- **Año** — 2004, 2009, 2014, 2019, 2023. Es **el año de la sección**: lo
  comparten el mapa, las cuatro tarjetas de arriba y la tarjeta *Participantes
  por año*, así que elegirlo en cualquier sitio mueve a los tres. La evolución,
  la fragmentación y los nulos y blancos siguen comparando los cinco años.
- **Indicador** — % votos válidos, % votos nulos, % votos blancos. Este sí es
  solo del mapa.

El color es un **degradado continuo**: se interpola sobre la escala de la
dignidad activa, de modo que un porcentaje bajo sale claro y uno alto sale
intenso.

#### Navegar por el mapa

El mapa **baja un nivel al hacer clic**, igual que el de Preinscritos, y los
selectores del panel izquierdo lo acompañan:

| Lo que se ve | Un clic lleva a |
|---|---|
| Las 24 provincias | la provincia, y el mapa pasa a sus cantones |
| Los cantones de la provincia | el cantón, y el mapa pasa a sus parroquias |
| Las parroquias del cantón | la parroquia; volver a pulsarla la suelta |

Es el mismo recorrido que hacen los selectores **Provincia → Cantón →
Parroquia**: lo que cambia es solo la forma de llegar. Con una dignidad que se
elige únicamente en parroquias urbanas o rurales (concejales), el clic respeta
la lista del selector y no enfoca una parroquia del otro tipo.

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

#### Parroquias urbanas y cruce con la base electoral

La capa parroquial es la del CNE (`Parroquias_Ref_CP_2025`): trae cada
parroquia urbana por separado —Quito tiene 32 urbanas y 33 rurales— con los
mismos nombres y códigos que la base electoral. Cada polígono guarda en el
campo `nombres_cne` los nombres con que la base lo registra, el vigente y los
de años anteriores (por ejemplo *Ayora* → *San José de Ayora*), así que cada
voto se pinta en su parroquia y el filtro de parroquia alimenta los gráficos
con los datos de esa parroquia.

La excepción son unidades de elecciones pasadas que hoy no existen como
parroquias: las 14 parroquias urbanas antiguas de Quito (2004–2009), la
cabecera sin desglosar de Huaquillas (2004–2014), una unidad urbana de Pasaje
(2014) y dos parroquias que en 2004–2009 figuraban en otro cantón (Quinsaloma
en Ventanas, El Carmen de Pijilí en Santa Isabel). Sus votos cuentan en los
totales del cantón y de la provincia, pero no tienen polígono propio en el mapa
parroquial de esos años. En 2019 y 2023 todas las parroquias cruzan.

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
│   ├── asignacion.js       Sección Asignación: panel, puente y marco
│   ├── data.js             ⭐ CONFIGURACIÓN + carga y cruce de datos
│   ├── map.js              Mapa Leaflet, coropletas, leyenda, exportar PNG
│   ├── charts.js           Los cuatro gráficos
│   ├── recintos.js         Bloque Electores: juntas y recintos (Preinscritos)
│   └── app.js              Filtros, KPIs, tabla, exportaciones
├── data/
│   ├── provincias.geojson    24 provincias (unión de los cantones) (350 KB)
│   ├── cantones.geojson      221 cantones (CNE 2022)            (866 KB)
│   ├── parroquias.geojson    1.240 parroquias (CNE 2025)        (2,3 MB)
│   ├── preinscritos.xlsx     Prefectos, alcaldes, concejales y vocales (2,5 MB)
│   ├── resultados2023.json   Resultados 2023 por parroquia       (563 KB)
│   ├── electores.json        Padrón por provincia y cantón      (6 KB)
│   ├── historico.json        Histórico 2004–2023 por parroquia  (2,1 MB)
│   ├── historico_dignidades.json  Concejales y vocales, todo el país (2,4 MB)
│   ├── postulantes.json      Postulantes por territorio y año   (529 KB)
│   ├── distributivo.json     Juntas y recintos de todo el país  (534 KB)
│   └── etario2027.json       Padrón 2027 por grupo etario       (10 KB)
├── asignacion/
│   └── simulador.html      Simulador de escaños completo (solo D'Hondt)
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
| `data/distributivo.json` | No | Juntas y recintos (bloque *Electores*) |

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
creado después de la cartografía base. Sus registros (6 de alcaldes y 20 de
concejales) siguen contando en los KPIs y la tabla; simplemente no se pintan
en el mapa, y la tarjeta *Cantones* lo suma al total («222 de 222»). La
consola del navegador (F12) lista los registros sin geometría.

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

Ya está incluida y activa: las 1.240 parroquias del SHP del CNE
`Parroquias_Ref_CP_2025`, agrupadas bajo sus cantones. Aparece con líneas finas
punteadas al seleccionar un cantón concreto en análisis de Alcaldes, y el
cuarto nivel de la ruta geográfica muestra cuántas parroquias tiene ese cantón
(por ejemplo, *65 parroquias* en Quito o *5 parroquias* en La Maná).

**Se carga en segundo plano.** Pesa más que las otras dos capas juntas y solo
hace falta al entrar en un cantón, así que el tablero se pinta primero con
provincias y cantones y la capa parroquial se incorpora sola un instante
después. No hay que hacer nada: cuando llega, la casilla *División parroquial*
del control de capas se habilita y el cuarto nivel de la ruta se activa.

Si prefieres quitarla para acelerar aún más la carga, borra el archivo
`data/parroquias.geojson`. La aplicación seguirá funcionando con tres niveles.

### Cómo se generó y cómo actualizarla

El archivo sale del SHP con `preparar_parroquias.py`, que lo pasa de UTM 17S
a WGS84, lo simplifica, asigna cada parroquia a su cantón de
`cantones.geojson` y la cruza con los nombres de la base electoral:

```bash
python preparar_parroquias.py RUTA\Parroquias_Ref_CP_2025.shp
```

Al terminar informa de lo que no cruza. Lo que hubo que ajustar para este SHP
está a la vista al inicio del script:

- **Ocho parroquias con otra grafía en el SHP** toman el nombre de la base
  electoral (mismo código CNE): *Chumbin* → *Chumblin*, *Changaimna* →
  *Changaimina*, *Yulog* → *Yuluc*, etc.
- **Sevilla Don Bosco** figura en el SHP como cantón, pero en la base
  electoral 2004–2023 y en la capa cantonal es parroquia de Morona: queda ahí.
- **Zona en estudio Juval** (sin cantón en el SHP) se ubica en Alausí, donde
  está el 97 % de su superficie según la capa cantonal, para no dejar un
  hueco.
- Cinco polígonos no tienen votos en la base porque son posteriores a 2023 o
  zonas en estudio: Sosote, La Primavera, La Magdalena (Shushufindi) y las
  zonas Juval y Sinaí-Cuchaentza. Aparecen en el mapa sin color.

### Las capas cantonal y provincial

La capa cantonal es la del CNE (`LIMITE_CANTONAL_CONALI_CNE_2022`, 221
cantones), la misma familia que la parroquial, así que sus límites coinciden
mucho mejor que los de la capa anterior del INEC. Las antiguas zonas no
delimitadas (Manga del Cura, Las Golondrinas y El Piedrero) ya forman parte de
sus cantones y dejan de aparecer como territorio aparte. La capa provincial se
obtiene uniendo los cantones, de modo que el borde de cada provincia coincide
exactamente con el de sus cantones.

Solo cambia el dibujo: cada cantón conserva el nombre, el código DPA y la
población de la capa anterior —con los que cruzan todas las bases—, y guarda
además el nombre oficial del CNE, con tildes, en `nombre_cne`. Para
regenerarlas (requiere mapshaper, `npm install -g mapshaper`):

```bash
python preparar_cantones.py RUTA\LIMITE_CANTONAL_CONALI_CNE_2022.shp
```

El script se detiene si algún cantón del CNE no encuentra su equivalente.

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

## 6b-2 · Asignación de escaños

La tercera sección **es el Simulador de Escaños Electorales completo**, el
mismo que entregaste, incrustado en `asignacion/simulador.html`. No se le
recortó ninguna función.

### Lo que puedes hacer dentro

Escribir las listas y sus votos a mano, añadirlas y quitarlas, cambiarles el
color y el nombre, pegar desde Excel o cargar un archivo, poner blancos y
nulos, umbral, regla de desempate y cómo se llaman los participantes (listas,
candidatos, alianzas u organizaciones). Y luego mirar el resultado por siete
caminos:

| Sección | Qué muestra |
|---|---|
| **Resultado** | escaños por lista, hemiciclo y la competencia por el próximo escaño |
| **Adjudicación** | escaño por escaño, con su divisor y su cociente |
| **Cocientes** | todos los cocientes ordenados, con el límite del último escaño |
| **Votos necesarios** | cuántos votos le faltan a cada lista, y el trasvase mínimo entre dos |
| **Simulador** | mover votos y ver en vivo qué escaños cambian |
| **Sensibilidad** | dónde está el punto en que un cambio mueve un escaño |
| **Escenarios** | guardar variantes, compararlas y fijar una como base |

Más exportar a CSV, Excel y PDF, copiar resultados, deshacer y guardar
borrador: el simulador recuerda lo que tienes en pantalla aunque cierres.

### Dos cambios respecto del original

1. **Solo D'Hondt.** Webster / Sainte-Laguë y Sainte-Laguë modificado se
   quitaron de su tabla `METODOS`, y con ellos la sección que los comparaba.
   Para devolverlos basta con añadir su entrada en esa tabla, al inicio del
   archivo.
2. **Bloque de participación.** Encima del simulador, el tablero calcula de
   cuántos votos válidos se parte y cuántos escaños se reparten.

Nada más se tocó: el motor, la interfaz y los cálculos son los suyos.

### El bloque de participación

Parte del padrón y descuenta, en este orden, quien no vota, lo nulo y lo
blanco:

```
electores − ausentes − nulos − blancos = votos válidos
```

Los cuatro porcentajes van **sobre el padrón**, no sobre los votos emitidos.
Por eso suman exactamente 100 y la resta cuadra al voto. Los cuatro campos se
escriben; lo que se escribe no se vuelve a recalcular hasta cambiar de cantón
o pulsar *Volver a los datos de 2023*.

**De dónde salen los valores por defecto**

| Campo | Origen |
|---|---|
| Electores | el padrón vigente (2027) de las parroquias que eligen esta dignidad |
| % ausentismo | ese padrón menos quienes votaron en la elección elegida |
| % nulos, % blancos | los de esa elección, divididos por el mismo padrón |

El padrón **no es el del cantón entero**: a los concejales urbanos los eligen
solo las parroquias urbanas y a los rurales solo las rurales. El tipo de cada
parroquia es el campo `estado` de la capa parroquial y el padrón de cada una
sale del distributivo de recintos. Usar el cantón completo inflaba el
ausentismo de Quito del 19 % al 43 %.

### Los escaños no se preguntan

Cada cantón elige un número fijo de concejales urbanos y rurales, y el tablero
lo sabe: está en `data/escanos.json`, con Quito 15 + 6, Guayaquil 14 + 1,
Cuenca 10 + 5, La Maná 4 + 1, Pedernales 4 + 3. El bloque lo muestra en su
esquina y lo manda al simulador; dentro se puede cambiar.

Ese archivo se **cuenta**, no se supone: la base consolidada marca con
`ELECTOS` a quienes ganaron, y el número de electos de un cantón en una
dignidad es el número de escaños que repartió.

```bash
python preparar_escanos.py RUTA\Base_Consolidada_Concejales_Vocales_2004_2023.sav
```

La marca de electos solo está en 2004, 2009 y 2014, así que se usa **2014**,
el más reciente que la tiene; el archivo lo deja escrito. En la mayoría de los
cantones el número no ha cambiado —depende de tramos de población que se
mueven despacio—, pero donde haya cambiado se corrige dentro del simulador.

### Llevar al simulador

El botón **Llevar al simulador** manda tres cosas: los escaños del cantón, los
blancos y nulos de la cuenta, y una lista por organización con **su porcentaje
de aquella elección aplicado al total de válidos calculado**. Si no se tocó
nada, ese total es el real y los votos salen tal cual.

Al repartir con porcentajes sobran o faltan unos pocos votos por el redondeo;
la diferencia se le suma a la lista más votada, que es la única forma de que
el total cuadre sin alterar el orden. Es un escenario simulado: el histórico
guarda los votos reales intactos.

Funciona sin tocar el código del simulador: él guarda lo que tiene en pantalla
en `localStorage` (clave `simuladorEscanos.v1.borrador`) y lo recupera al
arrancar, así que el tablero escribe ahí ese mismo borrador y recarga el
marco. Ojo: **reemplaza lo que hubiera dentro**. *Empezar en blanco*, en el
panel, deja tres listas vacías.

### Dónde vive

```
asignacion/simulador.html   el simulador completo (320 KB)
js/asignacion.js            el panel, la participación y el marco
data/escanos.json           concejales que elige cada cantón
preparar_escanos.py         lo genera desde la base consolidada
```

Carga React desde cdnjs, igual que el tablero carga Leaflet y Chart.js, así
que necesita conexión la primera vez.

---

## 6c · Resultados electorales 2023

Bajo el mapa aparece el bloque **Resultados electorales 2023**, con el
candidato ganador, la tabla completa de candidaturas ordenada de mayor a menor
votación y un botón para desplegar el **desglose por parroquia**. Se actualiza
con los mismos filtros que el resto del tablero: dignidad, provincia y cantón.

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

### Ver resultados por parroquia (2023)

Al pie del bloque hay un botón, **Ver resultados por parroquia (2023)**, con el
número de parroquias del ámbito. Está cerrado al empezar y se abre y se cierra
con un clic, igual que la lista de recintos; lo que ya mostraba el bloque
—ganador y tabla de candidaturas— sigue en su sitio sin cambios.

Lo que se ve dentro depende del filtro:

| Filtro | Contenido |
|---|---|
| **Cantón** | cada parroquia, con **todas** sus candidaturas, votos y porcentaje |
| **Provincia** | cada parroquia agrupada por cantón, con su candidatura más votada |
| **Sin filtro** | cuántas parroquias y cuántos votos tiene cada provincia |

El porcentaje es **sobre los votos válidos de esa parroquia**. Sumar las
parroquias de un cantón devuelve exactamente el total del cantón: el archivo
se agrega desde la fila original, sin repartir ni ajustar ningún voto.

`data/resultados2023.json` guarda ahora la parroquia **ya emparejada con su
polígono** de `data/parroquias.geojson` —misma regla que `js/data.js`: nombre
exacto, nombre sin espacios y, si no, la lista `nombres_cne` del polígono—, de
modo que el navegador filtra comparando claves y no nombres. En 2023 las 1.235
parroquias del CNE cruzan todas; si alguna no cruzara, iría con `-1` y sus
votos seguirían contando en el cantón y en la provincia, pero sin desglose.
El archivo pasa de 138 KB a 563 KB, y los totales por cantón son idénticos a
los de antes.

Para regenerarlo:

```bash
python preparar_resultados.py
```

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

**Panel lateral.** Dignidad, provincia, cantón, parroquia y limpiar filtros.
El selector de cantón está deshabilitado hasta que elijas una provincia, y el
de parroquia hasta que elijas un cantón. El de parroquia solo aparece con las
dignidades que se eligen por parroquia (hoy, Vocales).

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
- En **Alcaldes** y **Concejales** colorea cantones y marca los límites
  provinciales.
- En **Vocales** colorea parroquias, con las mismas divisiones cantonales. La
  capa parroquial se descarga en segundo plano: mientras llega, el mapa
  mantiene los cantones en gris y se repinta solo al terminar.

**Ruta geográfica.** La barra superior del mapa (Ecuador › Provincia › Cantón
› Parroquia) muestra en qué nivel estás y sirve para subir de nivel con un
clic. El cuarto tramo indica cuántas parroquias tiene el cantón enfocado o,
con una parroquia enfocada, su nombre. A la derecha, *Nivel base* recuerda el
nivel de análisis de la dignidad activa.

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
