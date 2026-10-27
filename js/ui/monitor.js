// Monitor de simulación: estado de la ejecución, valores de los pines y cronograma (analizador lógico).
import { pinLabel, PWM_PINS } from '../model/board.js';
import { R_SERIE, LED_VF } from '../model/circuit.js';

const fmtTime = ms => {
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(3).replace('.', ',')} s` : `${Math.floor(s / 60)} min ${(s % 60).toFixed(1).replace('.', ',')} s`;
};

export class Monitor {
  constructor(root) {
    this.root = root;
    this.$ = sel => root.querySelector(sel);
    this.canvas = this.$('#scope');
    this.ctx = this.canvas.getContext('2d');
    this.windowMs = 4000;
    this.grid = this.$('#pin-grid');
    this.cells = [];
    for (let n = 0; n <= 19; n++) {
      const c = document.createElement('div');
      c.className = 'pcell';
      c.dataset.pin = n;
      c.innerHTML = `<b>${n >= 14 ? 'A' + (n - 14) : (PWM_PINS.has(n) ? '~' : '') + n}</b><span>—</span>`;
      this.grid.appendChild(c);
      this.cells.push(c);
    }
    this.$('#scope-window').addEventListener('change', e => { this.windowMs = +e.target.value; });
  }

  /**
   * @param {{board, machine, led, ledPin, runState, behind}} s
   */
  update(s) {
    const { board, machine, led, ledPin } = s;
    const time = machine ? machine.time : 0;
    this.$('#m-time').textContent = fmtTime(time);
    this.$('#m-loops').textContent = machine && machine.phase === 'loop' ? machine.loopCount.toLocaleString('es-ES') : '—';
    this.$('#m-phase').textContent = !machine ? '—' : machine.phase === 'loop' ? 'loop()' : machine.phase === 'setup' ? 'setup()' : 'inicio';
    this.$('#m-line').textContent = machine && machine.line && s.runState !== 'idle' ? machine.line : '—';
    this.$('#m-delay').textContent = machine && machine.wakeAt !== null && s.runState === 'running'
      ? `delay(): quedan ${Math.max(0, Math.ceil(machine.wakeAt - time)).toLocaleString('es-ES')} ms` : '';
    this.$('#m-behind').hidden = !s.behind;

    // LED externo
    const p = board.pins[ledPin], e = board.electrical(ledPin);
    this.$('#led-pin').textContent = pinLabel(ledPin);
    this.$('#led-mode').textContent = p.mode || 'sin configurar';
    this.$('#led-level').textContent = e.drive === 'high' ? 'HIGH' : e.drive === 'low' ? 'LOW' : e.drive === 'pullup' ? 'pull-up' : 'alta imp.';
    this.$('#led-volt').textContent = e.drive === 'high' ? '5 V' : e.drive === 'low' ? '0 V' : e.drive === 'pullup' ? '≈ 1,7 V' : '—';
    this.$('#led-current').textContent = `${led.mA.toFixed(led.mA < 1 ? 2 : 1).replace('.', ',')} mA`;
    const st = this.$('#led-state');
    st.textContent = led.state === 'on' ? 'Encendido' : led.state === 'dim' ? 'Brillo muy débil' : 'Apagado';
    st.dataset.state = led.state;

    // Tabla de pines
    for (let n = 0; n <= 19; n++) {
      const q = board.pins[n], el = board.electrical(n);
      const state = q.mode === 'OUTPUT' ? (q.latch ? 'high' : 'low') : q.latch ? 'pullup' : q.mode ? 'input' : 'unset';
      const c = this.cells[n];
      if (c.dataset.state !== state) {
        c.dataset.state = state;
        c.querySelector('span').textContent = state === 'high' ? 'HIGH' : state === 'low' ? 'LOW' : state === 'pullup' ? 'PULL' : state === 'input' ? 'IN' : '—';
        c.title = `${pinLabel(n)} · ${q.mode || 'sin configurar'} · ${el.drive === 'high' ? '5 V' : el.drive === 'low' ? '0 V' : el.drive === 'pullup' ? 'pull-up' : 'alta impedancia'}`;
      }
      c.classList.toggle('is-led', n === ledPin);
    }
    this.drawScope(board, time, ledPin);
  }

  /** Cronograma: nivel de los pines usados frente al tiempo simulado. */
  drawScope(board, now, ledPin) {
    const cv = this.canvas, dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth, h0 = cv.clientHeight;
    const pins = [ledPin, ...board.byPin.map((a, i) => (a.length && i !== ledPin ? i : -1)).filter(i => i >= 0)].slice(0, 4);
    const laneH = 34, top = 6, h = Math.max(h0, top + pins.length * laneH + 22);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      cv.style.height = h + 'px';
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(this.root);
    const col = name => css.getPropertyValue(name).trim();
    ctx.clearRect(0, 0, w, h);
    const left = 44, right = w - 8, span = this.windowMs;
    const t0 = Math.max(0, now - span), t1 = Math.max(span, now);
    const X = t => left + ((t - (t1 - span)) / span) * (right - left);
    // Rejilla de tiempo
    ctx.font = '11px ui-monospace, Menlo, monospace';
    ctx.fillStyle = col('--muted'); ctx.strokeStyle = col('--grid'); ctx.lineWidth = 1;
    const step = span <= 1000 ? 100 : span <= 4000 ? 500 : span <= 10000 ? 1000 : 2000;
    const yAxis = top + pins.length * laneH + 4;
    for (let t = Math.ceil((t1 - span) / step) * step; t <= t1; t += step) {
      const x = Math.round(X(t)) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, yAxis); ctx.stroke();
      if ((t / step) % 2 === 0 || span <= 1000) ctx.fillText(t >= 1000 ? `${(t / 1000).toLocaleString('es-ES')} s` : `${t} ms`, x - 12, yAxis + 13);
    }
    pins.forEach((pin, i) => {
      const yH = top + i * laneH + 6, yL = top + i * laneH + laneH - 8;
      ctx.fillStyle = pin === ledPin ? col('--accent') : col('--muted');
      ctx.fillText(pinLabel(pin), 4, (yH + yL) / 2 + 4);
      const evs = board.byPin[pin];
      const color = pin === ledPin ? col('--sig') : col('--sig2');
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.fillStyle = color + '33';
      // Nivel lógico al principio de la ventana
      let k = lowerBound(evs, t1 - span);
      let level = k > 0 ? levelOf(evs[k - 1]) : 0;
      ctx.beginPath();
      const Y = l => (l ? yH : yL);
      ctx.moveTo(left, Y(level));
      // Agrupa los cambios por píxel: muchos cambios en el mismo píxel se dibujan como una banda
      let curPx = -1, startLevel = level, changes = 0;
      const flush = () => {
        if (curPx < 0) return;
        ctx.lineTo(curPx, Y(startLevel));
        if (changes > 1) { ctx.lineTo(curPx, yH); ctx.lineTo(curPx, yL); }
        ctx.lineTo(curPx, Y(level));
      };
      for (; k < evs.length && evs[k].t <= t1; k++) {
        const nl = levelOf(evs[k]);
        if (nl === level) continue;
        const px = Math.floor(X(evs[k].t)) + 0.5;
        if (px !== curPx) { flush(); curPx = px; startLevel = level; changes = 0; }
        changes++;
        level = nl;
      }
      flush();
      const y = Y(level);
      ctx.lineTo(Math.min(X(now), right), y);
      ctx.stroke();
      ctx.fillStyle = col('--muted');
      ctx.font = '9px ui-monospace, Menlo, monospace';
      ctx.fillText('1', left - 10, yH + 4); ctx.fillText('0', left - 10, yL + 3);
      ctx.font = '11px ui-monospace, Menlo, monospace';
    });
    if (now > 0) {
      const xn = Math.round(X(now)) + 0.5;
      ctx.strokeStyle = col('--accent'); ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(xn, top); ctx.lineTo(xn, yAxis); ctx.stroke(); ctx.setLineDash([]);
    }
    void t0;
  }
}

function levelOf(e) { return e.drive === 'high' || e.drive === 'pullup' ? 1 : 0; }
function lowerBound(a, t) {
  let lo = 0, hi = a.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (a[m].t < t) lo = m + 1; else hi = m; }
  return lo;
}

export { R_SERIE, LED_VF };
