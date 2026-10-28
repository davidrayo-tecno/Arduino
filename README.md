# Arduino Lab · IES Palomares

Simulador educativo de **Arduino UNO R3**. El alumnado escribe código C/C++ real (un subconjunto documentado) y el circuito responde a ese código; no hay animaciones preprogramadas.

Autor: David Rayo Torres · IES Palomares

**Abrir la aplicación:** https://davidrayo-tecno.github.io/Arduino/

> Versión de prueba: **Fase 1**.

## Qué incluye la Fase 1

| Área | Contenido |
|---|---|
| **A. Montaje** | Placa UNO R3 dibujada con todos sus conectores: pines digitales 0-13 (los PWM 3, 5, 6, 9, 10 y 11 marcados con ~), A0-A5, GND, 5 V, 3,3 V, Vin, IOREF, RESET y AREF. Protoboard con un LED rojo y una resistencia de 220 Ω. El LED puede conectarse a cualquier pin del 2 al 13. Los pines cambian de color según su estado y muestran su información al pasar el ratón o al enfocarlos con el teclado. El LED «L» de la placa sigue al pin 13. |
| **B. Editor** | Resaltado de sintaxis, números de línea, sangría automática y marcas de error y aviso en la línea afectada. Muestra la línea que se está ejecutando. Botones Compilar, Ejecutar, Detener y Reiniciar (como el botón RESET de la placa) y selector de velocidad (× 0,1 a × 5). |
| **C. Monitor** | Tiempo simulado, función en curso, vueltas de `loop()`, línea en ejecución y tiempo restante del `delay()`. Para el LED: modo, nivel, tensión, corriente y estado. Cronograma tipo analizador lógico con ventanas de 1 s a 20 s y tabla con el estado de los 20 pines. |
| **D. Actividades** | Prácticas 1 (LED) y 2 (Intermitencia), cada una con objetivos, explicación técnica, esquema, enunciado, código inicial, pistas progresivas, retos de nivel 1 y 2, una actividad de depuración y comprobación automática con criterios objetivos. Las prácticas 3-10 aparecen en el itinerario con la fase en que se incorporarán. |

Además:

- tema claro y oscuro;
- diseño adaptable a ordenador y tableta (en el móvil también funciona);
- guardado automático por práctica;
- programas guardados con nombre;
- descarga y apertura de archivos `.ino`;
- botón para restablecer el código inicial;
- referencia del lenguaje admitido.

### Lenguaje admitido

- **Funciones de Arduino:** `pinMode()`, `digitalWrite()`, `delay()` y `delayMicroseconds()`.
- **Constantes:** `HIGH`, `LOW`, `INPUT`, `OUTPUT`, `INPUT_PULLUP`, `LED_BUILTIN`, `A0`…`A5`, `true` y `false`.
- **Tipos:** con el tamaño real del UNO.
  - `int` y `unsigned int` (16 bits);
  - `long` y `unsigned long` (32 bits);
  - `byte`, `char` y `bool`/`boolean`;
  - `float`/`double` (32 bits);
  - `const`.
- **Operadores:**
  - aritméticos;
  - relacionales;
  - lógicos;
  - de bits;
  - asignaciones compuestas;
  - `++` y `--`;
  - `? :`;
  - conversiones `(int) x`.
- **Estructuras de control:** `if`/`else`, `for`, `while`, `do … while`, `break`, `continue` y `return`.
- **Funciones propias** con parámetros y valor de retorno, y `#define NOMBRE valor`.
- **Desbordamientos como en el UNO.** Por ejemplo, `int x = 32767; x++;` da −32768, y `unsigned long t = 1000 * 60;` da 4294961760.

### Mensajes del compilador

El compilador da mensajes en español con la línea afectada y una sugerencia. Algunos ejemplos:

- falta de `;` (señala el final de la línea correcta);
- mayúsculas mal escritas (`pinmode` → «¿Quisiste decir pinMode?»);
- variables sin declarar;
- llaves sin cerrar (indica dónde se abrió la función);
- números que no caben en `int`;
- `=` dentro de un `if`;
- `;` tras un `if`;
- pines inexistentes;
- falta de `setup()` o `loop()`.

### Errores durante la ejecución

Durante la ejecución también se detectan:

- la división entre cero;
- la recursión infinita;
- `digitalWrite()` sin `pinMode()` (el pin queda con la resistencia pull-up y el LED apenas brilla, como en la placa real);
- el uso de los pines 0 y 1.

## Cómo está hecho

Es una aplicación web estática: HTML, CSS y JavaScript con módulos ES. Funciona en GitHub Pages sin servidor y sin servicios de pago, y no necesita compilación ni dependencias externas.

```
index.html
css/app.css
js/
  engine/      motor de ejecución (independiente de la interfaz)
    lexer.js        análisis léxico y #define
    parser.js       análisis sintáctico → árbol del programa
    compiler.js     comprobaciones semánticas y mensajes
    interpreter.js  intérprete por tramos (no bloqueante)
    types.js        tipos del AVR (int de 16 bits…)
    builtins.js     funciones disponibles y fase de cada una
    headless.js     ejecución sin interfaz (comprobaciones y pruebas)
  model/       modelo electrónico
    board.js        estado y registro de los pines del UNO
    circuit.js      LED + resistencia (ley de Ohm)
  editor/      editor de código y resaltado
  ui/          vistas: placa, monitor y panel de actividades
  activities/  prácticas y criterios de comprobación
tests/         pruebas automáticas (node --test)
```

### Seguridad y fluidez

- **Sin `eval()`.** El código del alumnado nunca se ejecuta como JavaScript. Se analiza y un intérprete recorre el árbol del programa.
- **No bloquea el navegador.** El intérprete usa generadores y se detiene cada 1000 instrucciones; además, en cada fotograma solo trabaja unos 12 ms. Un `while (true) {}` no congela la página y «Detener» responde siempre.
- **El tiempo es simulado.** `delay()` se respeta exactamente en tiempo simulado. Cada instrucción suma un coste aproximado (≈ 0,5 µs) y `digitalWrite()` unos 3,6 µs, como en un UNO real. A velocidad × 1 el reloj simulado sigue al real.

### Pruebas

```
npm test        # o: node --test tests/*.test.mjs
```

Comprueban la semántica del intérprete y los mensajes de error. También verifican que las soluciones de referencia de cada práctica cumplen sus criterios y que los errores típicos no los cumplen.

Para probar la aplicación en local basta con un servidor estático, porque los módulos ES no funcionan abriendo el archivo directamente:

```
python3 -m http.server
```

y abrir http://localhost:8000.

## Limitaciones de esta versión

No se presenta como implementado nada que todavía no exista. Si el programa usa algo de esta lista, el compilador lo indica con un mensaje claro.

- **Fase 2:**
  - `digitalRead()` y pulsadores;
  - monitor serie (`Serial.begin/print/println`).
- **Fase 3:**
  - `analogRead()` y `analogWrite()` (PWM);
  - `millis()` y `micros()`;
  - `map()`, `constrain()`, `min()`, `max()`, `abs()` y `random()`;
  - arrays.
- **Fase 4:**
  - montaje libre de circuitos y validación de conexiones;
  - `tone()`;
  - proyectos autónomos.
- **No previsto:**
  - `switch`;
  - `String`;
  - punteros y referencias;
  - `struct` y clases;
  - bibliotecas (`#include` se ignora con un aviso);
  - macros con parámetros.

Otras limitaciones de la simulación:

- **Montaje fijo.** En la Fase 1 el circuito es siempre un LED con su resistencia; solo puede cambiarse el pin. El montaje libre llega en la Fase 4.
- **Modelo eléctrico simplificado.** Usa la ley de Ohm con valores típicos: un LED rojo de 2 V y una pull-up de unos 35 kΩ.
- **Tiempos aproximados.** Los costes de cada instrucción son aproximados. Los `delay()` son exactos, pero un programa sin pausas avanza en el tiempo simulado más despacio o más deprisa que en una placa real.
- **Variables locales sin valor inicial.** El simulador les da 0 y avisa; en un Arduino real su valor sería impredecible.
- **Guardado local.** Los programas guardados se quedan en el navegador de cada equipo. Para llevarlos a otro equipo hay que usar «Descargar .ino».
