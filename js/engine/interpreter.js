// Intérprete del subconjunto de Arduino C/C++.
// Recorre el árbol del programa sin usar eval(). La ejecución avanza por tramos (advance)
// para no bloquear el navegador: delay() pausa el programa en tiempo simulado.
import { RuntimeError, ArduinoError } from './errors.js';
import { BUILTINS, CONSTANTS, COST } from './builtins.js';
import { convert, arithType, promote, TYPES } from './types.js';
import { MODE_NAMES, pinLabel } from '../model/board.js';

const BREAK = { signal: 'break' };
const CONTINUE = { signal: 'continue' };
const BUDGET = { type: 'budget' };
const STATEMENTS_PER_SLICE = 1000;
const MAX_DEPTH = 60;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class Machine {
  /**
   * @param {object} program  árbol devuelto por compile()
   * @param {import('../model/board.js').Board} board
   * @param {{onWarning?:(e:ArduinoError)=>void}} [opts]
   */
  constructor(program, board, opts = {}) {
    this.program = program;
    this.board = board;
    this.onWarning = opts.onWarning || (() => {});
    this.time = 0;            // tiempo simulado en ms
    this.wakeAt = null;       // fin del delay() en curso
    this.loopCount = 0;       // vueltas completas de loop()
    this.phase = 'init';      // 'init' | 'setup' | 'loop'
    this.setupEndTime = null; // instante en que termina setup()
    this.line = 0;            // línea que se está ejecutando
    this.status = 'ready';    // 'ready' | 'running' | 'error' | 'stopped'
    this.error = null;
    this.depth = 0;
    this.counter = 0;
    this.warned = new Set();
    this.globals = new Map();
    this.frames = [];         // pila de llamadas: cada marco es una lista de ámbitos
    this.gen = this.main();
  }

  // ---------- Planificador ----------

  /**
   * Ejecuta hasta alcanzar el tiempo simulado `target` (ms) o agotar `budgetMs` ms de tiempo real.
   * @returns {'ok'|'sleeping'|'busy'|'error'|'done'}
   */
  advance(target, budgetMs = 12) {
    if (this.status === 'error' || this.status === 'stopped') return this.status;
    this.status = 'running';
    const deadline = now() + budgetMs;
    for (let s = 0; ; s++) {
      if ((s & 7) === 7 && now() > deadline) break;
      if (this.wakeAt !== null) {
        if (this.wakeAt > target) { this.time = Math.max(this.time, target); return 'sleeping'; }
        this.time = this.wakeAt;
        this.wakeAt = null;
      }
      if (this.time >= target) return 'ok';
      let r;
      try {
        r = this.gen.next();
      } catch (e) {
        if (e instanceof ArduinoError) { this.status = 'error'; this.error = e; return 'error'; }
        if (e instanceof RangeError) {
          this.status = 'error';
          this.error = new RuntimeError('Demasiadas llamadas a funciones anidadas (desbordamiento de pila).', { line: this.line, col: 1 });
          return 'error';
        }
        throw e;
      }
      if (r.done) { this.status = 'stopped'; return 'done'; }
      if (r.value.type === 'delay') this.wakeAt = this.time + r.value.ms;
    }
    return 'busy';
  }

  stop() { this.status = 'stopped'; }

  *main() {
    for (const g of this.program.globals) yield* this.declare(g, this.globals);
    this.phase = 'setup';
    yield* this.callUser(this.program.functions.get('setup'), [], this.program.functions.get('setup').pos);
    this.phase = 'loop';
    this.setupEndTime = this.time;
    const loopFn = this.program.functions.get('loop');
    for (;;) {
      yield* this.callUser(loopFn, [], loopFn.pos);
      this.loopCount++;
      this.time += COST.loopOverhead;
      this.line = loopFn.pos.line;
      // Una vuelta de loop() vacía no debe congelar el navegador
      if (++this.counter >= STATEMENTS_PER_SLICE) { this.counter = 0; yield BUDGET; }
    }
  }

  // ---------- Variables ----------

  scopeChain() { return this.frames.length ? this.frames[this.frames.length - 1] : []; }

  find(name) {
    const chain = this.scopeChain();
    for (let i = chain.length - 1; i >= 0; i--) { const v = chain[i].get(name); if (v) return v; }
    return this.globals.get(name) || null;
  }

  *declare(d, scope) {
    for (const v of d.decls) {
      let value = 0;
      if (v.init) {
        const r = v.init.mayYield ? yield* this.evalY(v.init) : this.eval(v.init);
        value = convert(r.v, d.type);
      }
      scope.set(v.name, { type: d.type, v: value, isConst: d.isConst, uninit: !v.init && !d.global, name: v.name, pos: v.pos });
    }
  }

  declareSync(d, scope) {
    for (const v of d.decls)
      scope.set(v.name, { type: d.type, v: v.init ? convert(this.eval(v.init).v, d.type) : 0, isConst: d.isConst, uninit: !v.init, name: v.name, pos: v.pos });
  }

  // ---------- Sentencias ----------

  *exec(s) {
    this.line = s.pos.line;
    this.time += COST.statement;
    if (++this.counter >= STATEMENTS_PER_SLICE) { this.counter = 0; yield BUDGET; }
    switch (s.kind) {
      case 'block': {
        const chain = this.scopeChain();
        chain.push(new Map());
        try {
          for (const st of s.body) {
            if (st.simple === undefined) st.simple = (st.kind === 'expr' && !st.expr.mayYield) || (st.kind === 'decl' && !st.decls.some(d => d.init && d.init.mayYield));
            if (st.simple) {
              // Instrucción sin pausas: se ejecuta directamente (más rápido)
              this.line = st.pos.line;
              this.time += COST.statement;
              if (st.kind === 'expr') this.eval(st.expr);
              else this.declareSync(st, chain[chain.length - 1]);
              if (++this.counter >= STATEMENTS_PER_SLICE) { this.counter = 0; yield BUDGET; }
              continue;
            }
            const c = yield* this.exec(st);
            if (c) return c;
          }
        } finally { chain.pop(); }
        return null;
      }
      case 'empty': return null;
      case 'decl': {
        const chain = this.scopeChain();
        yield* this.declare(s, chain[chain.length - 1]);
        return null;
      }
      case 'expr':
        if (s.expr.mayYield) yield* this.evalY(s.expr); else this.eval(s.expr);
        return null;
      case 'if': {
        const c = yield* this.test(s.cond);
        this.line = s.pos.line;
        if (c) return yield* this.exec(s.then);
        if (s.otherwise) return yield* this.exec(s.otherwise);
        return null;
      }
      case 'while':
        while (yield* this.test(s.cond)) {
          const c = yield* this.exec(s.body);
          if (c === BREAK) break;
          if (c && c !== CONTINUE) return c;
          this.line = s.pos.line;
        }
        return null;
      case 'dowhile':
        do {
          const c = yield* this.exec(s.body);
          if (c === BREAK) break;
          if (c && c !== CONTINUE) return c;
          this.line = s.pos.line;
        } while (yield* this.test(s.cond));
        return null;
      case 'for': {
        const chain = this.scopeChain();
        chain.push(new Map());
        try {
          if (s.init) yield* this.exec(s.init);
          for (;;) {
            this.line = s.pos.line;
            if (s.cond && !(yield* this.test(s.cond))) break;
            const c = yield* this.exec(s.body);
            if (c === BREAK) break;
            if (c && c !== CONTINUE) return c;
            this.line = s.pos.line;
            this.time += COST.statement;
            if (s.update) { if (s.update.mayYield) yield* this.evalY(s.update); else this.eval(s.update); }
            if (++this.counter >= STATEMENTS_PER_SLICE) { this.counter = 0; yield BUDGET; }
          }
        } finally { chain.pop(); }
        return null;
      }
      case 'break': return BREAK;
      case 'continue': return CONTINUE;
      case 'return': {
        const value = s.expr ? (s.expr.mayYield ? yield* this.evalY(s.expr) : this.eval(s.expr)) : null;
        return { signal: 'return', value };
      }
    }
    throw new RuntimeError(`Instrucción no admitida (${s.kind}).`, s.pos);
  }

  *test(e) {
    const r = e.mayYield ? yield* this.evalY(e) : this.eval(e);
    return r.v !== 0;
  }

  *callUser(fn, args, pos) {
    if (this.depth >= MAX_DEPTH)
      throw new RuntimeError(`Demasiadas llamadas anidadas a ${fn.name}() (desbordamiento de pila). ¿Hay una función que se llama a sí misma sin parar?`, pos,
        'error', 'El ATmega328P solo tiene 2 KB de memoria RAM para variables y llamadas.');
    const scope = new Map();
    fn.params.forEach((p, i) => scope.set(p.name, { type: p.type, v: convert(args[i].v, p.type), isConst: false, name: p.name }));
    this.frames.push([scope]);
    this.depth++;
    this.time += COST.call;
    try {
      const c = yield* this.exec(fn.body);
      if (c && c.signal === 'return') {
        if (fn.ret === 'void') return { t: 'void', v: 0 };
        return { t: fn.ret, v: convert(c.value ? c.value.v : 0, fn.ret) };
      }
      return { t: fn.ret, v: 0 };
    } finally {
      this.depth--;
      this.frames.pop();
    }
  }

  // ---------- Expresiones ----------

  /** Evaluación de expresiones que pueden pausar (contienen delay() o llamadas a funciones propias). */
  *evalY(e) {
    switch (e.kind) {
      case 'call': {
        const args = [];
        for (const a of e.args) args.push(a.mayYield ? yield* this.evalY(a) : this.eval(a));
        if (e.user) {
          const fn = this.program.functions.get(e.name);
          const r = yield* this.callUser(fn, args, e.pos);
          this.line = e.pos.line;
          return r;
        }
        return yield* this.builtin(e, args);
      }
      case 'bin': {
        const l = e.l.mayYield ? yield* this.evalY(e.l) : this.eval(e.l);
        const r = e.r.mayYield ? yield* this.evalY(e.r) : this.eval(e.r);
        return this.binary(e, l, r);
      }
      case 'logic': {
        const l = e.l.mayYield ? yield* this.evalY(e.l) : this.eval(e.l);
        if (e.op === '&&' ? l.v === 0 : l.v !== 0) return { t: 'bool', v: e.op === '||' ? 1 : 0 };
        const r = e.r.mayYield ? yield* this.evalY(e.r) : this.eval(e.r);
        return { t: 'bool', v: r.v !== 0 ? 1 : 0 };
      }
      case 'unary': return this.unary(e, e.e.mayYield ? yield* this.evalY(e.e) : this.eval(e.e));
      case 'cast': { const v = e.e.mayYield ? yield* this.evalY(e.e) : this.eval(e.e); return { t: e.type, v: convert(v.v, e.type) }; }
      case 'cond': {
        const t = e.test.mayYield ? yield* this.evalY(e.test) : this.eval(e.test);
        const b = t.v !== 0 ? e.a : e.b;
        return b.mayYield ? yield* this.evalY(b) : this.eval(b);
      }
      case 'assign': return this.assign(e, e.value.mayYield ? yield* this.evalY(e.value) : this.eval(e.value));
    }
    return this.eval(e);
  }

  /** Evaluación directa (sin pausas). */
  eval(e) {
    switch (e.kind) {
      case 'num': return { t: e.type, v: e.value };
      case 'str': return { t: 'str', v: e.value };
      case 'id': {
        const v = this.find(e.name);
        if (v) {
          if (v.uninit && !this.warned.has(v)) {
            this.warned.add(v);
            this.warn(`La variable «${e.name}» se usa sin haberle dado un valor inicial. En un Arduino real su valor sería impredecible; el simulador usa 0.`, e.pos);
          }
          return { t: v.type, v: v.v };
        }
        const c = CONSTANTS[e.name];
        if (c) return { t: c.t, v: c.v };
        throw new RuntimeError(`«${e.name}» no está declarada.`, e.pos);
      }
      case 'bin': return this.binary(e, this.eval(e.l), this.eval(e.r));
      case 'logic': {
        const l = this.eval(e.l);
        if (e.op === '&&' ? l.v === 0 : l.v !== 0) return { t: 'bool', v: e.op === '||' ? 1 : 0 };
        return { t: 'bool', v: this.eval(e.r).v !== 0 ? 1 : 0 };
      }
      case 'unary': return this.unary(e, this.eval(e.e));
      case 'cast': return { t: e.type, v: convert(this.eval(e.e).v, e.type) };
      case 'cond': return this.eval(this.eval(e.test).v !== 0 ? e.a : e.b);
      case 'assign': return this.assign(e, this.eval(e.value));
      case 'update': {
        const v = this.variable(e.target);
        const old = v.v;
        v.v = convert(old + (e.op === '++' ? 1 : -1), v.type);
        v.uninit = false;
        return { t: v.type, v: e.prefix ? v.v : old };
      }
      case 'call': {
        // Llamada sin pausa: se ejecuta completa
        const g = this.evalY(e);
        const r = g.next();
        if (!r.done) throw new RuntimeError('Error interno: llamada con pausa no prevista.', e.pos);
        return r.value;
      }
    }
    throw new RuntimeError(`Expresión no admitida (${e.kind}).`, e.pos);
  }

  variable(target) {
    const v = this.find(target.name);
    if (!v) throw new RuntimeError(`«${target.name}» no está declarada.`, target.pos);
    return v;
  }

  assign(e, val) {
    const v = this.variable(e.target);
    if (e.op === '=') v.v = convert(val.v, v.type);
    else {
      const op = e.op.slice(0, -1);
      const r = this.binary({ op, pos: e.pos }, { t: v.type, v: v.v }, val);
      v.v = convert(r.v, v.type);
    }
    v.uninit = false;
    return { t: v.type, v: v.v };
  }

  binary(e, l, r) {
    const op = e.op;
    if (l.t === 'str' || r.t === 'str') throw new RuntimeError('No se pueden hacer operaciones con textos.', e.pos);
    if (op === '<<' || op === '>>') {
      const t = promote(l.t);
      if (!TYPES[t].int || !TYPES[r.t].int) throw new RuntimeError(`El operador «${op}» solo admite números enteros.`, e.pos);
      const n = r.v;
      const val = op === '<<' ? l.v * 2 ** n : Math.floor(l.v / 2 ** n);
      return { t, v: convert(val, t) };
    }
    const t = arithType(l.t, r.t);
    const isFloat = !TYPES[t].int;
    const a = isFloat ? l.v : convert(l.v, t);
    const b = isFloat ? r.v : convert(r.v, t);
    switch (op) {
      case '+': return { t, v: isFloat ? Math.fround(a + b) : convert(a + b, t) };
      case '-': return { t, v: isFloat ? Math.fround(a - b) : convert(a - b, t) };
      case '*':
        if (isFloat) return { t, v: Math.fround(a * b) };
        return { t, v: convert(TYPES[t].bits === 32 ? Math.imul(a, b) : a * b, t) };
      case '/':
        if (isFloat) return { t, v: Math.fround(a / b) };
        if (b === 0) throw new RuntimeError('División entre cero.', e.pos, 'error', 'Con números enteros el resultado no está definido; en un Arduino real el programa daría un valor sin sentido.');
        return { t, v: convert(Math.trunc(a / b), t) };
      case '%':
        if (isFloat) throw new RuntimeError('El operador % solo admite números enteros. Para float usa fmod().', e.pos);
        if (b === 0) throw new RuntimeError('Resto de una división entre cero (% 0).', e.pos);
        return { t, v: convert(a % b, t) };
      case '==': return { t: 'bool', v: a === b ? 1 : 0 };
      case '!=': return { t: 'bool', v: a !== b ? 1 : 0 };
      case '<': return { t: 'bool', v: a < b ? 1 : 0 };
      case '>': return { t: 'bool', v: a > b ? 1 : 0 };
      case '<=': return { t: 'bool', v: a <= b ? 1 : 0 };
      case '>=': return { t: 'bool', v: a >= b ? 1 : 0 };
      case '&': case '|': case '^':
        if (isFloat) throw new RuntimeError(`El operador «${op}» solo admite números enteros.`, e.pos);
        return { t, v: convert(op === '&' ? a & b : op === '|' ? a | b : a ^ b, t) };
    }
    throw new RuntimeError(`Operador no admitido: «${op}».`, e.pos);
  }

  unary(e, x) {
    if (x.t === 'str') throw new RuntimeError('No se pueden hacer operaciones con textos.', e.pos);
    switch (e.op) {
      case '!': return { t: 'bool', v: x.v === 0 ? 1 : 0 };
      case '+': { const t = promote(x.t); return { t, v: x.v }; }
      case '-': { const t = promote(x.t); return { t, v: TYPES[t].int ? convert(-x.v, t) : Math.fround(-x.v) }; }
      case '~': {
        const t = promote(x.t);
        if (!TYPES[t].int) throw new RuntimeError('El operador «~» solo admite números enteros.', e.pos);
        return { t, v: convert(~x.v, t) };
      }
    }
    throw new RuntimeError(`Operador no admitido: «${e.op}».`, e.pos);
  }

  // ---------- Funciones de Arduino ----------

  pinArg(arg, e) {
    const pin = arg.v;
    if (!Number.isInteger(pin) || pin < 0 || pin > 19)
      throw new RuntimeError(`${e.name}(): el pin ${pin} no existe en Arduino UNO. Los pines válidos son 0-13 y A0-A5 (14-19).`, e.pos);
    if ((pin === 0 || pin === 1) && !this.warned.has('serial-pins')) {
      this.warned.add('serial-pins');
      this.warn('Los pines 0 (RX) y 1 (TX) los usa la comunicación serie con el ordenador. Es mejor reservarlos y usar los pines 2-13.', e.pos);
    }
    return pin;
  }

  *builtin(e, args) {
    const b = BUILTINS[e.name];
    switch (e.name) {
      case 'pinMode': {
        const pin = this.pinArg(args[0], e);
        const m = args[1].v;
        if (!(m in MODE_NAMES) || !Number.isInteger(m))
          throw new RuntimeError(`pinMode(): el modo debe ser INPUT, OUTPUT o INPUT_PULLUP (se recibió ${m}).`, e.pos);
        this.time += COST.pinMode;
        this.board.pinMode(pin, MODE_NAMES[m], this.time);
        return { t: 'void', v: 0 };
      }
      case 'digitalWrite': {
        const pin = this.pinArg(args[0], e);
        const p = this.board.pins[pin];
        if (p.mode !== 'OUTPUT' && !this.warned.has('dw' + pin)) {
          this.warned.add('dw' + pin);
          this.warn(`digitalWrite(${pinLabel(pin).replace('D', '')}, …) sin haber configurado antes el pin como salida con pinMode(${pin}, OUTPUT).`, e.pos,
            'Sin pinMode el pin sigue siendo una entrada: escribir HIGH solo activa la resistencia pull-up interna y el LED apenas brilla.');
        }
        this.time += COST.digitalWrite;
        this.board.digitalWrite(pin, args[1].v !== 0, this.time);
        return { t: 'void', v: 0 };
      }
      case 'delay': {
        const ms = convert(args[0].v, 'unsigned long');
        if (ms > 0) yield { type: 'delay', ms };
        return { t: 'void', v: 0 };
      }
      case 'delayMicroseconds': {
        const us = convert(args[0].v, 'unsigned int');
        if (us > 0) yield { type: 'delay', ms: us / 1000 };
        return { t: 'void', v: 0 };
      }
    }
    throw new RuntimeError(`«${b ? b.sig : e.name}» no está disponible en esta versión del simulador.`, e.pos);
  }

  warn(msg, pos, hint = '') {
    this.onWarning(new ArduinoError(msg, pos, 'warning', hint));
  }
}
