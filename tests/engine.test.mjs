import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../js/engine/compiler.js';
import { runHeadless } from '../js/engine/headless.js';

const errors = src => compile(src).diagnostics.filter(d => d.severity === 'error');
const wrap = body => `void setup() {\n${body}\n}\nvoid loop() {}\n`;

/** Ejecuta y devuelve el estado del pin 13 y los avisos. */
async function pin13(src, ms = 100) {
  const r = await runHeadless(src, ms);
  return { r, out: r.board.pins[13].latch && r.board.pins[13].mode === 'OUTPUT' };
}

test('loop() se repite y delay() respeta el tiempo simulado', async () => {
  const r = await runHeadless('void setup(){ pinMode(13, OUTPUT); }\nvoid loop(){ digitalWrite(13, HIGH); delay(250); digitalWrite(13, LOW); delay(250); }', 2000);
  assert.equal(r.machine.loopCount, 3); // la 4.ª vuelta termina justo después de 2000 ms
  const highs = r.board.byPin[13].filter(e => e.drive === 'high').map(e => e.t);
  assert.equal(highs.length, 4);
  for (let i = 1; i < highs.length; i++) assert.ok(Math.abs(highs[i] - highs[i - 1] - 500) < 0.05);
});

test('un bucle sin pausas no bloquea: la ejecución se trocea', async () => {
  const r = await runHeadless('void setup(){}\nvoid loop(){ while (true) { } }', 10, { maxRealMs: 300 });
  assert.ok(r.timedOut || r.machine.time >= 10);
});

test('int es de 16 bits como en el UNO', async () => {
  const { out } = await pin13(wrap('pinMode(13, OUTPUT);\nint x = 32767;\nx++;\nunsigned long u = 1000 * 60;\nlong w = 1000L * 60;\nif (x == -32768 && u == 4294961760UL && w == 60000) digitalWrite(13, HIGH);'));
  assert.ok(out);
});

test('división entera, resto, float y conversiones', async () => {
  const { out } = await pin13(wrap('pinMode(13, OUTPUT);\nint a = 7 / 2;\nint b = -7 % 3;\nfloat f = 7 / 2.0;\nint c = (int) 3.9;\nbyte d = 300;\nif (a == 3 && b == -1 && f == 3.5 && c == 3 && d == 44) digitalWrite(13, HIGH);'));
  assert.ok(out);
});

test('funciones propias, recursión, for, while, do-while, break, continue, ?:', async () => {
  const src = `int fact(int n) { return n <= 1 ? 1 : n * fact(n - 1); }
int suma(int n) { int s = 0; for (int i = 1; i <= n; i++) { if (i % 2) continue; s += i; } return s; }
void setup() {
  pinMode(13, OUTPUT);
  int k = 0; while (true) { k++; if (k == 5) break; }
  int j = 10; do { j--; } while (j > 3);
  if (fact(5) == 120 && suma(10) == 30 && k == 5 && j == 3) digitalWrite(13, HIGH);
}
void loop() {}`;
  assert.ok((await pin13(src)).out);
});

test('#define y LED_BUILTIN', async () => {
  assert.ok((await pin13('#define LED LED_BUILTIN\nvoid setup(){ pinMode(LED, OUTPUT); digitalWrite(LED, HIGH); }\nvoid loop(){}')).out);
});

test('mensajes de error claros', () => {
  assert.match(errors(wrap('pinMode(13, OUTPUT)\ndigitalWrite(13, HIGH);'))[0].message, /Falta el punto y coma/);
  assert.match(errors(wrap('pinmode(13, OUTPUT);'))[0].hint, /pinMode/);
  assert.match(errors(wrap('pinMode(13, OUPUT);'))[0].hint, /OUTPUT/);
  assert.match(errors('void setup(){}\n')[0].message, /Falta la función loop/);
  assert.match(errors(wrap('analogWrite(3, 100);'))[0].message, /Fase 3/);
  assert.match(errors(wrap('Serial.begin(9600);'))[0].message, /Fase 2/);
  assert.match(errors(wrap('int v[3];'))[0].message, /arrays/);
  assert.match(errors(wrap('pinMode(20, OUTPUT);'))[0].message, /no existe/);
  assert.match(errors(wrap('const int A = 1;\nA = 2;'))[0].message, /constante/);
  assert.match(errors('void setup() {\n  pinMode(13, OUTPUT);\nvoid loop() {}\n')[0].message, /Falta la llave/);
  assert.match(errors(wrap('x = 3;'))[0].message, /no está declarada/);
  assert.match(errors(wrap('switch (1) { }'))[0].message, /switch/);
});

test('avisos útiles', () => {
  const w = src => compile(src).diagnostics.filter(d => d.severity === 'warning').map(d => d.message).join('\n');
  assert.match(w(wrap('int x = 40000;')), /no cabe/);
  assert.match(w(wrap('int x = 0;\nif (x = 1) {}')), /asignación/);
  assert.match(w(wrap('int x = 0;\nif (x == 1);')), /;/);
  assert.match(w(wrap('pinMode(13, HIGH);')), /modo/);
});

test('errores en ejecución: recursión infinita y división entre cero', async () => {
  let r = await runHeadless('int f(int n){ return f(n + 1); }\nvoid setup(){ f(0); }\nvoid loop(){}', 10);
  assert.match(r.runtimeError.message, /desbordamiento de pila/);
  r = await runHeadless('void setup(){ int z = 0; int y = 5 / z; }\nvoid loop(){}', 10);
  assert.match(r.runtimeError.message, /División entre cero/);
  assert.equal(r.runtimeError.pos.line, 1);
});

test('aviso al escribir en un pin sin pinMode', async () => {
  const r = await runHeadless('void setup(){ digitalWrite(13, HIGH); }\nvoid loop(){}', 10);
  assert.match(r.warnings[0].message, /pinMode\(13, OUTPUT\)/);
  assert.equal(r.board.electrical(13).drive, 'pullup');
});
