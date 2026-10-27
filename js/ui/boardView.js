// Zona de montaje: dibujo SVG de Arduino UNO R3, protoboard, resistencia, LED y cables.
import { PWM_PINS, MODE_NAMES, pinLabel } from '../model/board.js';

const NS = 'http://www.w3.org/2000/svg';
const P = 14.2; // paso de 2,54 mm a escala

// Posición (centro) de cada pin de los conectores
const TOP_Y = 58, BOT_Y = 322;
const D0_X = 386, D7_X = D0_X - 7 * P, D8_X = D7_X - 22.76;
export const PIN_X = {};
for (let i = 0; i <= 7; i++) PIN_X[i] = D0_X - i * P;
for (let i = 8; i <= 13; i++) PIN_X[i] = D8_X - (i - 8) * P;
const TOP_EXTRA = [['GND', D8_X - 6 * P], ['AREF', D8_X - 7 * P], ['SDA', D8_X - 8 * P], ['SCL', D8_X - 9 * P]];
const A0_X = 315;
for (let i = 0; i < 6; i++) PIN_X[14 + i] = A0_X + i * P;
const POWER = ['', 'IOREF', 'RESET', '3.3V', '5V', 'GND', 'GND', 'Vin'];
const POWER_X = POWER.map((_, i) => A0_X - 2 * P - (7 - i) * P);

// Protoboard
const BB = { x: 470, y: 64, cols: 19, c0: 492, dx: 16, rowsA: [118, 134, 150, 166, 182], rowsF: [222, 238, 254, 270, 286] };
const col = c => BB.c0 + c * BB.dx;
const R_COLS = [3, 7], LED_COLS = [7, 9], GND_COL = 9, ROW_WIRE = BB.rowsA[0], ROW_R = BB.rowsA[2], ROW_LED = BB.rowsA[4];

function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}
function text(parent, x, y, s, attrs = {}) { const t = el('text', { x, y, ...attrs }, parent); t.textContent = s; return t; }

export class BoardView {
  /** @param {HTMLElement} root */
  constructor(root, { onPinFocus } = {}) {
    this.onPinFocus = onPinFocus || (() => {});
    this.svg = el('svg', { viewBox: '0 0 820 380', class: 'board-svg', role: 'img', 'aria-labelledby': 'board-title board-desc' });
    text(this.svg, 0, 0, '', {}).remove();
    const title = el('title', { id: 'board-title' }, this.svg); title.textContent = 'Montaje: Arduino UNO R3 con un LED y una resistencia en la protoboard';
    this.desc = el('desc', { id: 'board-desc' }, this.svg);
    this.defs();
    this.drawBoard();
    this.drawBreadboard();
    this.wires = el('g', { class: 'wires' }, this.svg);
    this.drawComponents();
    root.appendChild(this.svg);
    this.ledPin = null;
    this.last = '';
  }

  defs() {
    const d = el('defs', {}, this.svg);
    const g = el('radialGradient', { id: 'glow' }, d);
    el('stop', { offset: '0%', 'stop-color': '#ff4d3d', 'stop-opacity': '0.95' }, g);
    el('stop', { offset: '45%', 'stop-color': '#ff3b2f', 'stop-opacity': '0.45' }, g);
    el('stop', { offset: '100%', 'stop-color': '#ff3b2f', 'stop-opacity': '0' }, g);
    const g2 = el('radialGradient', { id: 'glowL' }, d);
    el('stop', { offset: '0%', 'stop-color': '#ffb347', 'stop-opacity': '1' }, g2);
    el('stop', { offset: '100%', 'stop-color': '#ffb347', 'stop-opacity': '0' }, g2);
    const g3 = el('radialGradient', { id: 'glowOn' }, d);
    el('stop', { offset: '0%', 'stop-color': '#7dff8a', 'stop-opacity': '1' }, g3);
    el('stop', { offset: '100%', 'stop-color': '#7dff8a', 'stop-opacity': '0' }, g3);
  }

  drawBoard() {
    const b = el('g', { class: 'uno' }, this.svg);
    // Placa (68,6 × 53,3 mm)
    el('path', { d: 'M30 40 H394 a10 10 0 0 1 10 10 V96 l8 8 V300 l-8 8 V328 a10 10 0 0 1 -10 10 H30 a10 10 0 0 1 -10 -10 V50 a10 10 0 0 1 10 -10 Z', class: 'pcb' }, b);
    for (const [x, y] of [[100, 52], [381, 52], [380, 326], [96, 326]]) el('circle', { cx: x, cy: y, r: 5.5, class: 'hole' }, b);
    // Conector USB-B y jack de alimentación
    el('rect', { x: 4, y: 74, width: 62, height: 52, rx: 3, class: 'usb' }, b);
    el('rect', { x: 10, y: 84, width: 40, height: 32, rx: 2, class: 'usb-in' }, b);
    text(b, 35, 140, 'USB', { class: 'silk-s', 'text-anchor': 'middle' });
    el('rect', { x: 8, y: 252, width: 54, height: 50, rx: 4, class: 'jack' }, b);
    el('circle', { cx: 30, cy: 277, r: 9, class: 'jack-in' }, b);
    text(b, 35, 316, '7-12 V', { class: 'silk-s', 'text-anchor': 'middle' });
    // Pulsador RESET
    el('rect', { x: 34, y: 46, width: 22, height: 22, rx: 2, class: 'btn' }, b);
    el('circle', { cx: 45, cy: 57, r: 6.5, class: 'btn-cap' }, b);
    text(b, 66, 61, 'RESET', { class: 'silk-s' });
    // Cristal de 16 MHz
    el('rect', { x: 136, y: 196, width: 34, height: 14, rx: 7, class: 'xtal' }, b);
    text(b, 153, 222, '16 MHz', { class: 'silk-s', 'text-anchor': 'middle' });
    // Microcontrolador ATmega328P (DIP-28)
    for (let i = 0; i < 14; i++) {
      el('rect', { x: 190 + i * P - 3, y: 206, width: 6, height: 6, class: 'leg' }, b);
      el('rect', { x: 190 + i * P - 3, y: 240, width: 6, height: 6, class: 'leg' }, b);
    }
    el('rect', { x: 178, y: 211, width: 210, height: 30, rx: 2, class: 'chip' }, b);
    el('circle', { cx: 186, cy: 226, r: 3.5, class: 'chip-notch' }, b);
    text(b, 283, 230, 'ATMEGA328P', { class: 'chip-t', 'text-anchor': 'middle' });
    // ICSP
    for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) el('rect', { x: 389 + c * 9, y: 176 + r * 9, width: 7, height: 7, class: 'icsp' }, b);
    text(b, 384, 172, 'ICSP', { class: 'silk-s', 'text-anchor': 'end' });
    // Rótulos
    text(b, 250, 176, 'UNO', { class: 'silk-big', 'text-anchor': 'middle' });
    text(b, 302, 176, 'R3', { class: 'silk-m' });
    text(b, 290, 112, 'DIGITAL (PWM ~)', { class: 'silk-m', 'text-anchor': 'middle' });
    text(b, 244, 266, 'POWER', { class: 'silk-m', 'text-anchor': 'middle' });
    text(b, 350, 266, 'ANALOG IN', { class: 'silk-m', 'text-anchor': 'middle' });

    // LED de la placa: ON, L, TX, RX
    this.ledL = this.boardLed(b, 158, 136, 'L', 'glowL', 'led-l');
    this.boardLed(b, 158, 152, 'TX', null, 'led-tx');
    this.boardLed(b, 158, 168, 'RX', null, 'led-rx');
    const on = this.boardLed(b, 370, 136, 'ON', 'glowOn', 'led-on');
    on.glow.setAttribute('opacity', '0.9'); on.body.classList.add('lit');

    // Conectores hembra
    const hdr = (x1, x2, y) => el('rect', { x: x1 - 8, y: y - 8, width: x2 - x1 + 16, height: 16, rx: 1.5, class: 'header' }, b);
    hdr(TOP_EXTRA[3][1], D8_X, TOP_Y);
    hdr(D7_X, D0_X, TOP_Y);
    hdr(POWER_X[0], POWER_X[7], BOT_Y);
    hdr(PIN_X[14], PIN_X[19], BOT_Y);

    this.pinEls = {};
    for (let n = 0; n <= 19; n++) {
      const x = PIN_X[n], y = n >= 14 ? BOT_Y : TOP_Y;
      const g = el('g', { class: 'pin' + (PWM_PINS.has(n) ? ' pwm' : ''), tabindex: '0', role: 'button', 'data-pin': n }, b);
      el('rect', { x: x - 5, y: y - 5, width: 10, height: 10, rx: 1, class: 'pin-hole' }, g);
      const label = n >= 14 ? `A${n - 14}` : n === 0 ? 'RX←0' : n === 1 ? 'TX→1' : (PWM_PINS.has(n) ? '~' : '') + n;
      if (n >= 14) text(g, x, y - 18, label, { class: 'silk-pin', transform: `rotate(-90 ${x} ${y - 18})` });
      else text(g, x, y + 18, label, { class: 'silk-pin end', transform: `rotate(-90 ${x} ${y + 18})` });
      const t = el('title', {}, g);
      g.addEventListener('focus', () => this.onPinFocus(n));
      g.addEventListener('mouseenter', () => this.onPinFocus(n));
      this.pinEls[n] = { g, t };
    }
    for (const [name, x] of TOP_EXTRA) {
      const g = el('g', { class: 'pin fixed' + (name === 'GND' ? ' gnd' : '') }, b);
      el('rect', { x: x - 5, y: TOP_Y - 5, width: 10, height: 10, rx: 1, class: 'pin-hole' }, g);
      text(g, x, TOP_Y + 18, name, { class: 'silk-pin end', transform: `rotate(-90 ${x} ${TOP_Y + 18})` });
      el('title', {}, g).textContent = name === 'GND' ? 'GND: tierra (0 V)' : name === 'AREF' ? 'AREF: referencia de tensión analógica' : `${name}: bus I²C`;
    }
    POWER.forEach((name, i) => {
      const x = POWER_X[i];
      const g = el('g', { class: 'pin fixed' + (name === 'GND' ? ' gnd' : name === '5V' || name === '3.3V' ? ' vcc' : '') }, b);
      el('rect', { x: x - 5, y: BOT_Y - 5, width: 10, height: 10, rx: 1, class: 'pin-hole' }, g);
      if (name) text(g, x, BOT_Y - 18, name, { class: 'silk-pin', transform: `rotate(-90 ${x} ${BOT_Y - 18})` });
      const tips = { IOREF: 'IOREF: tensión de trabajo de la placa (5 V)', RESET: 'RESET: a 0 V reinicia el microcontrolador', '3.3V': '3,3 V: salida de alimentación (máx. 50 mA)', '5V': '5 V: salida de alimentación', GND: 'GND: tierra (0 V)', Vin: 'Vin: entrada de alimentación externa (7-12 V)' };
      el('title', {}, g).textContent = tips[name] || 'Sin conexión';
    });
  }

  boardLed(parent, x, y, label, glowId, cls) {
    const glow = glowId ? el('circle', { cx: x, cy: y, r: 13, fill: `url(#${glowId})`, opacity: 0, class: 'glow' }, parent) : null;
    const body = el('rect', { x: x - 6, y: y - 3.5, width: 12, height: 7, rx: 1, class: 'smd ' + cls }, parent);
    text(parent, x + 11, y + 3.5, label, { class: 'silk-s' });
    return { glow, body };
  }

  drawBreadboard() {
    const g = el('g', { class: 'bb' }, this.svg);
    el('rect', { x: BB.x, y: BB.y, width: 336, height: 272, rx: 8, class: 'bb-body' }, g);
    el('rect', { x: BB.x + 6, y: 196, width: 324, height: 10, rx: 3, class: 'bb-gap' }, g);
    // Raíles de alimentación
    for (const [y, sign, cls] of [[78, '+', 'rail-p'], [92, '−', 'rail-n'], [304, '+', 'rail-p'], [318, '−', 'rail-n']]) {
      el('line', { x1: BB.x + 14, x2: BB.x + 322, y1: y - 7, y2: y - 7, class: cls }, g);
      text(g, BB.x + 9, y + 4, sign, { class: 'bb-sign', 'text-anchor': 'middle' });
      for (let c = 0; c < BB.cols; c++) if (c % 5 !== 4) el('rect', { x: col(c) - 2.5, y: y - 2.5, width: 5, height: 5, class: 'bb-hole' }, g);
    }
    const rows = 'abcde', rows2 = 'fghij';
    BB.rowsA.forEach((y, r) => {
      text(g, BB.x + 9, y + 3.5, rows[r], { class: 'bb-l', 'text-anchor': 'middle' });
      for (let c = 0; c < BB.cols; c++) el('rect', { x: col(c) - 2.5, y: y - 2.5, width: 5, height: 5, class: 'bb-hole' }, g);
    });
    BB.rowsF.forEach((y, r) => {
      text(g, BB.x + 9, y + 3.5, rows2[r], { class: 'bb-l', 'text-anchor': 'middle' });
      for (let c = 0; c < BB.cols; c++) el('rect', { x: col(c) - 2.5, y: y - 2.5, width: 5, height: 5, class: 'bb-hole' }, g);
    });
    for (let c = 0; c < BB.cols; c += 5) text(g, col(c), 110, String(c + 1), { class: 'bb-l', 'text-anchor': 'middle' });
  }

  drawComponents() {
    const g = el('g', { class: 'parts' }, this.svg);
    // Resistencia 220 Ω (rojo, rojo, marrón, oro)
    const [r1, r2] = R_COLS.map(col);
    el('path', { d: `M${r1} ${ROW_R} H${r2}`, class: 'lead' }, g);
    el('rect', { x: r1 + 12, y: ROW_R - 7, width: r2 - r1 - 24, height: 14, rx: 7, class: 'res-body' }, g);
    [['#c0392b', 10], ['#c0392b', 18], ['#7b4a1e', 26], ['#c9a227', r2 - r1 - 34]].forEach(([c, dx]) =>
      el('rect', { x: r1 + 12 + dx, y: ROW_R - 7, width: 4, height: 14, fill: c }, g));
    text(g, (r1 + r2) / 2 - 4, ROW_R - 12, '220 Ω', { class: 'part-l', 'text-anchor': 'middle' });
    el('title', {}, g).textContent = 'Resistencia de 220 Ω (rojo, rojo, marrón, oro)';
    // LED rojo: ánodo en la columna de la resistencia, cátodo en la del cable de GND
    const [a, k] = LED_COLS.map(col);
    const lg = el('g', { class: 'led' }, this.svg);
    el('path', { d: `M${a} ${ROW_LED} V${ROW_LED - 26}`, class: 'lead' }, lg);
    el('path', { d: `M${k} ${ROW_LED} V${ROW_LED - 22} `, class: 'lead' }, lg);
    this.ledGlow = el('circle', { cx: (a + k) / 2, cy: ROW_LED - 44, r: 40, fill: 'url(#glow)', opacity: 0 }, lg);
    el('path', { d: `M${a - 4} ${ROW_LED - 24} H${k + 6} V${ROW_LED - 30} H${a - 4} Z`, class: 'led-rim' }, lg);
    this.ledBody = el('path', { d: `M${a - 1} ${ROW_LED - 30} V${ROW_LED - 46} a${(k - a) / 2 + 1} ${(k - a) / 2 + 1} 0 0 1 ${k - a + 2} 0 V${ROW_LED - 30} Z`, class: 'led-body' }, lg);
    text(lg, k + 12, ROW_LED - 36, 'LED', { class: 'part-l' });
    text(lg, a - 2, ROW_LED + 15, '+', { class: 'part-s', 'text-anchor': 'middle' });
    text(lg, k + 2, ROW_LED + 15, '−', { class: 'part-s', 'text-anchor': 'middle' });
    this.ledTitle = el('title', {}, lg);
  }

  /** Redibuja el cable de señal cuando cambia el pin al que se conecta el LED. */
  setLedPin(pin) {
    if (pin === this.ledPin) return;
    this.ledPin = pin;
    this.wires.innerHTML = '';
    const px = PIN_X[pin];
    const r1 = col(R_COLS[0]), kx = col(GND_COL);
    // GND (negro): conector GND superior → columna del cátodo
    const gx = TOP_EXTRA[0][1];
    this.gndWire = el('path', { d: `M${gx} ${TOP_Y} V22 Q${gx} 14 ${gx + 8} 14 H${kx - 8} Q${kx} 14 ${kx} 22 V${ROW_WIRE}`, class: 'wire gnd' }, this.wires);
    // Señal (naranja): pin → columna de la resistencia
    this.sigWire = el('path', { d: `M${px} ${TOP_Y} V36 Q${px} 30 ${px + 6} 30 H${r1 - 6} Q${r1} 30 ${r1} 36 V${ROW_WIRE}`, class: 'wire sig' }, this.wires);
    for (const [x, y] of [[px, TOP_Y], [gx, TOP_Y], [r1, ROW_WIRE], [kx, ROW_WIRE]]) el('circle', { cx: x, cy: y, r: 3.2, class: 'wire-end' }, this.wires);
    // La pata de la resistencia baja a su fila
    el('path', { d: `M${r1} ${ROW_WIRE} V${ROW_R}`, class: 'jumper' }, this.wires);
    el('path', { d: `M${kx} ${ROW_WIRE} V${ROW_LED}`, class: 'jumper' }, this.wires);
    this.desc.textContent = `El pin D${pin} se conecta con un cable naranja a una resistencia de 220 ohmios; la resistencia va al ánodo del LED rojo y el cátodo vuelve a GND con un cable negro.`;
  }

  /**
   * @param {import('../model/board.js').Board} board
   * @param {{mA:number,brightness:number,state:string}} led
   */
  update(board, led) {
    for (let n = 0; n <= 19; n++) {
      const p = board.pins[n];
      const e = board.electrical(n);
      const state = p.mode === 'OUTPUT' ? (p.latch ? 'high' : 'low') : (p.latch ? 'pullup' : p.mode ? 'input' : 'unset');
      const { g, t } = this.pinEls[n];
      if (g.dataset.state !== state) g.dataset.state = state;
      const modeTxt = p.mode ? p.mode : 'sin configurar (entrada)';
      const lvl = e.drive === 'high' ? 'HIGH · 5 V' : e.drive === 'low' ? 'LOW · 0 V' : e.drive === 'pullup' ? 'pull-up activada' : 'alta impedancia';
      const txt = `${pinLabel(n)}${PWM_PINS.has(n) ? ' (PWM ~)' : ''} · ${modeTxt} · ${lvl}`;
      if (t.textContent !== txt) { t.textContent = txt; g.setAttribute('aria-label', txt); }
    }
    // LED externo
    const b = led.brightness;
    this.ledGlow.setAttribute('opacity', (b > 0 ? 0.25 + 0.75 * Math.sqrt(b) : 0).toFixed(3));
    this.ledBody.style.setProperty('--lit', Math.sqrt(b).toFixed(3));
    this.ledBody.classList.toggle('lit', led.state !== 'off');
    this.ledTitle.textContent = `LED rojo: ${led.state === 'on' ? 'encendido' : led.state === 'dim' ? 'brillo muy débil' : 'apagado'} · ${led.mA.toFixed(2).replace('.', ',')} mA`;
    this.sigWire.classList.toggle('active', led.state !== 'off');
    this.gndWire.classList.toggle('active', led.state !== 'off');
    // LED «L» de la placa (pin 13, con su propio amplificador separador)
    const e13 = board.electrical(13);
    const lOn = e13.drive === 'high' || (e13.drive === 'pullup' && this.ledPin !== 13);
    this.ledL.glow.setAttribute('opacity', lOn ? '1' : '0');
    this.ledL.body.classList.toggle('lit', lOn);
  }
}

export { MODE_NAMES };
