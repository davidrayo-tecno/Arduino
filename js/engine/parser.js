// Analizador sintáctico: construye el árbol del programa (AST) a partir de los tokens.
import { CompileError } from './errors.js';
import { ALIASES, TYPES, TYPE_WORDS, literalType } from './types.js';

const QUALIFIERS = new Set(['const', 'static', 'volatile']);
const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=']);
const BINARY_PREC = [
  ['||'], ['&&'], ['|'], ['^'], ['&'], ['==', '!='], ['<', '>', '<=', '>='], ['<<', '>>'], ['+', '-'], ['*', '/', '%'],
];
const UNSUPPORTED_KW = {
  switch: 'La instrucción «switch» todavía no está admitida en el simulador. De momento usa if / else if.',
  case: 'La instrucción «switch/case» todavía no está admitida en el simulador. De momento usa if / else if.',
  default: 'La instrucción «switch/case» todavía no está admitida en el simulador.',
  goto: '«goto» no está admitido. Usa bucles (for, while) y condicionales.',
  struct: 'Las estructuras (struct) no están admitidas en el simulador.',
  class: 'Las clases no están admitidas en el simulador.',
  enum: 'Las enumeraciones (enum) no están admitidas en el simulador.',
  typedef: '«typedef» no está admitido en el simulador.',
  sizeof: '«sizeof» todavía no está admitido en el simulador.',
  new: 'La memoria dinámica (new) no está admitida en el simulador.',
  delete: 'La memoria dinámica (delete) no está admitida en el simulador.',
};

export function parse(tokens) {
  let p = 0;
  const peek = (k = 0) => tokens[Math.min(p + k, tokens.length - 1)];
  const next = () => tokens[p++];
  const is = (v, k = 0) => { const t = peek(k); return (t.type === 'op' || t.type === 'kw') && t.value === v; };
  const accept = v => (is(v) ? next() : null);
  const posOf = t => ({ line: t.line, col: t.col });
  const show = t => (t.type === 'eof' ? 'el final del programa' : `«${t.text}»`);

  function fail(msg, t = peek()) { throw new CompileError(msg, posOf(t)); }

  function expect(v, what) {
    if (is(v)) return next();
    const t = peek(), prev = tokens[p - 1];
    if (v === ';') {
      if (prev && prev.line < t.line)
        throw new CompileError('Falta el punto y coma «;» al final de esta línea.', { line: prev.line, col: prev.col + prev.text.length },
          'error', 'En C/C++ cada instrucción termina con «;».');
      fail(`Se esperaba «;» antes de ${show(t)}.`);
    }
    if (v === ')' ) fail(`Falta cerrar el paréntesis «)»${what ? ' ' + what : ''}; se encontró ${show(t)}.`);
    if (v === '}') fail(`Falta la llave de cierre «}»${what ? ' ' + what : ''}; se encontró ${show(t)}.`);
    if (v === '{') fail(`Se esperaba la llave de apertura «{»${what ? ' ' + what : ''}; se encontró ${show(t)}.`);
    fail(`Se esperaba «${v}»${what ? ' ' + what : ''}, pero se encontró ${show(t)}.`);
  }

  function checkUnsupported(t) {
    if (t.type === 'kw' && UNSUPPORTED_KW[t.value]) fail(UNSUPPORTED_KW[t.value], t);
    if (t.type === 'id' && t.value === 'String' && peek(1).type === 'id')
      fail('El tipo String (cadenas de texto) todavía no está admitido en el simulador.', t);
  }

  function isTypeStart(k = 0) {
    const t = peek(k);
    if (t.type === 'kw') return TYPE_WORDS.has(t.value) || QUALIFIERS.has(t.value);
    return t.type === 'id' && TYPE_WORDS.has(t.value) && (peek(k + 1).type === 'id' || peek(k + 1).value === '*');
  }

  /** Lee un tipo (con calificadores) y devuelve {type, isConst, pos}. */
  function parseType() {
    const start = peek();
    let isConst = false;
    while (peek().type === 'kw' && QUALIFIERS.has(peek().value)) { if (next().value === 'const') isConst = true; }
    const words = [];
    while (TYPE_WORDS.has(peek().value) && (peek().type === 'kw' || peek().type === 'id')) words.push(next().value);
    while (peek().type === 'kw' && QUALIFIERS.has(peek().value)) { if (next().value === 'const') isConst = true; }
    if (!words.length) fail(`Se esperaba un tipo de dato (int, float, bool…), pero se encontró ${show(peek())}.`);
    let name = words.join(' ');
    if (name === 'long long' || name === 'unsigned long long') fail('El tipo «long long» (64 bits) no está admitido en el simulador.', start);
    name = ALIASES[name] || name;
    if (!TYPES[name]) fail(`Tipo de dato no reconocido: «${words.join(' ')}».`, start);
    if (is('*') || is('&')) fail('Los punteros y referencias no están admitidos en el simulador.');
    return { type: name, isConst, pos: posOf(start) };
  }

  function ident(what) {
    const t = peek();
    if (t.type === 'id') return next();
    if (t.type === 'kw') fail(`«${t.value}» es una palabra reservada de C/C++ y no puede usarse como ${what}.`);
    if (t.type === 'num' && t.macro) fail(`«${t.macro}» está definido con #define y no puede usarse como ${what}.`);
    fail(`Se esperaba el nombre de ${what}, pero se encontró ${show(t)}.`);
  }

  // ---------- Nivel superior ----------
  function program() {
    const globals = [], functions = new Map(), items = [];
    while (peek().type !== 'eof') {
      checkUnsupported(peek());
      if (is(';')) { next(); continue; }
      if (!isTypeStart()) {
        const t = peek();
        if (t.type === 'id' && is('(', 1)) fail(`Falta el tipo de retorno de la función «${t.value}». Por ejemplo: void ${t.value}() { … }`);
        if (t.type === 'id' && t.value === 'String') fail('El tipo String (cadenas de texto) todavía no está admitido en el simulador.');
        if (t.type === 'id') fail(`Instrucción fuera de una función: «${t.value}…». Las instrucciones deben ir dentro de setup(), loop() u otra función.`);
        fail(`Se esperaba una declaración de variable o de función, pero se encontró ${show(t)}.`);
      }
      const ty = parseType();
      const nameTok = ident('una variable o función');
      if (is('(')) {
        const fn = funcRest(ty, nameTok);
        if (fn.prototype) continue;
        if (functions.has(fn.name))
          throw new CompileError(`La función «${fn.name}» está definida dos veces.`, fn.pos);
        functions.set(fn.name, fn); items.push(fn);
      } else {
        if (ty.type === 'void') fail(`Una variable no puede ser de tipo void («${nameTok.value}»).`, nameTok);
        const d = declRest(ty, nameTok);
        d.global = true;
        globals.push(d); items.push(d);
      }
    }
    return { kind: 'program', globals, functions, items };
  }

  function funcRest(ty, nameTok) {
    expect('(');
    const params = [];
    if (is('void') && is(')', 1)) next();
    else if (!is(')')) {
      do {
        if (!isTypeStart()) fail(`Se esperaba el tipo del parámetro (por ejemplo «int pin»), pero se encontró ${show(peek())}.`);
        const pt = parseType();
        const pn = ident('un parámetro');
        if (is('[')) fail('Los arrays como parámetro todavía no están admitidos (llegarán en la Fase 3).');
        if (is('=')) fail('Los valores por defecto en los parámetros no están admitidos en el simulador.');
        params.push({ type: pt.type, name: pn.value, pos: posOf(pn) });
      } while (accept(','));
    }
    expect(')', `de la función ${nameTok.value}()`);
    if (accept(';')) return { prototype: true };
    if (!is('{')) fail(`Se esperaba la llave «{» que abre el cuerpo de ${nameTok.value}(), pero se encontró ${show(peek())}.`);
    currentFunc = { name: nameTok.value, line: peek().line };
    const body = block(`de la función ${nameTok.value}()`);
    currentFunc = null;
    return { kind: 'func', name: nameTok.value, ret: ty.type, params, body, pos: posOf(nameTok), endLine: tokens[p - 1].line };
  }

  function declRest(ty, firstName) {
    const decls = [];
    let nameTok = firstName;
    for (;;) {
      if (is('[')) fail('Los arrays (vectores) todavía no están admitidos; llegarán en la Fase 3 del simulador.');
      let init = null;
      if (accept('=')) init = assignment();
      else if (ty.isConst) throw new CompileError(`La constante «${nameTok.value}» necesita un valor inicial (const ${ty.type} ${nameTok.value} = …;).`, posOf(nameTok));
      decls.push({ name: nameTok.value, init, pos: posOf(nameTok) });
      if (!accept(',')) break;
      nameTok = ident('una variable');
    }
    expect(';');
    return { kind: 'decl', type: ty.type, isConst: ty.isConst, decls, pos: ty.pos };
  }

  // ---------- Sentencias ----------
  function block(what = '') {
    const open = expect('{', what);
    const body = [];
    while (!is('}')) {
      if (peek().type === 'eof')
        throw new CompileError(`Falta la llave de cierre «}» ${what || 'del bloque'} que se abrió en la línea ${open.line}.`, posOf(open));
      body.push(statement());
    }
    next();
    return { kind: 'block', body, pos: posOf(open) };
  }

  function statement() {
    const t = peek();
    checkUnsupported(t);
    const pos = posOf(t);
    if (is('{')) return block();
    if (is(';')) { next(); return { kind: 'empty', pos }; }
    if (isTypeStart()) {
      const ty = parseType();
      const n = ident('una variable');
      if (is('(')) {
        if (currentFunc) fail(`Falta la llave «}» que cierra la función ${currentFunc.name}() (abierta en la línea ${currentFunc.line}) antes de empezar ${n.value}().`, n);
        fail(`No se puede definir la función «${n.value}» dentro de otra función. Las funciones se escriben fuera de setup() y loop().`, n);
      }
      if (ty.type === 'void') fail(`Una variable no puede ser de tipo void («${n.value}»).`, n);
      return declRest(ty, n);
    }
    if (t.type === 'kw') {
      switch (t.value) {
        case 'if': {
          next(); expect('(', 'después de if');
          const cond = expression();
          expect(')', 'de la condición del if');
          if (is(';')) warnEmpty(peek(), 'if');
          const then = statement();
          let otherwise = null;
          if (accept('else')) otherwise = statement();
          return { kind: 'if', cond, then, otherwise, pos };
        }
        case 'else':
          fail('«else» sin un «if» delante. Revisa las llaves: puede que haya un «;» o una «}» de más antes del else.');
        case 'while': {
          next(); expect('(', 'después de while');
          const cond = expression();
          expect(')', 'de la condición del while');
          if (is(';')) warnEmpty(peek(), 'while');
          return { kind: 'while', cond, body: statement(), pos };
        }
        case 'do': {
          next();
          const body = statement();
          expect('while', 'al final del bucle do');
          expect('('); const cond = expression(); expect(')', 'de la condición');
          expect(';');
          return { kind: 'dowhile', cond, body, pos };
        }
        case 'for': {
          next(); expect('(', 'después de for');
          let init = null;
          if (isTypeStart()) { const ty = parseType(); init = declRest(ty, ident('una variable')); }
          else if (!accept(';')) { init = { kind: 'expr', expr: expression(), pos: posOf(peek()) }; expect(';'); }
          const cond = is(';') ? null : expression();
          expect(';');
          const update = is(')') ? null : expression();
          expect(')', 'del for');
          if (is(';')) warnEmpty(peek(), 'for');
          return { kind: 'for', init, cond, update, body: statement(), pos };
        }
        case 'break': next(); expect(';'); return { kind: 'break', pos };
        case 'continue': next(); expect(';'); return { kind: 'continue', pos };
        case 'return': {
          next();
          const expr = is(';') ? null : expression();
          expect(';');
          return { kind: 'return', expr, pos };
        }
      }
    }
    const expr = expression();
    expect(';');
    return { kind: 'expr', expr, pos };
  }

  const emptyWarnings = [];
  let currentFunc = null;
  function warnEmpty(t, what) { emptyWarnings.push({ pos: posOf(t), what }); }

  // ---------- Expresiones ----------
  function expression() {
    const e = assignment();
    if (is(',')) fail('El operador coma no está admitido en el simulador. Escribe cada instrucción por separado, terminada en «;».');
    return e;
  }

  function assignment() {
    const left = conditional();
    if (peek().type === 'op' && ASSIGN_OPS.has(peek().value)) {
      const opTok = next();
      if (left.kind !== 'id') throw new CompileError(`A la izquierda de «${opTok.value}» debe haber una variable.`, posOf(opTok));
      const value = assignment();
      return { kind: 'assign', op: opTok.value, target: left, value, pos: posOf(opTok) };
    }
    return left;
  }

  function conditional() {
    const test = binary(0);
    if (is('?')) {
      const q = next();
      const a = assignment();
      expect(':', 'en el operador condicional « ? : »');
      const b = conditional();
      return { kind: 'cond', test, a, b, pos: posOf(q) };
    }
    return test;
  }

  function binary(level) {
    if (level >= BINARY_PREC.length) return unary();
    let left = binary(level + 1);
    while (peek().type === 'op' && BINARY_PREC[level].includes(peek().value)) {
      const opTok = next();
      const right = binary(level + 1);
      const kind = opTok.value === '&&' || opTok.value === '||' ? 'logic' : 'bin';
      left = { kind, op: opTok.value, l: left, r: right, pos: posOf(opTok) };
    }
    return left;
  }

  function unary() {
    const t = peek();
    if (t.type === 'op' && ['!', '-', '+', '~'].includes(t.value)) {
      next();
      return { kind: 'unary', op: t.value, e: unary(), pos: posOf(t) };
    }
    if (t.type === 'op' && (t.value === '++' || t.value === '--')) {
      next();
      const target = unary();
      if (target.kind !== 'id') throw new CompileError(`«${t.value}» solo se puede aplicar a una variable.`, posOf(t));
      return { kind: 'update', op: t.value, prefix: true, target, pos: posOf(t) };
    }
    if (t.type === 'op' && (t.value === '&' || t.value === '*')) fail('Los punteros no están admitidos en el simulador.');
    // Conversión de tipo: (int) x
    if (is('(') && isCastType(1)) {
      next();
      const ty = parseType();
      expect(')');
      return { kind: 'cast', type: ty.type, e: unary(), pos: posOf(t) };
    }
    return postfix();
  }

  function isCastType(k) {
    let j = k;
    const t = peek(j);
    if (!(TYPE_WORDS.has(t.value) && (t.type === 'kw' || t.type === 'id'))) return false;
    while (TYPE_WORDS.has(peek(j).value)) j++;
    return is(')', j);
  }

  function postfix() {
    let e = primary();
    for (;;) {
      const t = peek();
      if (is('++') || is('--')) {
        next();
        if (e.kind !== 'id') throw new CompileError(`«${t.value}» solo se puede aplicar a una variable.`, posOf(t));
        e = { kind: 'update', op: t.value, prefix: false, target: e, pos: posOf(t) };
      } else if (is('[')) {
        fail('Los arrays (vectores) todavía no están admitidos; llegarán en la Fase 3 del simulador.');
      } else break;
    }
    return e;
  }

  function primary() {
    const t = peek();
    checkUnsupported(t);
    if (t.type === 'num') {
      next();
      if (t.float) return { kind: 'num', value: t.suffix === 'f' ? Math.fround(t.value) : t.value, type: 'float', pos: posOf(t) };
      if (t.value > 4294967295) fail(`El número ${t.text} es demasiado grande: el mayor entero en Arduino UNO es 4294967295 (unsigned long).`, t);
      return { kind: 'num', value: t.value, type: t.char ? 'char' : literalType(t.value, t.suffix), pos: posOf(t) };
    }
    if (t.type === 'str') { next(); return { kind: 'str', value: t.value, pos: posOf(t) }; }
    if (t.type === 'kw' && (t.value === 'true' || t.value === 'false')) { next(); return { kind: 'num', value: t.value === 'true' ? 1 : 0, type: 'bool', pos: posOf(t) }; }
    if (t.type === 'id') {
      next();
      // Objeto.método(...), por ejemplo Serial.println(...)
      if (is('.')) {
        next();
        const m = ident('un método');
        if (!is('(')) fail(`Se esperaba «(» después de ${t.value}.${m.value}.`);
        return { kind: 'call', name: `${t.value}.${m.value}`, args: args(`${t.value}.${m.value}`), pos: posOf(t) };
      }
      if (is('::')) fail('El operador «::» no está admitido en el simulador.');
      if (is('(')) return { kind: 'call', name: t.value, args: args(t.value), pos: posOf(t) };
      return { kind: 'id', name: t.value, pos: posOf(t) };
    }
    if (is('(')) {
      next();
      const e = expression();
      expect(')');
      return e;
    }
    if (t.type === 'kw' && TYPE_WORDS.has(t.value) && is('(', 1))
      fail(`La conversión con forma de función «${t.value}(…)» no está admitida. Usa la forma de C: (${t.value}) valor.`);
    if (t.type === 'eof') fail('El programa termina de forma inesperada: probablemente falta cerrar una llave «}» o un paréntesis «)».');
    if (is('}') || is(')') || is(';')) fail(`Falta una expresión antes de ${show(t)}.`);
    fail(`No se esperaba ${show(t)} en este punto.`);
  }

  function args(name) {
    const open = expect('(');
    const list = [];
    if (!is(')')) {
      do {
        if (is(')')) fail('Falta un argumento después de la coma.');
        list.push(assignment());
      } while (accept(','));
    }
    if (!is(')')) {
      if (peek().type === 'eof' || is(';') || is('{') || is('}'))
        throw new CompileError(`Falta cerrar el paréntesis «)» de la llamada a ${name}().`, posOf(open));
      fail(`En la llamada a ${name}() los argumentos se separan con comas; se encontró ${show(peek())}.`);
    }
    next();
    return list;
  }

  const prog = program();
  prog.emptyWarnings = emptyWarnings;
  return prog;
}
