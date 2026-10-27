// Ejecución sin interfaz, a máxima velocidad, para comprobar las prácticas y para las pruebas automáticas.
import { compile } from './compiler.js';
import { Machine } from './interpreter.js';
import { Board } from '../model/board.js';

/**
 * Ejecuta el programa durante `durationMs` de tiempo simulado.
 * Trocea el trabajo con setTimeout para no bloquear el navegador.
 * Si el programa es tan lento de simular que supera `maxRealMs`, se detiene (timedOut).
 * @returns {Promise<{ok:boolean, diagnostics:Array, runtimeError:object|null, warnings:Array, board:Board, machine:Machine|null, timedOut:boolean}>}
 */
export async function runHeadless(src, durationMs, { maxRealMs = 8000 } = {}) {
  const { ok, program, diagnostics } = compile(src);
  const board = new Board();
  if (!ok) return { ok: false, diagnostics, runtimeError: null, warnings: [], board, machine: null, timedOut: false };
  const warnings = [];
  const machine = new Machine(program, board, { onWarning: w => warnings.push(w) });
  const t0 = Date.now();
  for (;;) {
    const st = machine.advance(durationMs, 40);
    if (st === 'error') return { ok: true, diagnostics, runtimeError: machine.error, warnings, board, machine, timedOut: false };
    if (st === 'done' || machine.time >= durationMs || st === 'sleeping') break;
    if (Date.now() - t0 > maxRealMs) return { ok: true, diagnostics, runtimeError: null, warnings, board, machine, timedOut: true };
    await new Promise(r => setTimeout(r, 0));
  }
  return { ok: true, diagnostics, runtimeError: null, warnings, board, machine, timedOut: false };
}
