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

La barra bajo el encabezado alterna entre cuatro secciones:

| Sección | Responde a | Años |
|---|---|---|
| 👥 **Preinscritos** | ¿Cómo está compuesto el padrón de preinscritos y de electores? | 2027 |
| 📊 **Histórico electoral** | ¿Cómo ha cambiado el voto y qué pasó en la última elección? | 2004 → 2023 |
| 🪑 **Asignación-Escaños** | Con las listas inscritas y esta participación, ¿cuántos concejales le toca a cada lista y a qué candidatos? | 2027 |
| 🏘️ **Vocales-Escaños** (v6.0) | Lo mismo para los vocales de cada junta parroquial rural | 2027 |

Las dos últimas usan el mismo simulador —vocales, en una copia propia— con el
botón **Descargar reporte PDF** (§6b-2 y §6b-3). Vocales-Escaños es
independiente: no cambia nada de las otras tres.

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
│   ├── styles.css          Sistema visual completo
│   └── vocales.css         Solo la sección Vocales-Escaños (v6.0)
├── js/
│   ├── secciones.js        Histórico, Resultados y Análisis territorial
│   ├── asignacion.js       Sección Asignación: panel, participación, puente y marco
│   ├── vocales.js          Sección Vocales-Escaños: parroquia, mapa, participación y marco (v6.0)
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
│   ├── vocales.json          Vocales 2023 por parroquia: nombres, códigos, votos (87 KB)
│   ├── postulantes.json      Postulantes por territorio y año   (529 KB)
│   ├── distributivo.json     Juntas y recintos de todo el país  (534 KB)
│   └── etario2027.json       Padrón 2027 por grupo etario       (10 KB)
├── asignacion/
│   ├── simulador.html      Simulador de escaños de concejales (solo D'Hondt), con el reporte PDF
│   └── simulador_vocales.html  Copia del simulador para Vocales-Escaños (v6.0)
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

## 6b-2 · Asignación-Escaños

La tercera sección reparte los escaños de concejales de un cantón. Dentro va el
**Simulador de Escaños Electorales**, incrustado en `asignacion/simulador.html`,
con el tablero alrededor: el territorio, el padrón y las listas se eligen fuera
y entran solos.

**Trabaja siempre con las listas y los candidatos inscritos para 2027**, del
registro de preinscritos. Ya no carga los resultados ni los partidos de 2023:
no hay botón «Simular asignación», ni «Llevar al simulador», ni «Volver a los
datos de 2023», ni «Volver a resultados 2023». La simulación con los inscritos
es lo que se ve siempre.

Solo los **concejales** tienen escaños, así que la sección trabaja únicamente
con concejales urbanos y rurales. Va sobre fondo claro —es la única del tablero
que lo hace— para que las tarjetas de colores se lean mejor.

### Cómo se usa

La pantalla sigue un orden fijo: **selección → opciones → mapa → resultado →
análisis**.

1. **Provincia y cantón**, en la columna de la izquierda o haciendo clic en el
   mapa provincial. El territorio que venía de las otras secciones se respeta.
2. **Concejalía.** Tras elegir el cantón aparecen solo las concejalías que ese
   cantón elige de verdad, con sus escaños: urbanos y rurales en la mayoría,
   solo urbanos en los 39 cantones sin parroquias rurales (Durán, Huaquillas…).
   Si el cantón elige una sola, queda marcada sin preguntar. En la pantalla
   inicial no hay botones fijos de urbanos ni de rurales.
3. **Circunscripción.** En los 17 cantones que eligen a sus urbanos por
   circunscripción aparece un botón por cada una, con su **nombre literal**
   (ver *Circunscripciones*). Hay que elegir una: cada circunscripción tiene
   sus propias listas, candidatos y escaños.
4. Arriba, la **ruta** dice en todo momento qué se analiza (Ecuador › provincia
   › cantón › concejalía › circunscripción); cada paso ya dado es un botón para
   volver a él. Al cambiar de provincia o de cantón, lo que ya no corresponde se
   suelta solo.
5. En cuanto el distrito está completo, el simulador se llena con las **listas
   inscritas** de ese distrito, con sus candidatos y sin votos, y con los
   escaños que se eligen en 2027. En la tabla de cocientes se escribe el
   porcentaje de cada lista y todo lo demás sale solo.

Mientras falta algún paso, en el sitio del simulador hay un aviso que dice cuál
(así nunca queda a la vista un borrador guardado de otro territorio).

### El mapa electoral del cantón

Con el cantón elegido, el mapa dibuja sus parroquias con su forma real (la capa
parroquial del proyecto) y las agrupa por distrito electoral:

- **Cada circunscripción tiene su color** y el límite entre circunscripciones se
  traza como una línea oscura propia, calculada sobre la topología de la capa
  (los tramos que comparten parroquias de distritos distintos). El borde del
  cantón va aparte. Las parroquias rurales van en verde.
- **Al elegir una circunscripción** —con su botón, en el panel de la derecha o
  haciendo clic en el mapa— su territorio se resalta con halo y contorno grueso
  y el resto se atenúa. La ficha muestra su **nombre exacto**, sus escaños, su
  padrón y la lista de **parroquias** que la integran.
- Cada distrito lleva un único marcador con sus escaños, dentro de su propio
  territorio; no hay etiquetas por parroquia, para no saturar.
- La **leyenda** explica colores, límites y rayas.

Lo que la cartografía no permite trazar se dice en vez de inventarse:

| Caso | Qué pasa |
|---|---|
| Parroquias repartidas entre dos circunscripciones (Esmeraldas: 5 DE AGOSTO; Daule: LA AURORA; Durán: ELOY ALFARO /DURAN; Milagro: MILAGRO; Quevedo: QUEVEDO; Rumiñahui: SANGOLQUI; La Libertad: LA LIBERTAD) | Van rayadas con los colores de las dos: la capa no tiene el límite que pasa por dentro de la parroquia. La ficha lo explica. |
| URBIMANTA (Manta) | Está en el distributivo, pero la capa parroquial no tiene su polígono: sale en la ficha como «sin polígono». |

### El resultado

Dentro del simulador, en este orden:

1. **Cocientes electorales**: la tabla donde se escriben los porcentajes. Sigue
   igual, con su menú «⋯» (ordenar, poner los porcentajes en cero) y la carga de
   archivos. Al final ya no están los campos de votos en blanco y nulos ni su
   texto: esas cifras llegan del bloque de participación y el cálculo de los
   votos válidos no cambió. La franja gris de totales pasó al simulador de votos.
2. **Resultado de la simulación**, encabezado con el distrito (concejalía,
   circunscripción con su nombre literal y cantón):
   - **Resumen**: escaños asignados frente a los del distrito, organizaciones con
     representación, votos válidos repartidos, último cociente ganador y quién
     está más cerca del próximo escaño.
   - **Distribución de escaños por organización política**: histograma grande con
     las organizaciones en el eje horizontal (número de lista y nombre completo,
     sin cortes) y los escaños en el vertical, de mayor a menor. Encima de cada
     barra, el % de votos de la lista sobre los votos válidos considerados;
     debajo, su total de votos. Solo
     aparecen las que obtienen escaño; las demás van aparte, en *Sin escaño en
     esta simulación*. Un sello comprueba que la suma de las barras es la del
     distrito.
   - **Puestos de los escaños por organización política** (v5.9.1): una fila
     por cada organización con escaño y una columna por escaño, en el orden en
     que se adjudica (1.º = el cociente más alto). Cada casilla de color es un
     puesto que gana esa organización, con su número, y bajo el nombre van sus
     puestos («2 escaños: 1.º y 3.º»). Al pasar el ratón por una casilla se ve
     qué escaño de la lista es y su cociente. Sale de la adjudicación real del
     motor.
   - **Candidatos que obtienen escaño**, como antes.
3. **Simulador ¿qué pasa si…?**: deslizadores y trasvase de votos a partir de
   los porcentajes escritos; *Restablecer* vuelve a ellos. El resultado y los
   análisis se recalculan al instante.
   - En la cabecera de la sección, el botón **Descargar reporte PDF** (v6.0):
     descarga en un PDF el escenario que se está viendo (ver *Reporte PDF*,
     más abajo).
   - Encima, la **franja gris de totales** (total de votos, de listas, escaños
     disponibles y votos válidos considerados), la misma que estaba al final de
     la tabla de cocientes.
   - Los escaños son siempre los del distrito: no se eligen. Los botones
     ±10 / 25 / 50 / 100 % ya no están (los deslizadores quedan en ±50 %).
   - Junto a cada barra, los **escaños de la lista y sus posiciones de
     adjudicación** («2 escaños: 1.º y 4.º»).
   - En la columna de la derecha, los votos **mínimo y máximo** con los que la
     lista tiene los escaños que tiene en ese momento (por ejemplo, «Para 3
     escaños · mín. … · máx. …»), con las demás listas como están. Al mover su barra
     a otro número de escaños, la columna pasa a ese número. Son búsquedas
     exactas del motor; con todos los escaños en juego el máximo es «sin tope».
   - **Nuevo** abre otro escenario: el **reparto de escaños** (v5.9). Los votos
     vuelven a los de la tabla de cocientes y cada lista pasa a tener una barra
     de escaños, de 0 a los del distrito, que empieza en 0: todas pueden llegar
     a todos. Lo que se le da a una lista deja de estar libre para las demás: si
     una tiene 4 de 5, las otras llegan como mucho a 1 (los escaños que ya no
     caben se ven rayados y su «+» se apaga). Arriba, un **aviso** dice cuántos
     faltan —«Te queda 1 escaño para completar»— hasta «Completaste los 5
     escaños», con una franja de los escaños repartidos en el color de cada
     lista; cada cambio lo repite también en el aviso flotante de abajo. La
     columna de la derecha da los votos **mínimo y máximo** con los que esa
     lista obtendría los escaños elegidos si las demás conservan los votos de
     la tabla (misma búsqueda exacta del motor). **Nuevo** otra vez empieza
     otro reparto, todas en 0, y **Volver a los votos** regresa a los
     deslizadores de votos. Durante el reparto no se muestran el trasvase ni
     *Restablecer* / *Fijar como base*, que son de los votos; el reparto no se
     guarda al recargar la página.
   - **Escaño adicional**, para la lista que se elija: votos adicionales que
     necesita, cociente que debe superar, posición de adjudicación que debe
     alcanzar, margen frente a la lista que la ocupa (votos que tendrían que
     pasar de esa lista y diferencia de cocientes) y rango de votos con el que
     conserva sus escaños. Todo sale de búsquedas exactas del motor sobre el
     reparto real con todas las listas; las demás conservan sus votos.
4. **Análisis de sensibilidad**: sin cambios.
5. **Estabilidad y cambios en la representación** (nuevo, ver abajo).
6. **Cómo se asignan los escaños** (nuevo, ver abajo).

Se quitaron de la vista la tabla **Orden de adjudicación** y la tarjeta
**2023 frente a la simulación** (en la v5.5 se llamaba *Escenario base frente
a la simulación*). Los cálculos siguen intactos en el motor: la adjudicación
escaño por escaño se sigue usando en los candidatos, en la explicación y en
las exportaciones (CSV · Adjudicación de escaños, Excel y PDF).

### Estabilidad y cambios en la representación

Responde a *qué parte del reparto es firme y qué parte depende de unos pocos
votos*. Es distinto de la sensibilidad, que mueve los votos de **una** lista con
las demás fijas:

- Cada organización con votos **sube o baja de 0,5 en 0,5 puntos**, hasta la
  amplitud elegida (±1, ±2, ±3 o ±5 puntos de los votos válidos), y **las demás
  compensan en proporción a sus votos** (restos mayores: el total no cambia ni
  en un voto).
- Cada escenario se reparte con el **mismo motor** del resultado
  (`Motor.contarEscanos`: D'Hondt, los mismos escaños, umbral y regla de
  desempate). Nada se aproxima.
- Muestra: **escaños firmes** (los que conserva cada organización en todos los
  escenarios) y **en juego**; cuántos escenarios mueven algún escaño; el máximo
  de escaños que cambian en uno; un nivel de **sensibilidad del reparto**
  (*Muy estable* si ningún escenario cambia, *Estable* por debajo del 15 % de
  escenarios con cambios, *Sensible* por debajo del 35 %, *Muy sensible* desde
  ahí); y, por organización, de la más estable a la menos, su **rango posible
  de escaños**, el reparto de escenarios en que mantiene, gana o pierde, y su
  situación (*Estable*, *Puede ganar*, *Puede perder*, *En disputa*, *Puede
  entrar*). Las que no tienen escaño en ningún escenario van en una sola línea.
- **Cambios más cercanos**: el menor movimiento de cada organización que cambia
  el reparto, con los votos exactos y quién gana y quién pierde.

Va rotulado como **escenarios hipotéticos**: no es una proyección ni un
resultado oficial.

### Cómo se asignan los escaños

Una explicación en cinco pasos con los datos de la simulación —**Resultados →
Fórmula → Comparación → Distribución → Escaños**— que sigue a una organización
(se elige en la lista de la izquierda, o haciendo clic en la carrera de
cocientes):

- sus votos y su %; la división de sus votos para 1, 2, 3…; cuántos cocientes
  entran en la comparación; el último cociente ganador (la cifra que hay que
  igualar o superar) y cuántos de los suyos lo hacen; sus escaños.
- La **escalera de sus cocientes** con la línea del último cociente ganador:
  los que la superan llevan el número de escaño que ganaron.
- Una frase que explica por qué obtiene esos escaños (o por qué ninguno),
  cuántos votos le faltarían para uno más con las demás fijas, y quiénes ocupan
  sus escaños por orden de inscripción.
- **Todos los cocientes, de mayor a menor**, con el límite del último escaño y
  la organización elegida resaltada.

No cambia la fórmula: explica la que usa el sistema.

### Reporte PDF (v6.0)

El botón **Descargar reporte PDF**, en la cabecera de *Simulador: ¿qué pasa
si…?*, arma el PDF en el navegador con el estado del simulador en ese
momento. No es una captura de pantalla ni una plantilla fija, y no pasa por
Excel: sale del mismo motor y con los mismos formatos de la pantalla, así que
sus cifras son las que se ven.

La portada dice qué caso documenta:

| Lo que hay en el simulador | Rótulo del reporte |
|---|---|
| Sin cambios en el «¿qué pasa si…?» | DISTRIBUCIÓN DE REFERENCIA |
| Votos cambiados con los deslizadores o el trasvase | ESCENARIO HIPOTÉTICO (referencia frente a simulado) |
| El reparto de **Nuevo** | REPARTO PROPUESTO |

Contenido, en este orden:

1. **Encabezado**: logo y nombre de la empresa (los de `CONFIG.marca`),
   «Reporte de Simulación Electoral», la jurisdicción (provincia, cantón y
   circunscripción o parroquia, con su nombre literal), la dignidad, la fecha y
   hora de generación y el rótulo del caso.
2. **Resumen ejecutivo**: votos válidos considerados (con blancos y nulos),
   organizaciones participantes y con escaño, escaños a distribuir y método, y
   cuántos escaños cambian de manos; debajo, quién gana y quién pierde
   escaños, y la composición del cuerpo con un punto por escaño.
3. **Resultados por organización política**: votos de referencia y
   simulados, porcentaje (la base va escrita: los votos válidos del distrito,
   la misma que usa la tabla de cocientes), escaños de referencia y simulados y
   la diferencia. En *Nuevo*, además, el reparto propuesto con los votos mínimo
   y máximo de cada escaño elegido.
4. **Gráficos**: distribución de escaños (referencia frente a simulación) y
   porcentaje de votación.
5. **Detalle metodológico**: fórmula D'Hondt (divisores 1, 2, 3…), escaños y
   su fuente, votos utilizados, base de los porcentajes, umbral, criterio de
   desempate, fuente de los datos y fecha de referencia; después, el orden de
   adjudicación escaño por escaño (con el primer cociente que queda fuera) y
   la tabla de cocientes, con dos decimales.
6. **Advertencia**: resultados hipotéticos, no una proclamación del CNE.

Formato: A4 vertical, «Página X de Y» en cada pie, encabezados de tabla que
se repiten al pasar de página, ninguna fila partida entre dos páginas,
porcentajes con dos decimales, votos y escaños enteros y nombres completos.
El PDF trae marcadores por sección.

El archivo se llama `reporte_simulacion_<cantón>_<parroquia o
circunscripción>_<fecha>_<hora>.pdf`, por ejemplo
`reporte_simulacion_quito_calderon_2026-10-23_1530.pdf`.

**Descargar el reporte no cambia nada**: ni los votos, ni la base, ni el
borrador guardado. Solo usa el distrito activo. Si el escenario todavía no se
puede calcular, el botón queda gris y no se genera un PDF con cifras a medias.

Lo escribe un generador propio que va dentro de `asignacion/simulador.html`
(`<script id="pdf-mini">`, fuentes estándar Helvetica): no necesita conexión
ni librerías externas. La marca, la provincia y el año de la participación de
partida los lee del tablero, sin cambiar nada de él. La opción *PDF* del menú
de exportaciones de siempre sigue como estaba.

**El botón es lo único nuevo en concejales.** `js/asignacion.js`, `js/app.js`
y `css/styles.css` son idénticos a los de la v5.9.1, y `asignacion/simulador.html`
es el de la v5.9.1 con el botón y el código del reporte añadidos, sin otra
línea cambiada.

### Solo D'Hondt

Webster / Sainte-Laguë y Sainte-Laguë modificado se quitaron de su tabla
`METODOS`, y con ellos la sección que los comparaba. Para devolverlos basta con
añadir su entrada en esa tabla, al inicio del archivo. En la interfaz no hay
selector de método: la configuración muestra «D'Hondt» fijo.

### El bloque de participación

Son dos pasos, cada porcentaje sobre su propia base, igual que en los datos
oficiales:

```
electores − ausentes                 = votos emitidos
votos emitidos − nulos − blancos     = votos válidos
```

Los votos emitidos son la tarjeta **Sufragantes**. Las tarjetas muestran solo
su título y su cifra; la cuenta en dos pasos va debajo de ellas, sin el párrafo
que la explicaba (se quitó en la v5.9.1). El simulador tampoco lleva ya la nota
«Cómo se calcula» al pie.

El **ausentismo va sobre el padrón**; los **nulos y los blancos, sobre los
votos emitidos**. Los tres campos y el padrón se escriben; lo escrito no se
vuelve a calcular hasta cambiar de cantón o de circunscripción, y cada cambio
pasa solo al simulador, sin botón.

| Campo | Origen |
|---|---|
| Electores | el padrón vigente (2027) de las parroquias que eligen esa dignidad |
| % ausentismo | punto de partida: ese padrón menos quienes votaron en la última elección (2023) |
| % nulos, % blancos | punto de partida: los de la última elección, sobre sus votos emitidos |

De la elección anterior **solo se toman esos tres porcentajes de partida**; las
listas, los candidatos y los escaños son los inscritos. Si un territorio no
tiene elección anterior, los tres empiezan en cero para escribirlos a mano.

El padrón **no es el del cantón entero**: a los concejales urbanos los eligen
solo las parroquias urbanas y a los rurales solo las rurales. El tipo de cada
parroquia es el campo `estado` de la capa parroquial y el padrón de cada una
sale del distributivo de recintos. Usar el cantón completo inflaba el
ausentismo de Quito del 19 % al 43 %.

### Los escaños no se preguntan

**Cuántos elige cada territorio en 2027 lo dice el propio registro de
inscripción**: la ley obliga a cada lista a inscribir tantos candidatos
principales como escaños haya que llenar, así que el número de candidatos de
una lista *es* el número de escaños. En los distritos del archivo todas las
listas coinciden entre sí, de modo que el dato es firme.

Ese número es el que usa **toda la sección**: el mapa y las tarjetas de la
vista provincial, el sello del bloque de participación y el simulador. En los
cantones que eligen a sus urbanos por circunscripción, el total del cantón es
la suma de lo que elige cada una (Quito 5 + 4 + 5 = 14).

`data/escanos.json`, el consolidado oficial de escaños de 2023 que entregó el
cliente, queda solo como **respaldo**: se usa únicamente si para algún filtro el
registro no trajera candidatos, y entonces el sello lo dice («tabla oficial»).
Hoy los 424 distritos —los urbanos de 221 cantones (en 17 de ellos, por
circunscripción) y los rurales de 182— tienen inscritos.

Ese Excel es de 2023 y no siempre coincide con 2027: en 90 de los 402 casos de
cantón y concejalía el registro elige otro número de concejales (Machala
urbanos, 10 → 12; Cuenca urbanos, 10 → 9…), y **Rocafuerte** elige por primera
vez un concejal rural, por la parroquia rural Sosote, que el Excel no tiene. Se
reparten siempre los del registro de 2027. Para regenerarlo:

```bash
python preparar_escanos.py RUTA\Escanos_2023-consolidado_v1.xlsx
```

### Circunscripciones

Diecisiete cantones eligen a sus concejales urbanos en varias
**circunscripciones**: Quito, Guayaquil, Santo Domingo y Durán en 3, y trece
más en 2. Cada una elige sus propios escaños con sus propias listas y sus
propios candidatos.

```bash
python preparar_circunscripciones.py RUTA\14_DISTRI_FEBRERO_2026_zona_CIRCUNS_1.xls
python preparar_nombres_circunscripciones.py RUTA\Escanos_2023-consolidado.xlsx
```

El primero escribe `data/circunscripciones.json` con las parroquias y el padrón
de cada circunscripción (el tablero usa la **proporción** del padrón, no la
cifra absoluta, para no mezclar el padrón de 2026 con el de 2027). El segundo,
que se corre después, le pone a cada una su **nombre oficial**, tomado
**literalmente** de la hoja `CONCEJALES_URBANOS_CIRCUNS` del Excel de escaños
del cliente: sin cambiar mayúsculas, tildes, palabras ni orden. Las reglas:

1. Se empareja por **número** («CIRCUNSCRIPCION URBANA 2» con la 2 del registro).
2. Si el Excel usa nombres de **orientación** (NORTE, CENTRO, SUR…), se empareja
   por **ubicación**: el centro de las parroquias de cada circunscripción del
   registro. Así sale Quito: 1 = CIRCUNSCRIPCION URBANA NORTE, 2 = CENTRO,
   3 = SUR.
3. Si el Excel no trae esa circunscripción, se usa el nombre **del registro de
   inscripción 2027**, también literal. Nada se inventa.

El mismo script imprime las diferencias entre el Excel y los datos del sistema,
y el tablero las enseña en la ficha de cada circunscripción. Las de hoy:

| Cantón | Diferencia | Qué se hace |
|---|---|---|
| Daule, Ibarra, Rumiñahui, La Libertad | El Excel no trae circunscripciones; el registro 2027 trae 2 | Nombres del registro |
| Durán, Santo Domingo | El Excel trae 2; el registro 2027 trae 3 | La 3 lleva el nombre del registro |
| Quito | Excel con nombres de orientación; registro numerado | Emparejado por ubicación (ver arriba) |
| Cuenca 2; Machala 1 y 2; Esmeraldas 1; Durán 1 y 2; Guayaquil 2 y 3; Quevedo 1 y 2; Portoviejo 1; Quito CENTRO; Santo Domingo 1 y 2 | El Excel (2023) trae otro número de escaños que el registro de inscripción 2027 | Se reparten los del registro; la ficha da las dos cifras |

Ya no existe la opción «Todo el cantón»: repartir juntas varias
circunscripciones mezclaba listas y candidatos que no compiten entre sí.

### Las listas y los candidatos inscritos

**Ver listas preinscritas**, encima del simulador, abre el registro: cada lista
con su número, su organización y sus candidatos en el orden en que se
inscribieron, con su suplente. Sale de `data/preinscritos.xlsx`, el mismo
archivo de la primera sección, filtrado por provincia, cantón, circunscripción
y dignidad. No se inventa ni se completa nada: lo que no está inscrito, no sale.
Son las mismas listas que carga el simulador.

La tarjeta **Candidatos que obtienen escaño** dice quién se lleva cada uno, con
su lista y su organización. Los escaños de una lista se adjudican **por orden
de inscripción**: el primero que gana va a su ORDEN 1, el segundo al ORDEN 2.
El registro no trae votos por candidato, así que no se simula ningún voto
preferente. Si una lista gana más escaños de los que inscribió, la tarjeta lo
dice en vez de inventar un nombre.

### El puente con el simulador

Al elegir el distrito, el tablero escribe el escenario —las listas inscritas,
los escaños, los votos válidos, los blancos, los nulos y el nombre literal de la
circunscripción— en el borrador que el simulador lee al arrancar
(`localStorage`, clave `simuladorEscanos.v1.borrador`) y recarga el marco.

La participación, que cambia mientras se trabaja, viaja **en vivo** por
`postMessage`, sin recargar: el simulador reescala los votos de cada lista al
nuevo total de válidos, de modo que los porcentajes escritos se quedan como
estaban. Al arrancar, el simulador avisa al tablero (`simulador/listo`) y este
le manda la cuenta de ese momento, por si cambió mientras cargaba.

### Dónde vive

```
asignacion/simulador.html               el simulador (resultado, histograma, estabilidad, explicación, reporte PDF)
js/asignacion.js                        selección, mapa, participación, registro y marco
data/escanos.json                       respaldo: concejales de la tabla oficial de 2023
data/circunscripciones.json             circunscripciones urbanas: parroquias, padrón y nombre oficial
preparar_escanos.py                     genera escanos.json desde el consolidado de 2023
preparar_circunscripciones.py           genera circunscripciones.json desde el distributivo del CNE
preparar_nombres_circunscripciones.py   añade los nombres literales del Excel de escaños
```

Carga React desde cdnjs, igual que el tablero carga Leaflet y Chart.js, así que
necesita conexión la primera vez.

### Carpetas por territorio

`compilar_usuario.py` copia `js/`, `css/` y `asignacion/` tal cual y recorta
`circunscripciones.json` al territorio, así que las carpetas recortadas
(Pedernales, La Maná, Pichincha) toman este mismo comportamiento al volver a
compilarlas. En las de un solo cantón la concejalía queda marcada si el cantón
elige solo una; si elige urbanos y rurales (Pedernales), se escoge con su botón.

---

## 6b-3 · Vocales-Escaños (v6.0)

La cuarta sección hace para los **vocales de las juntas parroquiales rurales**
lo mismo que Asignación-Escaños hace para los concejales: la misma
estructura, el mismo simulador (en una copia propia,
`asignacion/simulador_vocales.html`) y el mismo método, **D'Hondt**. Solo
cambia el distrito: cada parroquia rural elige su propia junta, con sus
listas, sus votos y sus vocales. Asignación-Escaños no cambió y esta sección
no lo toca: ni sus archivos, ni lo que tenga escrito, ni su territorio.

> D'Hondt es el método de concejales y el que se pidió para vocales. Como
> referencia: en 2023 los vocales se adjudicaron con Webster (divisores 1, 3,
> 5, 7…), y la reforma al Código de la Democracia aprobada en junio de 2025
> volvió a D'Hondt.

### Cómo se usa

1. **Provincia y cantón**, en el panel de la izquierda o con un clic en el
   mapa. La primera vez la sección se abre con el territorio que se miraba en
   las otras; después conserva el suyo, y elegir aquí otro cantón no cambia el
   de ninguna otra sección (concejales sigue en su distrito, con lo escrito).
2. **Parroquia rural.** Aparecen solo las parroquias del cantón con listas
   inscritas para vocales en 2027, cada una con su nombre exacto y sus vocales
   (`CALDERON · 7 vocales`). Se elige en el panel, en la lista junto al mapa o
   con un clic en el mapa.
3. Arriba, la **ruta** (Ecuador › provincia › cantón › Vocales de juntas
   parroquiales › parroquia) dice qué se analiza; cada paso ya dado es un botón
   para volver a él.
4. Con la parroquia elegida, el simulador se llena con sus **listas y
   candidatos inscritos para 2027**, sin votos, y con los vocales que elige
   esa junta. Se escribe el porcentaje de cada lista en la tabla de cocientes
   y el reparto sale solo. Todo lo demás —resultado, *¿qué pasa si…?*,
   *Nuevo*, sensibilidad, estabilidad, explicación y **Descargar reporte
   PDF**— es lo mismo que en concejales.

Bajo la participación, **Ver listas preinscritas** muestra las listas y los
candidatos de la parroquia tal como están en el registro.

### El mapa

- **Provincia**: sus cantones, coloreados por cuántos vocales eligen entre
  todas sus juntas parroquiales; junto al mapa, los vocales de la provincia,
  sus parroquias rurales y cuántas juntas eligen 7. Un clic baja al cantón.
- **Cantón**: sus parroquias con su forma real; las rurales que eligen
  vocales van en color y la elegida, resaltada. Al lado, la lista de sus
  parroquias rurales (con desplazamiento propio en los cantones grandes:
  Quito tiene 33) y, debajo, la **ficha** de la elegida: nombre exacto,
  vocales 2027, electores, listas inscritas y sus cifras de 2023 (votos
  válidos, organizaciones y vocales).

### De dónde sale cada dato

| Dato | Origen |
|---|---|
| Parroquias, listas y candidatos | Registro de preinscritos 2027 (`data/preinscritos.xlsx`), dignidad *Vocales de junta parroquial rural*: 824 parroquias |
| Vocales que se eligen | Los candidatos principales que inscribió cada lista: 5, o 7 en las parroquias de más de 50.000 habitantes |
| Nombre de la parroquia | El literal de la base del cliente (`Base_Consolidada_Concejales_Vocales_2004_2023.sav`); si la parroquia no está en ella, el del registro 2027 |
| Electores | El padrón 2027 de la parroquia (la suma de sus recintos en el distributivo) |
| % ausentismo, nulos y blancos de partida | Los de **vocales 2023** en esa misma parroquia, nunca los de otra dignidad. Como en concejales: el ausentismo sobre el padrón y los nulos y blancos sobre los votos emitidos |

En 2027 se eligen **4.126 vocales**: 821 juntas de 5 y tres de 7 (Calderón,
Conocoto y Tumbaco, en Quito). En 2023 fueron 4.109 en 821 parroquias.

`data/vocales.json` trae las 821 parroquias de 2023 con sus nombres y
códigos exactos, sus votos y sus vocales. Se genera desde la base del
cliente:

```bash
pip install numpy pandas
python preparar_vocales.py RUTA/Base_Consolidada_Concejales_Vocales_2004_2023.sav
```

Lee el `.sav` directamente (no necesita `pyreadstat`), toma solo las filas de
2023 de *VOCALES DE JUNTA PARROQUIAL* y comprueba, antes de escribir nada,
que no haya votos vacíos ni negativos, organizaciones repetidas en una junta,
nombres distintos para un mismo código ni parroquias duplicadas, y que el
total dé 821 parroquias y 4.109 vocales.

### Lo que no cuadra se dice, no se inventa

| Caso | Qué pasa |
|---|---|
| TUMBACO (Quito) | Eligió 5 vocales en 2023 y el registro 2027 trae 7 candidatos por lista: se simulan 7. La ficha lo explica. |
| JUAN MONTALVO (Cayambe), LA MAGDALENA y LA PRIMAVERA (Shushufindi), SHUAR PASTAZA (Pastaza), SOSOTE (Rocafuerte) | Tienen listas para 2027, pero no están en la base de 2023: llevan el nombre del registro y no tienen participación de partida (se escriben el ausentismo, los nulos y los blancos). |
| SHUAR PASTAZA | Además, la capa parroquial no tiene su polígono: se puede simular, pero no se dibuja y su padrón hay que escribirlo. |
| BORBON (Eloy Alfaro) y SEVILLA DON BOSCO (Morona) | Están en la base de 2023, pero no tienen listas inscritas para 2027: no aparecen para simular. |
| MULTI /  NULTI (Cuenca) | La base la escribe con dos espacios y el registro con uno: se usa el de la base, tal cual. |
| Sufragantes de 2023 | En 379 parroquias de la base oficial los sufragantes no coinciden con válidos + nulos + blancos (817 votos en total). Se conservan las cifras como vienen y, como en concejales, se usa válidos + nulos + blancos. |

### Separado de concejales

El simulador de vocales es una copia del de concejales
(`asignacion/simulador_vocales.html`) que guarda su borrador y sus escenarios
en claves propias (`simuladorEscanos.v1.borrador.vocales`,
`simuladorEscanos.v1.escenarios.vocales`): nunca lee, escribe ni borra lo de
concejales, que conserva sus claves de siempre. La sección tampoco cambia el
territorio de las demás: al volver a Asignación-Escaños, concejales está en el
mismo distrito, con los mismos porcentajes y el simulador sin recargar.

### Dónde vive

```
js/vocales.js                       selección, mapa, participación, listas y puente con el simulador
asignacion/simulador_vocales.html   copia del simulador, con claves de almacenamiento propias
css/vocales.css                     estilos de la sección (solo #vista-vocales)
data/vocales.json                   vocales 2023 por parroquia (nombres, códigos, votos, vocales)
preparar_vocales.py                 genera vocales.json desde la base .sav del cliente
```

`compilar_usuario.py` también recorta `vocales.json` al territorio de cada
carpeta y, si el territorio no tiene parroquias rurales que elijan vocales
(Jaramijó), quita la pestaña Vocales-Escaños de esa carpeta.

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

**El botón «Descargar reporte PDF» está gris.**
El escenario todavía no se puede calcular. Lo más común es que falten los
porcentajes de las listas en la tabla de cocientes: en cuanto el simulador
muestra un resultado, el botón se activa.

**En Vocales-Escaños no aparece una parroquia.**
Solo salen las parroquias rurales con listas inscritas para vocales en 2027.
BORBON (Eloy Alfaro) y SEVILLA DON BOSCO (Morona), por ejemplo, votaron en
2023 pero no tienen listas en el registro (§6b-3).

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

La v6.0 se verificó además con dos baterías nuevas: el reporte PDF en siete
escenarios más el de *Nuevo* (67 comprobaciones, con las cifras del PDF
contra las del motor y la pantalla) y Vocales-Escaños recorriendo las 824
parroquias (46 comprobaciones). Otra prueba deja una simulación de concejales a
medias, cambia de cantón dentro de Vocales-Escaños y vuelve: concejales tiene
que seguir exactamente igual (distrito, porcentajes, simulador sin recargar y
colores).

Las capas de `data/` se derivaron de las tres que entregaste: se reproyectó la
parroquial de UTM 17S a WGS84, se corrigió un problema de codificación en
*Logroño*, se simplificaron las geometrías a 200 m conservando la topología, y
las capas cantonal y provincial se generaron **disolviendo** la parroquial, de
modo que los límites de los tres niveles encajan exactamente entre sí. El
tamaño total pasó de 312 MB a 2,9 MB sin pérdida visible al zoom de trabajo.
