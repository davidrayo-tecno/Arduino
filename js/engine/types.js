// Tipos de datos de Arduino UNO (microcontrolador AVR de 8 bits).
// En el UNO, int ocupa 16 bits y double es igual que float (32 bits).

export const TYPES = {
  void:            { name: 'void' },
  bool:            { name: 'bool',          int: true, bits: 1,  signed: false, rank: 0 },
  char:            { name: 'char',          int: true, bits: 8,  signed: true,  rank: 1 },
  byte:            { name: 'byte',          int: true, bits: 8,  signed: false, rank: 1 },
  int:             { name: 'int',           int: true, bits: 16, signed: true,  rank: 2 },
  'unsigned int':  { name: 'unsigned int',  int: true, bits: 16, signed: false, rank: 3 },
  long:            { name: 'long',          int: true, bits: 32, signed: true,  rank: 4 },
  'unsigned long': { name: 'unsigned long', int: true, bits: 32, signed: false, rank: 5 },
  float:           { name: 'float',         int: false, bits: 32, rank: 6 },
};

/** Sinónimos admitidos y su tipo equivalente en el UNO. */
export const ALIASES = {
  boolean: 'bool', double: 'float', word: 'unsigned int', short: 'int',
  uint8_t: 'byte', int8_t: 'char', int16_t: 'int', uint16_t: 'unsigned int', int32_t: 'long', uint32_t: 'unsigned long',
  'unsigned char': 'byte', 'signed char': 'char', 'unsigned short': 'unsigned int', 'signed int': 'int', 'signed long': 'long',
  unsigned: 'unsigned int', signed: 'int', 'long int': 'long', 'unsigned long int': 'unsigned long', 'short int': 'int',
};

export const TYPE_WORDS = new Set(['void', 'int', 'long', 'short', 'unsigned', 'signed', 'float', 'double', 'bool', 'boolean', 'byte', 'char', 'word',
  'uint8_t', 'int8_t', 'int16_t', 'uint16_t', 'int32_t', 'uint32_t']);

/** Convierte un valor JS al rango del tipo indicado, como lo haría el UNO (desbordamiento incluido). */
export function convert(v, typeName) {
  const t = TYPES[typeName];
  if (!t || t.name === 'void') return 0;
  if (t.name === 'bool') return v ? 1 : 0;
  if (!t.int) return Math.fround(v);
  if (!Number.isFinite(v)) v = 0; // comportamiento indefinido en C: usamos 0
  let x = Math.trunc(v);
  const mod = 2 ** t.bits;
  x = ((x % mod) + mod) % mod;
  if (t.signed && x >= mod / 2) x -= mod;
  return x;
}

/** Tipo resultante de una operación aritmética entre dos tipos (conversiones aritméticas habituales de C). */
export function arithType(a, b) {
  const pa = promote(a), pb = promote(b);
  return TYPES[pa].rank >= TYPES[pb].rank ? pa : pb;
}

/** Promoción entera: bool, char y byte se convierten en int antes de operar. */
export function promote(t) {
  return TYPES[t].int && TYPES[t].rank < 2 ? 'int' : t;
}

/** Tipo de un literal entero según su valor y sufijo. */
export function literalType(value, suffix) {
  const u = suffix.includes('U'), l = suffix.includes('L');
  if (!l && !u && value <= 32767) return 'int';
  if (!l && u && value <= 65535) return 'unsigned int';
  if (!u && value <= 2147483647) return 'long';
  return 'unsigned long';
}

export function rangeOf(typeName) {
  const t = TYPES[typeName];
  if (!t.int) return null;
  if (t.name === 'bool') return [0, 1];
  return t.signed ? [-(2 ** (t.bits - 1)), 2 ** (t.bits - 1) - 1] : [0, 2 ** t.bits - 1];
}
