// Herramientas para comprobar objetivamente el funcionamiento de un programa
// a partir del registro temporal de los pines (lo que «vería» un analizador lógico).
import { runHeadless } from '../engine/headless.js';

export const TEST_MS = 8000;

/**
 * Ejecuta el programa sin interfaz y prepara los datos para las comprobaciones.
 */
export async function evaluate(src, ledPin, durationMs = TEST_MS) {
  const res = await runHeadless(src, durationMs);
  const ctx = { res, ledPin, durationMs, src };
  if (res.ok && !res.runtimeError) Object.assign(ctx, ledTimeline(res.board, ledPin, Math.min(durationMs, res.machine.time)));
  return ctx;
}

/**
 * Convierte los cambios del pin en tramos de LED encendido/apagado.
 * El LED solo luce de verdad con el pin como salida en HIGH.
 */
export function ledTimeline(board, pin, end) {
  const evs = board.byPin[pin];
  const segs = [];
  let on = false, from = 0;
  for (const e of evs) {
    const now = e.drive === 'high';
    if (now !== on) {
      if (e.t > from) segs.push({ from, to: e.t, on });
      on = now; from = e.t;
    }
  }
  segs.push({ from, to: end, on, open: true });
  // Duraciones completas (sin el primer tramo, que depende del arranque, ni el último, que está abierto)
  const onDur = [], offDur = [];
  segs.forEach((s, i) => {
    if (s.open || i === 0) return;
    (s.on ? onDur : offDur).push(s.to - s.from);
  });
  const outAt = board.firstMode[pin].OUTPUT;
  return { segs, onDur, offDur, outputAt: outAt === undefined ? null : outAt, ledOnAt: t => isOnAt(segs, t) };
}

function isOnAt(segs, t) {
  const s = segs.find(x => t >= x.from && t < x.to) || segs[segs.length - 1];
  return s.on;
}

export const near = (x, target, pct = 1) => Math.abs(x - target) <= Math.max(target * pct / 100, 0.5);
export const fmtMs = ms => (ms < 1 ? `${(ms * 1000).toFixed(1).replace('.', ',')} µs` : `${Math.round(ms).toLocaleString('es-ES')} ms`);
export const avg = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);

/** Busca en el árbol del programa (AST) los nodos que cumplan una condición. */
export function findNodes(program, pred) {
  const out = [];
  const seen = new Set();
  const visit = n => {
    if (!n || typeof n !== 'object' || seen.has(n)) return;
    seen.add(n);
    if (pred(n)) out.push(n);
    for (const k of Object.keys(n)) {
      const v = n[k];
      if (k === 'pos') continue;
      if (Array.isArray(v)) v.forEach(visit);
      else if (v instanceof Map) v.forEach(visit);
      else if (v && typeof v === 'object') visit(v);
    }
  };
  visit(program);
  return out;
}

// ---------- Criterios reutilizables ----------

export const C = {
  compiles: () => ({
    id: 'compila', text: 'El programa compila sin errores.',
    check: ctx => ctx.res.ok
      ? (ctx.res.runtimeError ? { pass: false, msg: `Compila, pero se detiene con un error en la línea ${ctx.res.runtimeError.pos?.line}: ${ctx.res.runtimeError.message}` } : { pass: true })
      : { pass: false, msg: 'Hay errores de compilación. Corrígelos primero: pulsa «Compilar» y lee los mensajes.' },
  }),

  wiredTo: pin => ({
    id: 'montaje' + pin, text: `El LED está conectado al pin ${pin} en la zona de montaje.`,
    check: ctx => ctx.ledPin === pin ? { pass: true } : { pass: false, msg: `En el montaje el LED está conectado al pin ${ctx.ledPin}. Cambia la conexión al pin ${pin}.` },
  }),

  outputInSetup: () => ({
    id: 'salida', text: 'El pin del LED se configura como salida (OUTPUT) en setup().',
    check: ctx => {
      if (!ok(ctx)) return skip();
      const m = ctx.res.machine;
      if (ctx.outputAt === null) {
        const pm = ctx.res.board.byPin[ctx.ledPin].length;
        return { pass: false, msg: pm ? `El pin ${ctx.ledPin} nunca llega a configurarse como OUTPUT.` : `No se ejecuta ningún pinMode(${ctx.ledPin}, OUTPUT). ¿Has puesto el número de pin correcto?` };
      }
      if (m.setupEndTime !== null && ctx.outputAt > m.setupEndTime) return { pass: false, msg: 'El pin se configura dentro de loop(). Funciona, pero la configuración debe hacerse una sola vez, en setup().' };
      return { pass: true };
    },
  }),

  alwaysOn: (from, to) => ({
    id: 'encendido', text: `El LED permanece encendido de forma continua (comprobado de ${(from / 1000).toLocaleString('es-ES')} s a ${(to / 1000).toLocaleString('es-ES')} s).`,
    check: ctx => {
      if (!ok(ctx)) return skip();
      const off = ctx.segs.filter(s => !s.on && s.to > from && s.from < to);
      if (!off.length) return { pass: true };
      const pullup = ctx.res.board.byPin[ctx.ledPin].some(e => e.drive === 'pullup');
      if (pullup && ctx.outputAt === null) return { pass: false, msg: 'El LED apenas brilla: el pin no está configurado como salida, así que HIGH solo activa la resistencia pull-up interna (unos 0,1 mA).' };
      if (ctx.segs.every(s => !s.on)) return { pass: false, msg: 'El LED no llega a encenderse nunca. Revisa el digitalWrite() y el número de pin.' };
      return { pass: false, msg: `El LED se apaga ${off.length === 1 ? 'en algún momento' : off.length + ' veces'} (por ejemplo en t = ${fmtMs(Math.max(off[0].from, from))}).` };
    },
  }),

  /** Parpadeo periódico con tiempos de encendido y apagado dados. */
  blink: (onMs, offMs, pct = 1) => [
    {
      id: 'alterna', text: 'El LED se enciende y se apaga repetidamente (al menos 3 veces en la prueba).',
      check: ctx => {
        if (!ok(ctx)) return skip();
        const n = ctx.segs.filter(s => s.on).length;
        if (n >= 3) return { pass: true };
        if (n === 0) return { pass: false, msg: 'El LED no se enciende nunca durante la prueba.' };
        return { pass: false, msg: `El LED solo se enciende ${n} ${n === 1 ? 'vez' : 'veces'} en ${ctx.durationMs / 1000} s. ¿Está el código del parpadeo dentro de loop()?` };
      },
    },
    {
      id: 'ton', text: `Tiempo encendido: ${fmtMs(onMs)} (±${pct} %).`,
      check: ctx => {
        if (!ok(ctx)) return skip();
        if (!ctx.onDur.length) return { pass: false, msg: 'No hay ningún encendido completo que medir.' };
        const bad = ctx.onDur.find(d => !near(d, onMs, pct));
        if (!bad) return { pass: true, msg: `Medido: ${fmtMs(avg(ctx.onDur))}.` };
        return { pass: false, msg: `El LED está encendido ${fmtMs(bad)}; se esperaban ${fmtMs(onMs)}.` + diagnose(bad, onMs, 'encender') };
      },
    },
    {
      id: 'toff', text: `Tiempo apagado: ${fmtMs(offMs)} (±${pct} %).`,
      check: ctx => {
        if (!ok(ctx)) return skip();
        if (!ctx.offDur.length) return { pass: false, msg: 'No hay ningún apagado completo que medir.' };
        const bad = ctx.offDur.find(d => !near(d, offMs, pct));
        if (!bad) return { pass: true, msg: `Medido: ${fmtMs(avg(ctx.offDur))}.` };
        return { pass: false, msg: `El LED está apagado ${fmtMs(bad)}; se esperaban ${fmtMs(offMs)}.` + diagnose(bad, offMs, 'apagar') };
      },
    },
  ],

  /** Secuencia de encendidos/apagados que se repite (por ejemplo SOS). */
  pattern: (id, text, onSeq, offSeq, pct = 2) => ({
    id, text,
    check: ctx => {
      if (!ok(ctx)) return skip();
      // Reconstruye pares (encendido, apagado siguiente) a partir del primer encendido
      const segs = ctx.segs.filter(s => !s.open);
      const first = segs.findIndex(s => s.on);
      if (first < 0) return { pass: false, msg: 'El LED no se enciende nunca.' };
      const pairs = [];
      for (let i = first; i + 1 < segs.length; i += 2) pairs.push([segs[i].to - segs[i].from, segs[i + 1].to - segs[i + 1].from]);
      const L = onSeq.length;
      if (pairs.length < L) return { pass: false, msg: `Solo se observan ${pairs.length} destellos completos; la secuencia tiene ${L}. ¿Se repite la secuencia en loop()?` };
      for (let k = 0; k < pairs.length; k++) {
        const j = k % L;
        if (!near(pairs[k][0], onSeq[j], pct)) return { pass: false, msg: `Destello n.º ${k + 1}: encendido ${fmtMs(pairs[k][0])}; se esperaban ${fmtMs(onSeq[j])}.` };
        if (!near(pairs[k][1], offSeq[j], pct)) return { pass: false, msg: `Tras el destello n.º ${k + 1}: apagado ${fmtMs(pairs[k][1])}; se esperaban ${fmtMs(offSeq[j])}.` };
      }
      return { pass: true };
    },
  }),

  usesFor: () => ({
    id: 'for', text: 'El programa usa un bucle for.',
    check: ctx => ctx.res.ok ? (findNodes(ctx.res.machine.program, n => n.kind === 'for').length ? { pass: true } : { pass: false, msg: 'No se encuentra ningún bucle for en el programa.' }) : skip(),
  }),
};

function ok(ctx) { return ctx.res.ok && !ctx.res.runtimeError; }
function skip() { return { pass: false, msg: 'No se puede comprobar hasta que el programa compile y se ejecute sin errores.' }; }

function diagnose(measured, expected, verb) {
  if (measured < 1) return ` El LED solo cambia unos microsegundos: falta un delay() después de ${verb}lo.`;
  const ratio = measured / expected;
  if (Math.abs(ratio - 2) < 0.02) return ' Es justo el doble: ¿hay dos delay() seguidos o un valor duplicado?';
  if (Math.abs(ratio - 0.5) < 0.02) return ' Es justo la mitad.';
  if (Math.abs(measured - expected * 1000) < expected) return ' ¡Mil veces más! delay() trabaja en milisegundos, no en segundos.';
  if (Math.abs(measured * 1000 - expected) < expected) return ' ¡Mil veces menos! Recuerda que delay() recibe milisegundos: 1 s = 1000 ms.';
  return ' Revisa el valor del delay() correspondiente.';
}
