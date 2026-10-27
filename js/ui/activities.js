// Panel de actividades: índice de prácticas, teoría, esquema, enunciado, pistas progresivas,
// retos, actividad de depuración y comprobación automática.
import { PRACTICAS, NIVELES, esquemaLed } from '../activities/practicas.js';
import { evaluate } from '../activities/checks.js';
import { store } from '../storage.js';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export class ActivityPanel {
  /**
   * @param {HTMLElement} root
   * @param {{getCode:()=>string, getLedPin:()=>number, loadCode:(code:string, why:string)=>void, onSelect:(p:object)=>void}} app
   */
  constructor(root, app) {
    this.root = root;
    this.app = app;
    this.current = null;
    this.select = root.querySelector('#practica-select');
    this.body = root.querySelector('#practica-body');
    for (const p of PRACTICAS) {
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = `${p.num}. ${p.titulo}${p.disponible ? '' : ` · Fase ${p.fase}`}`;
      this.select.appendChild(o);
    }
    this.select.addEventListener('change', () => this.show(this.select.value));
    this.body.addEventListener('click', e => this.onClick(e));
  }

  show(id) {
    const p = PRACTICAS.find(x => x.id === id) || PRACTICAS[0];
    this.select.value = p.id;
    this.current = p;
    store.set('practica', p.id);
    if (!p.disponible) { this.renderLocked(p); return; }
    this.render(p);
    this.app.onSelect(p);
  }

  renderLocked(p) {
    const list = PRACTICAS.map(q => `<li class="${q.disponible ? 'ok' : ''}"><b>${q.num}. ${esc(q.titulo)}</b> · ${esc(q.subtitulo)}<span class="tag">${q.disponible ? 'Disponible' : 'Fase ' + q.fase}</span></li>`).join('');
    this.body.innerHTML = `
      <div class="locked">
        <p class="eyebrow">${NIVELES[p.nivel]}</p>
        <h2>${p.num}. ${esc(p.titulo)}</h2>
        <p class="sub">${esc(p.subtitulo)}</p>
        <p class="callout">Esta práctica necesita funciones que el simulador incorporará en la <b>Fase ${p.fase}</b>. Todavía no está disponible.</p>
        <h3>Itinerario</h3>
        <ol class="itin">${list}</ol>
        <button type="button" class="btn" data-act="go" data-id="p1">Ir a la práctica 1</button>
      </div>`;
  }

  render(p) {
    const hints = store.get(`hints:${p.id}`, 0);
    const crit = (list, key) => `<ul class="crit" data-key="${key}">${list.map(c => `<li data-id="${c.id}"><span class="ico" aria-hidden="true"></span><span class="ct">${c.text}</span><span class="cm"></span></li>`).join('')}</ul>`;
    this.body.innerHTML = `
      <p class="eyebrow">Práctica ${p.num} · ${NIVELES[p.nivel]}</p>
      <h2>${esc(p.titulo)}</h2>
      <p class="sub">${esc(p.subtitulo)}</p>

      <details class="sec" open>
        <summary>Objetivos</summary>
        <ul>${p.objetivos.map(o => `<li>${esc(o)}</li>`).join('')}</ul>
      </details>
      <details class="sec">
        <summary>Explicación técnica</summary>
        <div class="theory">${p.teoria}</div>
      </details>
      <details class="sec">
        <summary>Esquema</summary>
        <figure class="schem-fig">${esquemaLed(p.ledPin)}<figcaption>Pin D${p.ledPin} → resistencia de 220 Ω → LED → GND. Así está montado en la zona de montaje.</figcaption></figure>
      </details>

      <section class="task" aria-labelledby="t-main">
        <h3 id="t-main">Enunciado</h3>
        <p>${p.enunciado}</p>
        <h4>Criterios de comprobación</h4>
        ${crit(p.criterios, 'main')}
        <div class="row">
          <button type="button" class="btn primary" data-act="check" data-key="main">Comprobar</button>
          <button type="button" class="btn ghost" data-act="reset-code">Restablecer código inicial</button>
        </div>
        <p class="check-note" data-note="main" aria-live="polite"></p>

        <h4>Pistas</h4>
        <ol class="hints">${p.pistas.map((h, i) => `<li ${i < hints ? '' : 'hidden'}>${esc(h)}</li>`).join('')}</ol>
        <button type="button" class="btn ghost small" data-act="hint" ${hints >= p.pistas.length ? 'disabled' : ''}>${hints >= p.pistas.length ? 'No hay más pistas' : `Ver pista ${hints + 1} de ${p.pistas.length}`}</button>
      </section>

      <section class="task" aria-labelledby="t-retos">
        <h3 id="t-retos">Retos de ampliación</h3>
        ${p.retos.map(r => `
          <details class="reto">
            <summary><span class="lvl">N${r.nivel}</span>${esc(r.titulo)}</summary>
            <p>${r.enunciado}</p>
            ${crit(r.criterios, r.id)}
            <button type="button" class="btn small" data-act="check" data-key="${r.id}">Comprobar reto</button>
            <p class="check-note" data-note="${r.id}" aria-live="polite"></p>
          </details>`).join('')}
      </section>

      <section class="task debug" aria-labelledby="t-dbg">
        <h3 id="t-dbg">Depuración</h3>
        <p>${p.depuracion.enunciado}</p>
        <div class="row">
          <button type="button" class="btn small" data-act="load-debug">Cargar el programa con errores</button>
        </div>
        ${crit(p.depuracion.criterios, 'debug')}
        <button type="button" class="btn small" data-act="check" data-key="debug">Comprobar</button>
        <p class="check-note" data-note="debug" aria-live="polite"></p>
      </section>`;
    // Resultados guardados
    for (const key of ['main', 'debug', ...p.retos.map(r => r.id)]) {
      const saved = store.get(`done:${p.id}:${key}`);
      if (saved) this.mark(key, saved);
    }
  }

  criteriaFor(key) {
    const p = this.current;
    if (key === 'main') return p.criterios;
    if (key === 'debug') return p.depuracion.criterios;
    return p.retos.find(r => r.id === key).criterios;
  }

  async onClick(e) {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const p = this.current;
    switch (b.dataset.act) {
      case 'go': this.show(b.dataset.id); break;
      case 'hint': {
        const n = Math.min(store.get(`hints:${p.id}`, 0) + 1, p.pistas.length);
        store.set(`hints:${p.id}`, n);
        const items = this.body.querySelectorAll('.hints li');
        items.forEach((li, i) => { li.hidden = i >= n; });
        b.textContent = n >= p.pistas.length ? 'No hay más pistas' : `Ver pista ${n + 1} de ${p.pistas.length}`;
        b.disabled = n >= p.pistas.length;
        break;
      }
      case 'reset-code': this.app.loadCode(p.inicial, 'reset'); break;
      case 'load-debug': this.app.loadCode(p.depuracion.codigo, 'debug'); break;
      case 'check': await this.check(b.dataset.key, b); break;
    }
  }

  async check(key, btn) {
    const note = this.body.querySelector(`[data-note="${key}"]`);
    btn.disabled = true;
    note.textContent = 'Ejecutando el programa durante 8 s de tiempo simulado…';
    const ctx = await evaluate(this.app.getCode(), this.app.getLedPin());
    const results = this.criteriaFor(key).map(c => ({ id: c.id, ...c.check(ctx) }));
    const passed = results.every(r => r.pass);
    const summary = { results, passed, date: Date.now() };
    store.set(`done:${this.current.id}:${key}`, summary);
    this.mark(key, summary);
    btn.disabled = false;
    if (ctx.res.timedOut) note.textContent += ' (La prueba se detuvo: el programa ejecuta demasiadas instrucciones sin pausas.)';
  }

  mark(key, { results, passed }) {
    const ul = this.body.querySelector(`.crit[data-key="${key}"]`);
    const note = this.body.querySelector(`[data-note="${key}"]`);
    if (!ul) return;
    for (const r of results) {
      const li = ul.querySelector(`[data-id="${r.id}"]`);
      if (!li) continue;
      li.dataset.pass = r.pass ? 'yes' : 'no';
      li.querySelector('.cm').textContent = r.msg || '';
    }
    const n = results.filter(r => r.pass).length;
    note.textContent = passed ? `¡Conseguido! Se cumplen los ${results.length} criterios.` : `Se cumplen ${n} de ${results.length} criterios. Lee los comentarios en rojo.`;
    note.dataset.ok = passed ? 'yes' : 'no';
  }
}
