// Modelo eléctrico de la placa Arduino UNO R3 (ATmega328P).
// Guarda el estado de cada pin y un registro temporal de cambios para el cronograma y las comprobaciones.

export const PWM_PINS = new Set([3, 5, 6, 9, 10, 11]);
export const DIGITAL_PINS = Array.from({ length: 14 }, (_, i) => i);
export const ANALOG_PINS = [14, 15, 16, 17, 18, 19];

export const MODE_NAMES = ['INPUT', 'OUTPUT', 'INPUT_PULLUP'];

/** Nombre del pin como aparece serigrafiado en la placa. */
export function pinLabel(n) {
  return n >= 14 ? `A${n - 14}` : `D${n}`;
}

export class Board {
  constructor() {
    this.listeners = new Set();
    this.reset();
  }

  /** Equivale a pulsar RESET: todos los pines vuelven a entrada sin pull-up. */
  reset() {
    // mode: null (sin configurar = INPUT tras el arranque), 'INPUT', 'OUTPUT', 'INPUT_PULLUP'
    // latch: valor del registro PORT (en entrada, 1 activa la resistencia pull-up)
    this.pins = Array.from({ length: 20 }, () => ({ mode: null, latch: 0 }));
    this.byPin = Array.from({ length: 20 }, () => []);
    this.firstMode = Array.from({ length: 20 }, () => ({})); // instante de la primera vez en cada modo
    this.version = (this.version || 0) + 1;
    this.emit();
  }

  pinMode(pin, mode, t) {
    const p = this.pins[pin];
    p.mode = mode;
    if (mode === 'INPUT_PULLUP') p.latch = 1;
    else if (mode === 'INPUT') p.latch = 0;
    this.record(pin, t);
  }

  digitalWrite(pin, value, t) {
    const p = this.pins[pin];
    p.latch = value ? 1 : 0;
    this.record(pin, t);
  }

  record(pin, t) {
    const p = this.pins[pin];
    if (p.mode && !(p.mode in this.firstMode[pin])) this.firstMode[pin][p.mode] = t;
    // Solo se registran los cambios reales (como un analizador lógico)
    const prev = this.byPin[pin][this.byPin[pin].length - 1];
    if (prev && prev.mode === p.mode && prev.latch === p.latch) return;
    const drive = p.mode === 'OUTPUT' ? (p.latch ? 'high' : 'low') : p.latch ? 'pullup' : 'z';
    const ev = { t, pin, mode: p.mode, latch: p.latch, drive };
    this.byPin[pin].push(ev);
    if (this.byPin[pin].length > 60000) this.byPin[pin].splice(0, 30000);
    this.version = (this.version || 0) + 1; // la interfaz redibuja cuando cambia
  }

  /**
   * Estado eléctrico del pin.
   * drive: 'high' | 'low' | 'pullup' | 'z' (alta impedancia)
   */
  electrical(pin) {
    const p = this.pins[pin];
    if (p.mode === 'OUTPUT') return { drive: p.latch ? 'high' : 'low', volts: p.latch ? 5 : 0 };
    if (p.latch) return { drive: 'pullup', volts: 5 };
    return { drive: 'z', volts: null };
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) fn(this); }
}
