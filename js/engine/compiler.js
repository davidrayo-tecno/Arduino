// «Compilador»: análisis léxico, sintáctico y comprobaciones semánticas.
// No genera código máquina: produce un árbol verificado que ejecuta el intérprete.
import { tokenize } from './lexer.js';
import { parse } from './parser.js';
import { ArduinoError, CompileError, suggest } from './errors.js';
import { BUILTINS, CONSTANTS, CURRENT_PHASE, PHASE_NAMES } from './builtins.js';
import { convert, rangeOf, TYPES } from './types.js';

/**
 * @param {string} src
 * @returns {{ok:boolean, program:object|null, diagnostics:ArduinoError[]}}
 */
export function compile(src) {
  const diagnostics = [];
  let program;
  try {
    const { tokens, warnings } = tokenize(src);
    diagnostics.push(...warnings);
    program = parse(tokens);
  } catch (e) {
    if (e instanceof ArduinoError) return { ok: false, program: null, diagnostics: [...diagnostics, e] };
    throw e;
  }
  for (const w of program.emptyWarnings)
    diagnostics.push(new ArduinoError(`Hay un «;» justo después del ${w.what}: el ${w.what} no controla nada y la instrucción siguiente se ejecuta siempre.`, w.pos, 'warning'));
  analyze(program, diagnostics);
  const ok = !diagnostics.some(d => d.severity === 'error');
  diagnostics.sort((a, b) => (a.pos?.line ?? 0) - (b.pos?.line ?? 0));
  return { ok, program: ok ? program : null, diagnostics };
}

const PIN_FUNCS = new Set(['pinMode', 'digitalWrite', 'digitalRead', 'analogWrite', 'analogRead']);

function analyze(program, out) {
  const err = (msg, pos, hint = '') => out.push(new CompileError(msg, pos, 'error', hint));
  const warn = (msg, pos, hint = '') => out.push(new ArduinoError(msg, pos, 'warning', hint));

  const funcs = program.functions;
  // setup() y loop() son obligatorias
  for (const name of ['setup', 'loop']) {
    const f = funcs.get(name);
    if (!f) {
      const similar = suggest(name, [...funcs.keys()]);
      err(`Falta la función ${name}(). Todo programa de Arduino necesita «void setup() { … }» y «void loop() { … }».`,
        similar ? funcs.get(similar).pos : { line: 1, col: 1 },
        similar ? `¿Querías escribir «${name}» en lugar de «${similar}»?` : '');
    } else {
      if (f.ret !== 'void') err(`${name}() debe declararse como «void ${name}()».`, f.pos);
      if (f.params.length) err(`${name}() no lleva parámetros.`, f.pos);
    }
  }
  for (const [name] of funcs) {
    if (BUILTINS[name] || CONSTANTS[name]) err(`«${name}» es una función o constante de Arduino; elige otro nombre para tu función.`, funcs.get(name).pos);
  }

  // Ámbitos: el global se va llenando en orden de declaración
  const globalScope = new Map();
  const scopes = [globalScope];
  let currentFn = null, loopDepth = 0;

  const lookup = name => { for (let i = scopes.length - 1; i >= 0; i--) if (scopes[i].has(name)) return scopes[i].get(name); return null; };
  const allNames = () => [...new Set([...scopes.flatMap(s => [...s.keys()]), ...Object.keys(CONSTANTS)])];

  function declare(name, info, pos) {
    const scope = scopes[scopes.length - 1];
    if (scope.has(name)) { err(`La variable «${name}» ya está declarada en este bloque.`, pos); return; }
    if (CONSTANTS[name]) { err(`«${name}» es una constante de Arduino y no puede usarse como nombre de variable.`, pos); return; }
    if (BUILTINS[name]) { err(`«${name}» es una función de Arduino y no puede usarse como nombre de variable.`, pos); return; }
    if (scope === globalScope && funcs.has(name)) { err(`«${name}» ya es el nombre de una función.`, pos); return; }
    scope.set(name, info);
  }

  function decl(d) {
    for (const v of d.decls) {
      if (v.init) {
        expr(v.init);
        literalFits(v.init, d.type, v.name);
        if (v.init.kind === 'str') err(`No se puede guardar un texto en la variable «${v.name}» de tipo ${d.type}.`, v.pos);
      } else if (!d.global) {
        v.uninitialized = true;
      }
      declare(v.name, { type: d.type, isConst: d.isConst, global: !!d.global }, v.pos);
    }
  }

  function literalFits(e, type, name) {
    const lit = constValue(e);
    if (lit === null) return;
    const r = rangeOf(type);
    if (!r || type === 'bool') return;
    if (!Number.isInteger(lit)) {
      if (TYPES[type].int) warn(`${lit} tiene decimales, pero «${name}» es de tipo ${type}: se guardará ${convert(lit, type)} (se pierden los decimales).`, e.pos, 'Usa float si necesitas decimales.');
      return;
    }
    if (lit < r[0] || lit > r[1])
      warn(`${lit} no cabe en una variable ${type} (rango ${r[0]} … ${r[1]} en Arduino UNO): «${name}» valdrá ${convert(lit, type)}.`, e.pos,
        type === 'int' ? 'En el UNO, int ocupa 16 bits. Para valores mayores usa long o unsigned long.' : '');
  }

  function constValue(e) {
    if (e.kind === 'num') return e.value;
    if (e.kind === 'unary' && e.op === '-' && e.e.kind === 'num') return -e.e.value;
    return null;
  }

  function block(b, newScope = true) {
    if (newScope) scopes.push(new Map());
    for (const s of b.body) stmt(s);
    if (newScope) scopes.pop();
  }

  function stmt(s) {
    switch (s.kind) {
      case 'block': block(s); break;
      case 'empty': break;
      case 'decl': decl(s); break;
      case 'expr':
        expr(s.expr);
        if (s.expr.kind === 'bin' && ['==', '!=', '<', '>', '<=', '>='].includes(s.expr.op))
          warn(`La comparación «${s.expr.op}» no tiene efecto como instrucción.`, s.expr.pos, s.expr.op === '==' ? '¿Querías asignar un valor? Para asignar se usa un solo «=».' : '');
        else if (['id', 'num', 'bin', 'str'].includes(s.expr.kind))
          warn('Esta instrucción no hace nada.', s.pos, s.expr.kind === 'id' && funcs.has(s.expr.name) ? `Para llamar a la función escribe ${s.expr.name}();` : '');
        break;
      case 'if':
        cond(s.cond); stmt(s.then); if (s.otherwise) stmt(s.otherwise); break;
      case 'while': cond(s.cond); loopDepth++; stmt(s.body); loopDepth--; break;
      case 'dowhile': loopDepth++; stmt(s.body); loopDepth--; cond(s.cond); break;
      case 'for':
        scopes.push(new Map());
        if (s.init) stmt(s.init);
        if (s.cond) cond(s.cond);
        if (s.update) expr(s.update);
        loopDepth++; stmt(s.body); loopDepth--;
        scopes.pop();
        break;
      case 'break': if (!loopDepth) err('«break» solo puede usarse dentro de un bucle (for, while, do).', s.pos); break;
      case 'continue': if (!loopDepth) err('«continue» solo puede usarse dentro de un bucle (for, while, do).', s.pos); break;
      case 'return':
        if (s.expr) {
          expr(s.expr);
          if (currentFn.ret === 'void') err(`La función ${currentFn.name}() es void y no puede devolver un valor.`, s.pos);
        } else if (currentFn.ret !== 'void') warn(`La función ${currentFn.name}() debe devolver un valor de tipo ${currentFn.ret}.`, s.pos);
        currentFn.hasReturn = true;
        break;
    }
  }

  function cond(e) {
    expr(e);
    if (e.kind === 'assign' && e.op === '=')
      warn('Hay una asignación «=» dentro de la condición.', e.pos, 'Para comparar se usa «==». Con «=» se cambia el valor de la variable y la condición casi siempre es verdadera.');
  }

  /** Recorre una expresión; marca mayYield si puede pausar la ejecución (delay o función propia). */
  function expr(e) {
    switch (e.kind) {
      case 'num': case 'str': return false;
      case 'id': {
        if (lookup(e.name) || CONSTANTS[e.name]) return false;
        if (funcs.has(e.name) || BUILTINS[e.name]) { err(`«${e.name}» es una función: para llamarla hay que escribir paréntesis, ${e.name}(…).`, e.pos); return false; }
        const later = program.globals.find(g => g.decls.some(d => d.name === e.name));
        if (later) { err(`La variable «${e.name}» se usa antes de haberla declarado.`, e.pos, 'Mueve su declaración más arriba, antes de usarla.'); return false; }
        const s = suggest(e.name, allNames());
        err(`«${e.name}» no está declarada.`, e.pos, s ? `¿Quisiste decir «${s}»? Recuerda que C/C++ distingue mayúsculas de minúsculas.` : 'Declárala antes de usarla, por ejemplo: int ' + e.name + ' = 0;');
        return false;
      }
      case 'bin': case 'logic': return (e.mayYield = expr(e.l) | expr(e.r)) === 1;
      case 'unary': case 'cast': return (e.mayYield = expr(e.e));
      case 'cond': return (e.mayYield = (expr(e.test) | expr(e.a) | expr(e.b)) === 1);
      case 'assign': case 'update': {
        const v = lookup(e.target.name);
        if (!v) {
          if (CONSTANTS[e.target.name]) err(`«${e.target.name}» es una constante de Arduino y no se puede modificar.`, e.target.pos);
          else expr(e.target);
        } else if (v.isConst) err(`«${e.target.name}» es una constante (const) y no se puede modificar.`, e.pos);
        if (e.kind === 'assign') {
          const y = expr(e.value);
          if (e.value.kind === 'str') err('Los textos (String) todavía no se pueden guardar en variables en el simulador.', e.value.pos);
          if (v && e.op === '=') literalFits(e.value, v.type, e.target.name);
          return (e.mayYield = y);
        }
        return false;
      }
      case 'call': return call(e);
    }
    return false;
  }

  function call(e) {
    let y = false;
    for (const a of e.args) y = expr(a) || y;
    const user = funcs.get(e.name);
    if (user) {
      if (e.args.length !== user.params.length)
        err(`${e.name}() necesita ${user.params.length} argumento${user.params.length === 1 ? '' : 's'}, pero se le pasan ${e.args.length}.`, e.pos);
      if (e.name === 'setup' || e.name === 'loop')
        warn(`Llamar a ${e.name}() directamente no es habitual: Arduino ya la ejecuta ${e.name === 'setup' ? 'una vez al arrancar' : 'continuamente'}.`, e.pos);
      e.user = true;
      return (e.mayYield = true);
    }
    const b = BUILTINS[e.name];
    if (!b) {
      if (lookup(e.name)) { err(`«${e.name}» es una variable, no una función.`, e.pos); return y; }
      if (e.name.startsWith('Serial.')) {
        err(`«${e.name}» no existe o no está admitida en el simulador.`, e.pos);
        return y;
      }
      const s = suggest(e.name, [...Object.keys(BUILTINS), ...funcs.keys()]);
      err(`La función «${e.name}()» no está declarada.`, e.pos, s ? `¿Quisiste decir «${s}()»? Recuerda que C/C++ distingue mayúsculas de minúsculas.` : '');
      return y;
    }
    if (b.phase > CURRENT_PHASE) {
      err(`«${b.sig.split('(')[0]}()» todavía no está disponible en esta versión del simulador. Llegará en la ${PHASE_NAMES[b.phase]}.`, e.pos);
      return y;
    }
    const [mn, mx] = b.args;
    if (e.args.length < mn || e.args.length > mx)
      err(`${e.name}() necesita ${mn === mx ? mn : `entre ${mn} y ${mx}`} argumento${mx === 1 ? '' : 's'}: ${b.sig}.`, e.pos);
    for (const a of e.args) if (a.kind === 'str') err(`${e.name}() no admite textos como argumento.`, a.pos);
    if (PIN_FUNCS.has(e.name) && e.args[0]) {
      const pin = constValue(e.args[0]);
      if (pin !== null && (pin < 0 || pin > 19 || !Number.isInteger(pin)))
        err(`El pin ${pin} no existe en Arduino UNO. Los pines válidos son 0-13 y A0-A5.`, e.args[0].pos);
    }
    if (e.name === 'pinMode' && e.args[1]?.kind === 'id' && ['HIGH', 'LOW'].includes(e.args[1].name))
      warn(`El segundo argumento de pinMode() es el modo (INPUT, OUTPUT o INPUT_PULLUP), no ${e.args[1].name}.`, e.args[1].pos);
    if (e.name === 'digitalWrite' && e.args[1]?.kind === 'id' && ['OUTPUT', 'INPUT', 'INPUT_PULLUP'].includes(e.args[1].name))
      warn(`El segundo argumento de digitalWrite() es el nivel (HIGH o LOW), no ${e.args[1].name}.`, e.args[1].pos);
    if (e.name === 'delay' && e.args[0]) {
      const v = constValue(e.args[0]);
      if (v !== null && v < 0) warn(`delay() no admite valores negativos: ${v} se convierte en ${convert(v, 'unsigned long')} ms (¡casi 50 días!).`, e.args[0].pos);
    }
    if (b.ret !== 'void') e.ret = b.ret;
    return (e.mayYield = !!b.yields || y);
  }

  // Variables globales y funciones, en orden de aparición
  for (const item of program.items) {
    if (item.kind === 'decl') { decl(item); continue; }
    currentFn = item;
    scopes.push(new Map());
    for (const p of item.params) declare(p.name, { type: p.type, isConst: false }, p.pos);
    block(item.body, false);
    scopes.pop();
    if (item.ret !== 'void' && !item.hasReturn)
      warn(`La función ${item.name}() es de tipo ${item.ret} pero no tiene ningún «return».`, item.pos);
    currentFn = null;
  }
  // Funciones void usadas como valor
  const checkVoidUse = e => {
    if (!e || typeof e !== 'object') return;
    if (e.kind === 'call') {
      const f = funcs.get(e.name);
      if (f && f.ret === 'void' && e.usedAsValue) err(`${e.name}() es void: no devuelve ningún valor que se pueda usar.`, e.pos);
      const b = BUILTINS[e.name];
      if (b && b.ret === 'void' && e.usedAsValue) err(`${e.name}() no devuelve ningún valor que se pueda usar.`, e.pos);
    }
  };
  walkValues(program, checkVoidUse);
}

/** Marca las llamadas cuyo resultado se usa como valor y aplica fn a cada expresión. */
function walkValues(program, fn) {
  const visitExpr = (e, asValue) => {
    if (!e) return;
    if (e.kind === 'call') { e.usedAsValue = asValue; e.args.forEach(a => visitExpr(a, true)); }
    else if (e.kind === 'bin' || e.kind === 'logic') { visitExpr(e.l, true); visitExpr(e.r, true); }
    else if (e.kind === 'unary' || e.kind === 'cast') visitExpr(e.e, true);
    else if (e.kind === 'cond') { visitExpr(e.test, true); visitExpr(e.a, asValue); visitExpr(e.b, asValue); }
    else if (e.kind === 'assign') visitExpr(e.value, true);
    fn(e);
  };
  const visitStmt = s => {
    if (!s) return;
    switch (s.kind) {
      case 'block': s.body.forEach(visitStmt); break;
      case 'decl': s.decls.forEach(d => visitExpr(d.init, true)); break;
      case 'expr': visitExpr(s.expr, false); break;
      case 'if': visitExpr(s.cond, true); visitStmt(s.then); visitStmt(s.otherwise); break;
      case 'while': case 'dowhile': visitExpr(s.cond, true); visitStmt(s.body); break;
      case 'for': visitStmt(s.init); visitExpr(s.cond, true); visitExpr(s.update, false); visitStmt(s.body); break;
      case 'return': visitExpr(s.expr, true); break;
    }
  };
  for (const item of program.items) {
    if (item.kind === 'decl') visitStmt(item); else visitStmt(item.body);
  }
}
