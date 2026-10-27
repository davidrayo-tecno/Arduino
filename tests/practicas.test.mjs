// Comprueba que las soluciones de referencia cumplen los criterios
// y que los programas incorrectos típicos no los cumplen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRACTICAS } from '../js/activities/practicas.js';
import { evaluate } from '../js/activities/checks.js';

const P = Object.fromEntries(PRACTICAS.map(p => [p.id, p]));

async function run(code, criterios, pin = 13) {
  const ctx = await evaluate(code, pin);
  return criterios.map(c => ({ id: c.id, ...c.check(ctx) }));
}
const allPass = rs => rs.every(r => r.pass);
const failing = rs => rs.filter(r => !r.pass).map(r => r.id);

const P1_OK = `void setup() {\n  pinMode(13, OUTPUT);\n}\nvoid loop() {\n  digitalWrite(13, HIGH);\n}\n`;
const BLINK = (on, off) => `void setup() { pinMode(13, OUTPUT); }\nvoid loop() {\n  digitalWrite(13, HIGH);\n  delay(${on});\n  digitalWrite(13, LOW);\n  delay(${off});\n}\n`;

test('Práctica 1: solución correcta', async () => {
  assert.ok(allPass(await run(P1_OK, P.p1.criterios)));
});

test('Práctica 1: sin pinMode el LED apenas brilla', async () => {
  const rs = await run('void setup() {}\nvoid loop() { digitalWrite(13, HIGH); }', P.p1.criterios);
  assert.deepEqual(failing(rs), ['salida', 'encendido']);
  assert.match(rs.find(r => r.id === 'encendido').msg, /pull-up/);
});

test('Práctica 1: el código inicial no cumple y el de depuración no compila', async () => {
  assert.ok(!allPass(await run(P.p1.inicial, P.p1.criterios)));
  const rs = await run(P.p1.depuracion.codigo, P.p1.depuracion.criterios);
  assert.equal(rs.find(r => r.id === 'compila').pass, false);
});

test('Práctica 1, reto 1: encendido 3 s', async () => {
  const code = 'void setup() {\n  pinMode(13, OUTPUT);\n  digitalWrite(13, HIGH);\n  delay(3000);\n  digitalWrite(13, LOW);\n}\nvoid loop() {}\n';
  assert.ok(allPass(await run(code, P.p1.retos[0].criterios)));
  const enLoop = 'void setup() { pinMode(13, OUTPUT); }\nvoid loop() {\n  digitalWrite(13, HIGH);\n  delay(3000);\n  digitalWrite(13, LOW);\n}\n';
  assert.ok(!allPass(await run(enLoop, P.p1.retos[0].criterios)));
});

test('Práctica 1, reto 2: constante y pin 8', async () => {
  const code = 'const int LED = 8;\nvoid setup() { pinMode(LED, OUTPUT); }\nvoid loop() { digitalWrite(LED, HIGH); }\n';
  assert.ok(allPass(await run(code, P.p1.retos[1].criterios, 8)));
  assert.deepEqual(failing(await run(code, P.p1.retos[1].criterios, 13)), ['montaje8', 'salida', 'encendido']);
  const literal = 'const int LED = 8;\nvoid setup() { pinMode(8, OUTPUT); }\nvoid loop() { digitalWrite(LED, HIGH); }\n';
  assert.deepEqual(failing(await run(literal, P.p1.retos[1].criterios, 8)), ['const']);
});

test('Práctica 2: parpadeo 1 s / 1 s', async () => {
  assert.ok(allPass(await run(BLINK(1000, 1000), P.p2.criterios)));
  const rs = await run(BLINK(1000, 500), P.p2.criterios);
  assert.deepEqual(failing(rs), ['toff']);
  assert.match(rs.find(r => r.id === 'toff').msg, /mitad/);
  const seg = await run(BLINK(1, 1), P.p2.criterios);
  assert.match(seg.find(r => r.id === 'ton').msg, /milisegundos/);
});

test('Práctica 2: depuración (falta delay tras LOW)', async () => {
  const rs = await run(P.p2.depuracion.codigo, P.p2.depuracion.criterios);
  assert.deepEqual(failing(rs), ['toff']);
  assert.match(rs.find(r => r.id === 'toff').msg, /falta un delay/);
  assert.ok(allPass(await run(BLINK(500, 500), P.p2.depuracion.criterios)));
});

test('Práctica 2, reto SOS con funciones', async () => {
  const code = `void senal(int t) {\n  digitalWrite(13, HIGH);\n  delay(t);\n  digitalWrite(13, LOW);\n  delay(200);\n}\nvoid punto() { senal(200); }\nvoid raya() { senal(600); }\nvoid setup() { pinMode(13, OUTPUT); }\nvoid loop() {\n  for (int i = 0; i < 3; i++) punto();\n  delay(400);\n  for (int i = 0; i < 3; i++) raya();\n  delay(400);\n  for (int i = 0; i < 3; i++) punto();\n  delay(1200);\n}\n`;
  assert.ok(allPass(await run(code, P.p2.retos[1].criterios)));
  assert.ok(!allPass(await run(code.replace('delay(1200)', 'delay(400)'), P.p2.retos[1].criterios)));
});

test('Práctica 2, reto ráfagas con for', async () => {
  const code = `void setup() { pinMode(13, OUTPUT); }\nvoid loop() {\n  for (int i = 0; i < 5; i++) {\n    digitalWrite(13, HIGH);\n    delay(150);\n    digitalWrite(13, LOW);\n    delay(150);\n  }\n  delay(2000);\n}\n`;
  assert.ok(allPass(await run(code, P.p2.retos[2].criterios)));
  const sinFor = BLINK(150, 150);
  assert.ok(!allPass(await run(sinFor, P.p2.retos[2].criterios)));
});
