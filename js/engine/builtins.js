// Funciones y constantes del lenguaje Arduino que reconoce el simulador.
// Cada entrada indica en qué fase del proyecto está (o estará) disponible.

/** Constantes predefinidas de Arduino UNO. */
export const CONSTANTS = {
  HIGH: { v: 1, t: 'int' }, LOW: { v: 0, t: 'int' },
  INPUT: { v: 0, t: 'int' }, OUTPUT: { v: 1, t: 'int' }, INPUT_PULLUP: { v: 2, t: 'int' },
  LED_BUILTIN: { v: 13, t: 'int' },
  A0: { v: 14, t: 'int' }, A1: { v: 15, t: 'int' }, A2: { v: 16, t: 'int' }, A3: { v: 17, t: 'int' }, A4: { v: 18, t: 'int' }, A5: { v: 19, t: 'int' },
};

/**
 * Funciones disponibles. args: [mínimo, máximo] de argumentos. ret: tipo devuelto.
 * phase: fase del simulador en la que se implementa. Las de fase > CURRENT_PHASE se reconocen,
 * pero producen un mensaje claro de «todavía no disponible».
 */
export const BUILTINS = {
  pinMode:            { args: [2, 2], ret: 'void', phase: 1, sig: 'pinMode(pin, modo)' },
  digitalWrite:       { args: [2, 2], ret: 'void', phase: 1, sig: 'digitalWrite(pin, valor)' },
  delay:              { args: [1, 1], ret: 'void', phase: 1, sig: 'delay(milisegundos)', yields: true },
  delayMicroseconds:  { args: [1, 1], ret: 'void', phase: 1, sig: 'delayMicroseconds(microsegundos)', yields: true },

  digitalRead:        { args: [1, 1], ret: 'int', phase: 2, sig: 'digitalRead(pin)' },
  'Serial.begin':     { args: [1, 2], ret: 'void', phase: 2, sig: 'Serial.begin(velocidad)' },
  'Serial.print':     { args: [1, 2], ret: 'int', phase: 2, sig: 'Serial.print(valor)' },
  'Serial.println':   { args: [0, 2], ret: 'int', phase: 2, sig: 'Serial.println(valor)' },
  'Serial.available': { args: [0, 0], ret: 'int', phase: 2, sig: 'Serial.available()' },
  'Serial.read':      { args: [0, 0], ret: 'int', phase: 2, sig: 'Serial.read()' },
  'Serial.write':     { args: [1, 1], ret: 'int', phase: 2, sig: 'Serial.write(byte)' },

  analogRead:         { args: [1, 1], ret: 'int', phase: 3, sig: 'analogRead(pin)' },
  analogWrite:        { args: [2, 2], ret: 'void', phase: 3, sig: 'analogWrite(pin, valor)' },
  millis:             { args: [0, 0], ret: 'unsigned long', phase: 3, sig: 'millis()' },
  micros:             { args: [0, 0], ret: 'unsigned long', phase: 3, sig: 'micros()' },
  map:                { args: [5, 5], ret: 'long', phase: 3, sig: 'map(valor, deMin, deMax, aMin, aMax)' },
  constrain:          { args: [3, 3], ret: 'long', phase: 3, sig: 'constrain(x, min, max)' },
  min:                { args: [2, 2], ret: 'long', phase: 3, sig: 'min(a, b)' },
  max:                { args: [2, 2], ret: 'long', phase: 3, sig: 'max(a, b)' },
  abs:                { args: [1, 1], ret: 'long', phase: 3, sig: 'abs(x)' },
  random:             { args: [1, 2], ret: 'long', phase: 3, sig: 'random(max) o random(min, max)' },
  randomSeed:         { args: [1, 1], ret: 'void', phase: 3, sig: 'randomSeed(semilla)' },
  tone:               { args: [2, 3], ret: 'void', phase: 4, sig: 'tone(pin, frecuencia)' },
  noTone:             { args: [1, 1], ret: 'void', phase: 4, sig: 'noTone(pin)' },
  pulseIn:            { args: [2, 3], ret: 'unsigned long', phase: 4, sig: 'pulseIn(pin, valor)' },
  shiftOut:           { args: [4, 4], ret: 'void', phase: 4, sig: 'shiftOut(...)' },
  attachInterrupt:    { args: [3, 3], ret: 'void', phase: 4, sig: 'attachInterrupt(...)' },
};

/** Fase implementada en esta versión del simulador. */
export const CURRENT_PHASE = 1;

export const PHASE_NAMES = {
  2: 'Fase 2 (pulsadores, entradas digitales y monitor serie)',
  3: 'Fase 3 (entradas analógicas, PWM, millis() y funciones matemáticas)',
  4: 'Fase 4 (montaje libre y proyectos)',
};

/** Coste aproximado en milisegundos simulados (ATmega328P a 16 MHz). */
export const COST = {
  statement: 0.0005,     // ~0,5 µs por instrucción sencilla
  call: 0.001,           // llamada a función propia
  loopOverhead: 0.001,   // vuelta de loop()
  digitalWrite: 0.0036,  // ~3,6 µs medidos en un UNO real
  pinMode: 0.004,
};
