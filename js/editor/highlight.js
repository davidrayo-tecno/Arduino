// Resaltado de sintaxis para el editor (solo visual; no interviene en la compilación).
import { BUILTINS, CONSTANTS } from '../engine/builtins.js';

const TYPES = /^(void|int|long|short|unsigned|signed|float|double|bool|boolean|byte|char|word|const|static|volatile|uint8_t|int8_t|int16_t|uint16_t|int32_t|uint32_t|String)$/;
const CONTROL = /^(if|else|for|while|do|break|continue|return|switch|case|default|goto)$/;
const LITERALS = /^(true|false)$/;
const FUNCS = new Set(Object.keys(BUILTINS).filter(n => !n.includes('.')).concat(['setup', 'loop']));
const CONSTS = new Set(Object.keys(CONSTANTS));

const RE = /(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|("(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?)|(^[ \t]*#[^\n]*)|(\b0[xX][0-9a-fA-F]+[uUlL]*\b|\b0[bB][01]+\b|\b\d+\.?\d*(?:[eE][-+]?\d+)?[fFuUlL]*\b|\.\d+\b)|(\bSerial\b)|([A-Za-z_]\w*)/gm;

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function highlight(src) {
  let out = '', last = 0;
  src.replace(RE, (m, com, str, pre, num, serial, id, offset) => {
    out += esc(src.slice(last, offset));
    last = offset + m.length;
    let cls = null;
    if (com) cls = 'com';
    else if (str) cls = 'str';
    else if (pre) cls = 'pre';
    else if (num) cls = 'num';
    else if (serial) cls = 'fn';
    else if (id) {
      if (TYPES.test(id)) cls = 'type';
      else if (CONTROL.test(id)) cls = 'kw';
      else if (LITERALS.test(id) || CONSTS.has(id)) cls = 'const';
      else if (FUNCS.has(id)) cls = 'fn';
    }
    out += cls ? `<span class="tk-${cls}">${esc(m)}</span>` : esc(m);
    return m;
  });
  out += esc(src.slice(last));
  return out;
}
