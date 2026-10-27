// Itinerario de prácticas. En la Fase 1 están desarrolladas la 1 y la 2;
// el resto aparece en el índice con la fase en que se incorporará.
import { C, TEST_MS, findNodes } from './checks.js';

/** Esquema eléctrico: pin → resistencia 220 Ω → LED → GND. */
export function esquemaLed(pin = 13) {
  return `<svg viewBox="0 0 360 150" role="img" aria-label="Esquema: pin ${pin} de Arduino, resistencia de 220 ohmios, LED y GND" class="schem">
  <rect x="10" y="30" width="78" height="90" rx="6" class="sc-box"/>
  <text x="49" y="22" text-anchor="middle" class="sc-t">Arduino UNO</text>
  <text x="80" y="58" text-anchor="end" class="sc-in">D${pin}</text>
  <text x="80" y="112" text-anchor="end" class="sc-in">GND</text>
  <path d="M88 54 H130" class="sc-w sig"/>
  <path d="M130 54 l6 -8 l10 16 l10 -16 l10 16 l10 -16 l10 16 l6 -8" class="sc-w"/>
  <text x="161" y="38" text-anchor="middle" class="sc-l">R = 220 Ω</text>
  <path d="M192 54 H250 V66" class="sc-w"/>
  <path d="M238 66 H262 L250 86 Z" class="sc-led"/>
  <path d="M238 86 H262" class="sc-w"/>
  <path d="M266 70 l10 -8 M272 62 h4 v4 M270 80 l10 -8 M276 72 h4 v4" class="sc-w thin"/>
  <text x="282" y="84" class="sc-l">LED</text>
  <text x="232" y="74" text-anchor="end" class="sc-s">ánodo (+)</text>
  <text x="232" y="94" text-anchor="end" class="sc-s">cátodo (−)</text>
  <path d="M250 86 V108 H88" class="sc-w gnd"/>
</svg>`;
}

const P1_INICIAL = `// Práctica 1 · LED
// Completa el programa para que el LED conectado al pin 13 se encienda.

void setup() {
  // Configura aquí el pin 13 como salida

}

void loop() {
  // Enciende el LED

}
`;

const P1_DEPURACION = `// Práctica 1 · Depuración
// Este programa debería encender el LED del pin 13, pero tiene 4 errores.
// Compila, lee cada mensaje y corrige los errores uno a uno.

void setup() {
  pinmode(13, OUPUT)
}

void loop() {
  digitalWrite(13, high);
}
`;

const P2_INICIAL = `// Práctica 2 · Intermitencia
// El LED del pin 13 debe parpadear: 1 s encendido y 1 s apagado.

void setup() {
  pinMode(13, OUTPUT);
}

void loop() {
  digitalWrite(13, HIGH);
  // ¿Qué falta aquí?

}
`;

const P2_DEPURACION = `// Práctica 2 · Depuración
// Debería parpadear: 0,5 s encendido y 0,5 s apagado.
// Sin embargo, el LED parece encendido todo el tiempo.
// El programa compila, así que el error es de lógica.
// Ejecútalo y observa el cronograma del monitor para descubrir qué ocurre.

int tiempo = 500;

void setup() {
  pinMode(13, OUTPUT);
}

void loop() {
  digitalWrite(13, HIGH);
  delay(tiempo);
  digitalWrite(13, LOW);
}
`;

export const PRACTICAS = [
  {
    id: 'p1', num: 1, titulo: 'LED', subtitulo: 'Configuración y control de salidas digitales', nivel: 1, fase: 1, disponible: true,
    ledPin: 13,
    objetivos: [
      'Reconocer la estructura de un programa de Arduino: setup() y loop().',
      'Configurar un pin digital como salida con pinMode().',
      'Fijar el nivel de una salida con digitalWrite(): HIGH (5 V) o LOW (0 V).',
      'Justificar el valor de la resistencia que protege el LED.',
    ],
    teoria: `
<p>Un programa de Arduino tiene siempre dos funciones:</p>
<ul>
  <li><code>setup()</code> se ejecuta <b>una sola vez</b> al arrancar o al pulsar RESET. Sirve para configurar.</li>
  <li><code>loop()</code> se ejecuta <b>una y otra vez</b> mientras la placa tenga alimentación.</li>
</ul>
<p>Los pines digitales 0-13 pueden funcionar como entrada o como salida. Tras el arranque todos son <b>entradas</b>, así que antes de usar uno como salida hay que configurarlo:</p>
<pre class="code">pinMode(13, OUTPUT);      // pin 13 como salida
digitalWrite(13, HIGH);   // 5 V en el pin 13
digitalWrite(13, LOW);    // 0 V en el pin 13</pre>
<p><b>¿Por qué una resistencia?</b> Un LED rojo necesita unos 2 V entre sus terminales. Si se conectara directamente a 5 V, la corriente solo quedaría limitada por la resistencia interna del pin y podría dañar el LED y el microcontrolador. Con una resistencia de 220 Ω en serie:</p>
<p class="formula">I = (V<sub>pin</sub> − V<sub>LED</sub>) / R = (5 V − 2 V) / 220 Ω ≈ 13,6 mA</p>
<p>Es una corriente segura: el fabricante del ATmega328P recomienda no superar unos 20 mA por pin (40 mA es el máximo absoluto).</p>
<p><b>Polaridad.</b> El LED es un diodo: solo conduce si el ánodo (+, patilla larga) está a mayor tensión que el cátodo (−, patilla corta, lado plano de la cápsula).</p>
<p class="note">El pin 13 también tiene conectado el LED «L» de la propia placa. La constante <code>LED_BUILTIN</code> vale 13.</p>`,
    enunciado: 'Completa el programa para que el pin 13 se configure como salida y el LED quede <b>encendido permanentemente</b>.',
    inicial: P1_INICIAL,
    criterios: [C.compiles(), C.wiredTo(13), C.outputInSetup(), C.alwaysOn(500, TEST_MS)],
    pistas: [
      'Lo que solo hay que hacer una vez, como configurar un pin, va dentro de setup(). La instrucción es pinMode(número de pin, modo).',
      'Para poner un pin a 5 V se usa digitalWrite(número de pin, HIGH).',
      'Revisa los detalles: cada instrucción termina en «;» y Arduino distingue mayúsculas de minúsculas (pinMode, OUTPUT, HIGH).',
    ],
    retos: [
      {
        id: 'r1', titulo: 'Encendido temporizado', nivel: 1,
        enunciado: 'El LED debe encenderse al arrancar, permanecer encendido <b>3 s</b> y apagarse después para siempre. Pista: puedes usar <code>delay(milisegundos)</code>.',
        criterios: [
          C.compiles(), C.wiredTo(13), C.outputInSetup(),
          {
            id: 'tres', text: 'Encendido desde el arranque durante 3 s (±1 %) y apagado después hasta el final de la prueba.',
            check: ctx => {
              if (!ctx.segs) return { pass: false, msg: 'No se puede comprobar hasta que el programa funcione sin errores.' };
              const ons = ctx.segs.filter(s => s.on);
              if (!ons.length) return { pass: false, msg: 'El LED no se enciende.' };
              if (ons.length > 1) return { pass: false, msg: `El LED se enciende ${ons.length} veces. ¿Está el código dentro de loop()? Recuerda que loop() se repite.` };
              const on = ons[0];
              if (on.from > 50) return { pass: false, msg: `El LED tarda ${Math.round(on.from)} ms en encenderse; debe hacerlo al arrancar.` };
              if (on.open) return { pass: false, msg: 'El LED no llega a apagarse.' };
              const d = on.to - on.from;
              if (Math.abs(d - 3000) > 30) return { pass: false, msg: `El LED está encendido ${Math.round(d)} ms; se esperaban 3000 ms.` };
              return { pass: true };
            },
          },
        ],
      },
      {
        id: 'r2', titulo: 'Cambio de pin con una constante', nivel: 2,
        enunciado: 'Conecta el LED al <b>pin 8</b> (selector «LED conectado a» de la zona de montaje). Después modifica el programa usando una constante, <code>const int LED = 8;</code>, de forma que para cambiar de pin baste con editar <b>una sola línea</b>.',
        criterios: [
          C.compiles(), C.wiredTo(8), C.outputInSetup(), C.alwaysOn(500, TEST_MS),
          {
            id: 'const', text: 'pinMode() y digitalWrite() usan una constante global en lugar del número 8.',
            check: ctx => {
              if (!ctx.res.ok) return { pass: false, msg: 'Primero corrige los errores de compilación.' };
              const prog = ctx.res.machine.program;
              const consts = new Set(prog.globals.filter(g => g.isConst).flatMap(g => g.decls.map(d => d.name)));
              if (!consts.size) return { pass: false, msg: 'No hay ninguna constante global (const int …) en el programa.' };
              const calls = findNodes(prog, n => n.kind === 'call' && (n.name === 'pinMode' || n.name === 'digitalWrite'));
              const literal = calls.find(c => c.args[0] && c.args[0].kind !== 'id');
              if (literal) return { pass: false, msg: `En la línea ${literal.pos.line}, ${literal.name}() sigue usando un número de pin.` };
              const other = calls.find(c => !consts.has(c.args[0].name));
              if (other) return { pass: false, msg: `En la línea ${other.pos.line}, «${other.args[0].name}» no es una constante.` };
              return { pass: true };
            },
          },
        ],
      },
    ],
    depuracion: {
      enunciado: 'Carga el programa con errores y corrígelo. Tiene <b>4 errores</b>. El compilador muestra primero el que encuentra antes; al corregirlo aparecerá el siguiente.',
      codigo: P1_DEPURACION,
      criterios: [C.compiles(), C.wiredTo(13), C.outputInSetup(), C.alwaysOn(500, TEST_MS)],
    },
  },
  {
    id: 'p2', num: 2, titulo: 'Intermitencia', subtitulo: 'Secuencias temporizadas mediante delay()', nivel: 1, fase: 1, disponible: true,
    ledPin: 13,
    objetivos: [
      'Comprender que loop() se repite indefinidamente.',
      'Temporizar con delay() en milisegundos.',
      'Calcular periodo, frecuencia y ciclo de trabajo de una señal.',
      'Verificar los tiempos con el cronograma (analizador lógico).',
    ],
    teoria: `
<p><code>delay(ms)</code> detiene el programa durante el número de <b>milisegundos</b> indicado: <code>delay(1000)</code> espera 1 s. Mientras dura, el microcontrolador no ejecuta ninguna otra instrucción de tu programa (es una espera <b>bloqueante</b>).</p>
<p>Como <code>loop()</code> se repite, una secuencia «encender, esperar, apagar, esperar» produce una señal periódica:</p>
<pre class="code">void loop() {
  digitalWrite(13, HIGH);
  delay(t_on);
  digitalWrite(13, LOW);
  delay(t_off);
}</pre>
<ul>
  <li><b>Periodo</b>: T = t<sub>on</sub> + t<sub>off</sub></li>
  <li><b>Frecuencia</b>: f = 1 / T (en hercios, Hz, si T está en segundos)</li>
  <li><b>Ciclo de trabajo</b>: D = t<sub>on</sub> / T · 100 %</li>
</ul>
<p class="formula">Ejemplo: t<sub>on</sub> = 250 ms, t<sub>off</sub> = 750 ms → T = 1 s; f = 1 Hz; D = 25 %</p>
<p>El monitor de la derecha incluye un <b>cronograma</b> que dibuja el nivel del pin frente al tiempo, como un analizador lógico. Úsalo para medir los tiempos reales de tu programa.</p>
<p class="note">Cada instrucción también tarda un poco: un <code>digitalWrite()</code> necesita unos 3,6 µs en un UNO real. El simulador lo tiene en cuenta de forma aproximada, por eso las medidas pueden diferir unos microsegundos del valor de delay().</p>`,
    enunciado: 'Haz que el LED del pin 13 parpadee: <b>1 s encendido y 1 s apagado</b>. Calcula el periodo, la frecuencia y el ciclo de trabajo de la señal.',
    inicial: P2_INICIAL,
    criterios: [C.compiles(), C.wiredTo(13), C.outputInSetup(), ...C.blink(1000, 1000)],
    pistas: [
      'delay() recibe milisegundos: 1 s = 1000 ms.',
      'Después de encender hay que esperar, y después de apagar también. ¿Cuántos digitalWrite() y cuántos delay() necesitas?',
      'Si el LED parece encendido siempre, mira el cronograma: quizá el LED se apaga solo unos microsegundos porque falta un delay() tras digitalWrite(13, LOW).',
    ],
    retos: [
      {
        id: 'r1', titulo: 'Destello', nivel: 1,
        enunciado: 'Señal de baliza: <b>100 ms encendido y 900 ms apagado</b>. ¿Cuál es su frecuencia? ¿Y su ciclo de trabajo?',
        criterios: [C.compiles(), C.outputInSetup(), ...C.blink(100, 900)],
      },
      {
        id: 'r2', titulo: 'SOS en código Morse', nivel: 2,
        enunciado: `Transmite <b>SOS</b> (· · · − − − · · ·) de forma continua con estos tiempos:
<ul><li>punto: 200 ms encendido; raya: 600 ms encendido;</li>
<li>entre señales de una misma letra: 200 ms apagado;</li>
<li>entre letras: 600 ms apagado;</li>
<li>al terminar SOS, antes de repetir: 1400 ms apagado.</li></ul>
Organiza el código con funciones propias, por ejemplo <code>void punto()</code> y <code>void raya()</code>.`,
        criterios: [
          C.compiles(), C.outputInSetup(),
          C.pattern('sos', 'La secuencia de encendidos y apagados corresponde a SOS y se repite (±2 %).',
            [200, 200, 200, 600, 600, 600, 200, 200, 200],
            [200, 200, 600, 200, 200, 600, 200, 200, 1400]),
        ],
      },
      {
        id: 'r3', titulo: 'Ráfagas con un bucle for', nivel: 2,
        enunciado: 'Usando un bucle <code>for</code>, el LED debe dar una <b>ráfaga de 5 destellos</b> (150 ms encendido y 150 ms apagado cada uno) y después hacer una <b>pausa de 2 s</b> antes de repetir. Tras el último destello el LED quedará apagado 150 ms + 2000 ms = 2150 ms.',
        criterios: [
          C.compiles(), C.outputInSetup(), C.usesFor(),
          C.pattern('rafaga', 'Cinco destellos de 150 ms separados 150 ms y una pausa total de 2150 ms (±2 %).',
            [150, 150, 150, 150, 150], [150, 150, 150, 150, 2150]),
        ],
      },
    ],
    depuracion: {
      enunciado: 'Este programa compila, pero no hace lo que debería: el LED tendría que parpadear <b>0,5 s encendido y 0,5 s apagado</b>. Ejecútalo, observa el cronograma y corrige el error de lógica.',
      codigo: P2_DEPURACION,
      criterios: [C.compiles(), C.outputInSetup(), ...C.blink(500, 500)],
    },
  },
  { id: 'p3', num: 3, titulo: 'Semáforo', subtitulo: 'Programación de varias salidas', nivel: 1, fase: 2 },
  { id: 'p4', num: 4, titulo: 'Pulsadores', subtitulo: 'Entradas digitales y condicionales', nivel: 1, fase: 2 },
  { id: 'p5', num: 5, titulo: 'PWM', subtitulo: 'Regulación de luminosidad', nivel: 2, fase: 3 },
  { id: 'p6', num: 6, titulo: 'Potenciómetro', subtitulo: 'Lectura de entradas analógicas', nivel: 2, fase: 3 },
  { id: 'p7', num: 7, titulo: 'Contadores', subtitulo: 'Variables, pulsadores y detección de flancos', nivel: 2, fase: 3 },
  { id: 'p8', num: 8, titulo: 'Temporización avanzada', subtitulo: 'Programación no bloqueante con millis()', nivel: 2, fase: 3 },
  { id: 'p9', num: 9, titulo: 'Display de siete segmentos', subtitulo: 'Arrays, funciones y control de salidas', nivel: 3, fase: 3 },
  { id: 'p10', num: 10, titulo: 'Monitor serie', subtitulo: 'Comunicación, depuración y visualización de datos', nivel: 3, fase: 2 },
];

export const NIVELES = {
  1: 'Nivel 1 · Programación dirigida',
  2: 'Nivel 2 · Resolución de problemas',
  3: 'Nivel 3 · Proyecto autónomo',
};
