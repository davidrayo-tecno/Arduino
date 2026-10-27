// Errores del compilador y del intérprete, con posición en el código fuente.

export class ArduinoError extends Error {
  /**
   * @param {string} message  Mensaje en español, pensado para el alumnado.
   * @param {{line:number,col:number}|null} pos  Posición (1-based) en el código.
   * @param {'error'|'warning'|'info'} severity
   * @param {string} [hint]  Sugerencia opcional para corregirlo.
   */
  constructor(message, pos = null, severity = 'error', hint = '') {
    super(message);
    this.pos = pos;
    this.severity = severity;
    this.hint = hint;
  }
}

export class CompileError extends ArduinoError {}
export class RuntimeError extends ArduinoError {}

/** Distancia de edición (para sugerir nombres parecidos). */
export function editDistance(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}

/** Devuelve el nombre más parecido de la lista, o null si ninguno se parece lo suficiente. */
export function suggest(name, candidates) {
  let best = null, bestD = Infinity;
  for (const c of candidates) {
    if (c.toLowerCase() === name.toLowerCase()) return c; // solo cambia mayúsculas/minúsculas
    const d = editDistance(name, c);
    if (d < bestD) { bestD = d; best = c; }
  }
  const limit = Math.max(1, Math.floor(name.length / 3));
  return bestD <= limit ? best : null;
}
