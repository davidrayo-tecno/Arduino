// Editor de código: área de texto nativa (accesible, con deshacer) sobre una capa con resaltado,
// numeración de líneas, marcas de error y la línea que se está ejecutando.
import { highlight } from './highlight.js';

export class CodeEditor {
  /**
   * @param {HTMLElement} root  contenedor vacío
   * @param {{onChange?:(code:string)=>void, onShortcut?:(name:string)=>void}} opts
   */
  constructor(root, opts = {}) {
    this.opts = opts;
    this.marks = new Map();   // línea → 'error' | 'warning'
    this.execLine = 0;
    root.classList.add('code-editor');
    root.innerHTML = `
      <div class="ce-gutter" aria-hidden="true"><div class="ce-nums"></div></div>
      <div class="ce-main">
        <div class="ce-layer ce-lines" aria-hidden="true"></div>
        <pre class="ce-layer ce-hl" aria-hidden="true"><code></code></pre>
        <textarea class="ce-input" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off"
          aria-label="Editor de código Arduino" aria-describedby="editor-help"></textarea>
      </div>`;
    this.root = root;
    this.ta = root.querySelector('textarea');
    this.hl = root.querySelector('.ce-hl code');
    this.hlPre = root.querySelector('.ce-hl');
    this.nums = root.querySelector('.ce-nums');
    this.lines = root.querySelector('.ce-lines');

    this.ta.addEventListener('input', () => { this.render(); this.opts.onChange?.(this.ta.value); });
    this.ta.addEventListener('scroll', () => this.syncScroll());
    this.ta.addEventListener('keydown', e => this.onKey(e));
    new ResizeObserver(() => this.syncScroll()).observe(this.ta);
    this.render();
  }

  get value() { return this.ta.value; }
  set value(v) { this.ta.value = v; this.marks.clear(); this.execLine = 0; this.render(); this.ta.scrollTop = 0; this.syncScroll(); }

  /** Sustituye todo el texto conservando la posibilidad de deshacer (Ctrl+Z). */
  replaceAll(v) {
    this.ta.focus();
    this.ta.select();
    if (!document.execCommand('insertText', false, v)) this.ta.value = v;
    this.marks.clear();
    this.render();
    this.opts.onChange?.(this.ta.value);
  }

  setMarks(diags) {
    this.marks.clear();
    for (const d of diags) {
      if (!d.pos) continue;
      const prev = this.marks.get(d.pos.line);
      if (prev !== 'error') this.marks.set(d.pos.line, d.severity === 'error' ? 'error' : 'warning');
    }
    this.renderDecor();
  }

  setExecLine(n) {
    if (n === this.execLine) return;
    this.execLine = n;
    this.renderDecor();
  }

  /** Lleva el cursor a una línea y columna (1-based). */
  goTo(line, col = 1) {
    const ls = this.ta.value.split('\n');
    let idx = 0;
    for (let i = 0; i < Math.min(line - 1, ls.length); i++) idx += ls[i].length + 1;
    idx += Math.max(0, Math.min(col - 1, (ls[line - 1] || '').length));
    this.ta.focus();
    this.ta.setSelectionRange(idx, idx);
    const lh = this.lineHeight();
    const top = (line - 1) * lh;
    if (top < this.ta.scrollTop || top > this.ta.scrollTop + this.ta.clientHeight - 2 * lh)
      this.ta.scrollTop = Math.max(0, top - this.ta.clientHeight / 3);
  }

  lineHeight() { return parseFloat(getComputedStyle(this.ta).lineHeight) || 21; }

  render() {
    const v = this.ta.value;
    this.hl.innerHTML = highlight(v) + '\n';
    const n = v.split('\n').length;
    if (n !== this.lineCount) {
      this.lineCount = n;
      let s = '';
      for (let i = 1; i <= n; i++) s += `<span data-l="${i}">${i}</span>`;
      this.nums.innerHTML = s;
    }
    this.renderDecor();
  }

  renderDecor() {
    for (const el of this.nums.querySelectorAll('.err,.warn,.exec')) el.classList.remove('err', 'warn', 'exec');
    let html = '';
    const lh = this.lineHeight();
    for (const [line, kind] of this.marks) {
      this.nums.querySelector(`[data-l="${line}"]`)?.classList.add(kind === 'error' ? 'err' : 'warn');
      html += `<div class="ce-mark ${kind}" style="top:${(line - 1) * lh}px;height:${lh}px"></div>`;
    }
    if (this.execLine) {
      this.nums.querySelector(`[data-l="${this.execLine}"]`)?.classList.add('exec');
      html += `<div class="ce-mark exec" style="top:${(this.execLine - 1) * lh}px;height:${lh}px"></div>`;
    }
    this.lines.innerHTML = html;
  }

  syncScroll() {
    const { scrollTop, scrollLeft } = this.ta;
    this.hlPre.style.transform = `translate(${-scrollLeft}px, ${-scrollTop}px)`;
    this.lines.style.transform = `translateY(${-scrollTop}px)`;
    this.nums.style.transform = `translateY(${-scrollTop}px)`;
  }

  insert(text) {
    if (!document.execCommand('insertText', false, text)) {
      const { selectionStart: a, selectionEnd: b, value } = this.ta;
      this.ta.value = value.slice(0, a) + text + value.slice(b);
      this.ta.selectionStart = this.ta.selectionEnd = a + text.length;
      this.ta.dispatchEvent(new Event('input'));
    }
  }

  onKey(e) {
    const ta = this.ta;
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); this.opts.onShortcut?.('run'); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); this.opts.onShortcut?.('save'); return; }
    // Atajos del IDE de Arduino: Ctrl+R verificar, Ctrl+U cargar (aquí, ejecutar)
    if ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R')) { e.preventDefault(); this.opts.onShortcut?.('compile'); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'u' || e.key === 'U')) { e.preventDefault(); this.opts.onShortcut?.('run'); return; }
    if (e.key === 'Escape') { ta.blur(); return; } // permite salir del editor con el teclado
    const { selectionStart: a, selectionEnd: b, value } = ta;
    if (e.key === 'Tab') {
      e.preventDefault();
      const ls = value.lastIndexOf('\n', a - 1) + 1;
      if (a === b && !e.shiftKey) { this.insert('  '); return; }
      // Sangrar o quitar sangría a las líneas seleccionadas
      const le = value.indexOf('\n', b - 1 < a ? a : b - 1);
      const end = le === -1 ? value.length : le;
      const block = value.slice(ls, end);
      const changed = e.shiftKey ? block.replace(/^ {1,2}/gm, '') : block.replace(/^/gm, '  ');
      ta.setSelectionRange(ls, end);
      this.insert(changed);
      ta.setSelectionRange(ls, ls + changed.length);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      const ls = value.lastIndexOf('\n', a - 1) + 1;
      const indent = /^[ \t]*/.exec(value.slice(ls, a))[0];
      const before = value.slice(ls, a).trimEnd();
      const extra = before.endsWith('{') ? '  ' : '';
      if (extra && value[b] === '}') {
        this.insert('\n' + indent + extra + '\n' + indent);
        const pos = a + 1 + indent.length + extra.length;
        ta.setSelectionRange(pos, pos);
      } else this.insert('\n' + indent + extra);
      return;
    }
    if (e.key === '}' && a === b) {
      const ls = value.lastIndexOf('\n', a - 1) + 1;
      const head = value.slice(ls, a);
      if (/^ +$/.test(head) && head.length >= 2) {
        e.preventDefault();
        ta.setSelectionRange(a - 2, a);
        this.insert('}');
      }
    }
  }
}
