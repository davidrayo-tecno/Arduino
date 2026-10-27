// Analizador léxico: convierte el texto del programa en una lista de tokens.
// También resuelve las directivas #define sencillas e ignora #include.
import { CompileError, ArduinoError } from './errors.js';

const PUNCT = [
  '<<=', '>>=',
  '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '==', '!=', '<=', '>=', '&&', '||', '<<', '>>', '->', '::',
  '+', '-', '*', '/', '%', '=', '<', '>', '!', '~', '&', '|', '^', '?', ':', ';', ',', '.', '(', ')', '{', '}', '[', ']',
];

export const KEYWORDS = new Set([
  'void', 'int', 'long', 'short', 'unsigned', 'signed', 'float', 'double', 'bool', 'boolean', 'byte', 'char', 'word',
  'const', 'static', 'volatile',
  'if', 'else', 'for', 'while', 'do', 'break', 'continue', 'return', 'switch', 'case', 'default', 'goto',
  'true', 'false', 'struct', 'class', 'enum', 'typedef', 'sizeof', 'new', 'delete',
]);

/**
 * @returns {{tokens: Array, warnings: ArduinoError[]}}
 */
export function tokenize(src) {
  const tokens = [];
  const warnings = [];
  const macros = new Map();
  let i = 0, line = 1, col = 1;
  let lineStart = true; // solo espacios desde el inicio de la línea

  const adv = (n = 1) => {
    for (let k = 0; k < n; k++) {
      if (src[i] === '\n') { line++; col = 1; lineStart = true; } else col++;
      i++;
    }
  };

  while (i < src.length) {
    const c = src[i];
    if (c === '\n' || c === ' ' || c === '\t' || c === '\r') { adv(); continue; }
    // Comentarios
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') adv(); continue; }
    if (c === '/' && src[i + 1] === '*') {
      const pos = { line, col };
      adv(2);
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) adv();
      if (i >= src.length) throw new CompileError('Comentario sin cerrar: falta «*/».', pos);
      adv(2); continue;
    }
    // Directivas del preprocesador
    if (c === '#' && lineStart) {
      const pos = { line, col };
      let text = '';
      while (i < src.length && src[i] !== '\n') { text += src[i]; adv(); }
      text = text.replace(/\/\/.*$/, '').trim();
      const m = /^#\s*(\w+)\s*(.*)$/.exec(text);
      const dir = m ? m[1] : '';
      if (dir === 'include') {
        warnings.push(new ArduinoError(`Se ignora «${text}»: el simulador no usa bibliotecas externas.`, pos, 'info'));
      } else if (dir === 'define') {
        const dm = /^([A-Za-z_]\w*)(\s+(.*))?$/.exec(m[2]);
        if (!dm) throw new CompileError('#define mal escrito. Forma correcta: #define NOMBRE valor', pos);
        if (/^[A-Za-z_]\w*\(/.test(m[2])) throw new CompileError('Las macros con parámetros (#define F(x) ...) no están admitidas en el simulador.', pos);
        const body = (dm[3] || '').trim();
        if (body.endsWith(';')) warnings.push(new ArduinoError(`El #define de «${dm[1]}» termina en «;». Un #define no lleva punto y coma: se copiará tal cual allí donde uses el nombre.`, pos, 'warning'));
        const sub = body ? tokenize(body).tokens.filter(t => t.type !== 'eof').map(t => ({ ...t, line: pos.line, col: pos.col })) : [];
        macros.set(dm[1], sub);
      } else {
        throw new CompileError(`La directiva «#${dir}» no está admitida en el simulador.`, pos);
      }
      continue;
    }
    lineStart = false;
    const pos = { line, col };

    // Números
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      let s = '';
      if (c === '0' && /[xX]/.test(src[i + 1])) {
        s = '0x'; adv(2);
        while (/[0-9a-fA-F]/.test(src[i] || '')) { s += src[i]; adv(); }
        if (s === '0x') throw new CompileError('Número hexadecimal incompleto.', pos);
        const suf = readSuffix();
        tokens.push({ type: 'num', value: parseInt(s, 16), float: false, suffix: suf, text: s + suf, ...pos });
        continue;
      }
      if (c === '0' && /[bB]/.test(src[i + 1])) {
        s = '0b'; adv(2);
        while (/[01]/.test(src[i] || '')) { s += src[i]; adv(); }
        if (s === '0b') throw new CompileError('Número binario incompleto.', pos);
        const suf = readSuffix();
        tokens.push({ type: 'num', value: parseInt(s.slice(2), 2), float: false, suffix: suf, text: s + suf, ...pos });
        continue;
      }
      let isFloat = false;
      while (/[0-9]/.test(src[i] || '')) { s += src[i]; adv(); }
      if (src[i] === '.') { isFloat = true; s += '.'; adv(); while (/[0-9]/.test(src[i] || '')) { s += src[i]; adv(); } }
      if (/[eE]/.test(src[i] || '') && /[-+0-9]/.test(src[i + 1] || '')) {
        isFloat = true; s += src[i]; adv();
        if (/[-+]/.test(src[i])) { s += src[i]; adv(); }
        while (/[0-9]/.test(src[i] || '')) { s += src[i]; adv(); }
      }
      let suf = '';
      if (isFloat && /[fF]/.test(src[i] || '')) { suf = 'f'; adv(); } else if (!isFloat) suf = readSuffix();
      if (/[A-Za-z_]/.test(src[i] || '')) throw new CompileError(`Número mal escrito: «${s}${src[i]}…».`, pos);
      // En C, un 0 inicial indica octal: 010 vale 8. Avisamos porque suele ser un despiste.
      let value = isFloat ? parseFloat(s) : parseInt(s, 10);
      if (!isFloat && s.length > 1 && s[0] === '0') {
        if (/[89]/.test(s)) throw new CompileError(`«${s}» no es válido: un número que empieza por 0 se interpreta en octal (solo dígitos 0-7).`, pos);
        value = parseInt(s, 8);
        warnings.push(new ArduinoError(`«${s}» empieza por 0, así que C lo interpreta en octal y vale ${value}. Si querías el número decimal, quita el 0 inicial.`, pos, 'warning'));
      }
      tokens.push({ type: 'num', value, float: isFloat, suffix: suf, text: s + suf, ...pos });
      continue;
    }
    // Identificadores y palabras clave
    if (/[A-Za-z_]/.test(c)) {
      let s = '';
      while (/[A-Za-z0-9_]/.test(src[i] || '')) { s += src[i]; adv(); }
      if (macros.has(s)) {
        for (const t of expandMacro(s, pos, 0)) tokens.push(t);
        continue;
      }
      tokens.push({ type: KEYWORDS.has(s) ? 'kw' : 'id', value: s, text: s, ...pos });
      continue;
    }
    // Cadenas
    if (c === '"') {
      adv();
      let s = '';
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\n') throw new CompileError('Cadena de texto sin cerrar: falta la comilla doble «"» final.', pos);
        if (src[i] === '\\') { adv(); s += escape(src[i]); adv(); continue; }
        s += src[i]; adv();
      }
      if (i >= src.length) throw new CompileError('Cadena de texto sin cerrar: falta la comilla doble «"» final.', pos);
      adv();
      tokens.push({ type: 'str', value: s, text: JSON.stringify(s), ...pos });
      continue;
    }
    if (c === "'") {
      adv();
      let ch = src[i];
      if (ch === '\\') { adv(); ch = escape(src[i]); }
      adv();
      if (src[i] !== "'") throw new CompileError("Carácter mal escrito: entre comillas simples va un único carácter, por ejemplo 'A'. Para textos usa comillas dobles.", pos);
      adv();
      tokens.push({ type: 'num', value: (ch || '\0').charCodeAt(0), float: false, suffix: '', char: true, text: `'${ch}'`, ...pos });
      continue;
    }
    // Signos de puntuación y operadores
    const p = PUNCT.find(op => src.startsWith(op, i));
    if (p) { adv(p.length); tokens.push({ type: 'op', value: p, text: p, ...pos }); continue; }

    if (c === '“' || c === '”' || c === '‘' || c === '’')
      throw new CompileError(`Comillas tipográficas «${c}» no válidas. Usa las comillas rectas del teclado (" o ').`, pos);
    throw new CompileError(`Carácter no válido en el programa: «${c}».`, pos);
  }
  tokens.push({ type: 'eof', value: '', text: 'fin del programa', line, col });
  return { tokens, warnings };

  function readSuffix() {
    let s = '';
    while (/[uUlL]/.test(src[i] || '')) { s += src[i]; adv(); }
    return s.toUpperCase();
  }
  function escape(ch) {
    return ({ n: '\n', t: '\t', r: '\r', '0': '\0', '\\': '\\', '"': '"', "'": "'" })[ch] ?? ch;
  }
  function expandMacro(name, pos, depth) {
    if (depth > 20) throw new CompileError(`El #define «${name}» se usa a sí mismo de forma circular.`, pos);
    const out = [];
    for (const t of macros.get(name)) {
      if (t.type === 'id' && macros.has(t.value)) out.push(...expandMacro(t.value, pos, depth + 1));
      else out.push({ ...t, line: pos.line, col: pos.col, macro: name });
    }
    return out;
  }
}
