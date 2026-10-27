// Arduino Lab · IES Palomares — punto de entrada de la interfaz.
// Une el editor (B), el motor de ejecución, el modelo electrónico y las vistas (A, C, D).
import { compile } from './engine/compiler.js';
import { Machine } from './engine/interpreter.js';
import { Board } from './model/board.js';
import { LedCircuit } from './model/circuit.js';
import { CodeEditor } from './editor/editor.js';
import { BoardView } from './ui/boardView.js';
import { Monitor } from './ui/monitor.js';
import { ActivityPanel } from './ui/activities.js';
import { PRACTICAS } from './activities/practicas.js';
import { store, programs } from './storage.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------- Estado ----------
const board = new Board();
const circuit = new LedCircuit(13);
let machine = null;
let program = null;          // programa compilado que está cargado en la «placa»
let loadedSource = null;
let runState = 'idle';       // 'idle' | 'running' | 'stopped' | 'error'
let speed = 1;
let simBase = 0, realBase = 0, lastFrame = 0, behind = false, behindFrames = 0;
let practica = null;
let messages = [];           // diagnósticos de compilación
let runtimeMsgs = [];        // avisos y errores durante la ejecución

// ---------- Vistas ----------
const editor = new CodeEditor($('#editor'), {
  onChange: code => {
    scheduleAutosave(code);
    if (runState === 'error') { runState = 'stopped'; updateButtons(); render(); }
    $('#dirty').hidden = !(loadedSource !== null && code !== loadedSource && runState === 'running');
  },
  onShortcut: name => {
    if (name === 'run') run();
    else if (name === 'compile') doCompile();
    else if (name === 'save') openPrograms(true);
  },
});
const boardView = new BoardView($('#board'));
boardView.setLedPin(circuit.pin);
const monitor = new Monitor($('#monitor'));
const activities = new ActivityPanel($('#activities'), {
  getCode: () => editor.value,
  getLedPin: () => circuit.pin,
  loadCode,
  onSelect: selectPractica,
});

// Selector de pin del LED (pines 2-13; 0 y 1 se reservan para la comunicación serie)
const pinSel = $('#led-pin-select');
for (let n = 13; n >= 2; n--) {
  const o = document.createElement('option');
  o.value = n; o.textContent = `D${n}${[3, 5, 6, 9, 10, 11].includes(n) ? ' (~PWM)' : ''}`;
  pinSel.appendChild(o);
}
pinSel.addEventListener('change', () => setLedPin(+pinSel.value, true));

function setLedPin(n, save) {
  circuit.pin = n;
  pinSel.value = n;
  boardView.setLedPin(n);
  if (save && practica) store.set(`ledpin:${practica.id}`, n);
  render();
}

// ---------- Prácticas ----------
function selectPractica(p) {
  stopMachine('idle');
  board.reset();
  machine = null; program = null; loadedSource = null;
  practica = p;
  editor.value = store.get(`code:${p.id}`, p.inicial);
  $('#file-name').textContent = `practica${p.num}.ino`;
  setLedPin(store.get(`ledpin:${p.id}`, p.ledPin), false);
  setMessages([], []);
  $('#compile-status').textContent = 'Sin compilar';
  $('#compile-status').dataset.kind = '';
  closeDrawer();
  render();
}

function loadCode(code, why) {
  if (why === 'reset' && editor.value !== code &&
      !confirm('¿Restablecer el código inicial de la práctica? Tus cambios se sustituirán (podrás recuperarlos con Ctrl+Z).')) return;
  if (why === 'debug' && editor.value !== code &&
      !confirm('Se cargará el programa con errores en el editor. Tu código actual se sustituirá (podrás recuperarlo con Ctrl+Z o guardarlo antes con Archivo › Guardar como…). ¿Continuar?')) return;
  editor.replaceAll(code);
  setMessages([], []);
  toast(why === 'debug' ? 'Programa con errores cargado. Pulsa «Compilar» para empezar.' : 'Código inicial restablecido.');
}

let autosaveTimer = null;
function scheduleAutosave(code) {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => { if (practica) store.set(`code:${practica.id}`, code); }, 400);
}

// ---------- Compilación ----------
function doCompile() {
  const r = compile(editor.value);
  setMessages(r.diagnostics, [], true);
  const errs = r.diagnostics.filter(d => d.severity === 'error').length;
  const warns = r.diagnostics.filter(d => d.severity === 'warning').length;
  const st = $('#compile-status');
  if (r.ok) {
    st.textContent = `Compilado correctamente${warns ? ` · ${warns} aviso${warns > 1 ? 's' : ''}` : ''}`;
    st.dataset.kind = warns ? 'warn' : 'ok';
  } else {
    st.textContent = `${errs} error${errs > 1 ? 'es' : ''}${warns ? ` · ${warns} aviso${warns > 1 ? 's' : ''}` : ''}`;
    st.dataset.kind = 'error';
  }
  return r;
}

let compiledOnce = false;
function setMessages(diags, runtime, compiled = false) {
  compiledOnce = compiled;
  messages = diags;
  runtimeMsgs = runtime;
  renderMessages();
}

function renderMessages() {
  const all = [...messages, ...runtimeMsgs];
  editor.setMarks(all);
  const ul = $('#messages');
  if (!all.length) {
    ul.innerHTML = compiledOnce
      ? '<li class="msg empty ok">Sin errores ni avisos.</li>'
      : '<li class="msg empty">Pulsa «Compilar» para revisar el programa o «Ejecutar» para probarlo.</li>';
    return;
  }
  ul.innerHTML = all.map((d, i) => `
    <li class="msg ${d.severity}">
      <span class="sev">${d.severity === 'error' ? 'Error' : d.severity === 'warning' ? 'Aviso' : 'Info'}${d.runtime ? ' en ejecución' : ''}</span>
      ${d.pos ? `<button type="button" class="ln" data-i="${i}">Línea ${d.pos.line}</button>` : ''}
      <span class="txt">${esc(d.message)}${d.hint ? `<span class="hint">${esc(d.hint)}</span>` : ''}</span>
    </li>`).join('');
}
$('#messages').addEventListener('click', e => {
  const b = e.target.closest('.ln');
  if (!b) return;
  const d = [...messages, ...runtimeMsgs][+b.dataset.i];
  editor.goTo(d.pos.line, d.pos.col);
});

// ---------- Ejecución ----------
function run() {
  const r = doCompile();
  if (!r.ok) {
    const first = r.diagnostics.find(d => d.severity === 'error');
    if (first?.pos) editor.goTo(first.pos.line, first.pos.col);
    toast('Hay errores de compilación: corrígelos antes de ejecutar.');
    return;
  }
  program = r.program;
  loadedSource = editor.value;
  start();
}

function start() {
  board.reset();
  runtimeMsgs = [];
  machine = new Machine(program, board, { onWarning: w => addRuntime(w) });
  runState = 'running';
  behind = false;
  simBase = 0; realBase = performance.now(); lastFrame = realBase;
  $('#dirty').hidden = true;
  updateButtons();
  requestAnimationFrame(frame);
}

function addRuntime(w) {
  w.runtime = true;
  if (runtimeMsgs.some(x => x.message === w.message)) return;
  runtimeMsgs.push(w);
  renderMessages();
}

function frame(now) {
  if (runState !== 'running') return;
  // Si la pestaña estuvo oculta, no intentamos «recuperar» el tiempo perdido
  if (now - lastFrame > 250) realBase += now - lastFrame - 16;
  lastFrame = now;
  const target = simBase + (now - realBase) * speed;
  const st = machine.advance(target, 12);
  behindFrames = st === 'busy' ? behindFrames + 1 : 0;
  behind = behindFrames > 20;
  if (st === 'busy' && target - machine.time > 50) { // no acumulamos retraso: la simulación sigue a su ritmo máximo
    simBase = machine.time; realBase = now;
  }
  if (st === 'error') {
    const e = machine.error;
    e.runtime = true;
    runtimeMsgs.push(e);
    stopMachine('error');
    renderMessages();
    if (e.pos) editor.goTo(e.pos.line, e.pos.col);
    toast('El programa se ha detenido por un error.');
  }
  render();
  if (runState === 'running') requestAnimationFrame(frame);
}

function stopMachine(state = 'stopped') {
  if (machine) machine.stop();
  runState = state;
  updateButtons();
  render();
}

function resetBoard() {
  if (!program) { run(); return; }
  start();
  toast('RESET: el programa vuelve a empezar desde setup().');
}

function setSpeed(v) {
  if (machine) { simBase = machine.time; realBase = performance.now(); }
  speed = v;
}

function updateButtons() {
  $('#btn-stop').disabled = runState !== 'running';
  $('#btn-run').classList.toggle('active', runState === 'running');
  const rs = $('#run-state');
  rs.dataset.state = runState;
  rs.textContent = { idle: 'Detenido', running: 'Ejecutando', stopped: 'Detenido', error: 'Error' }[runState];
}

function render() {
  const led = circuit.solve(board.electrical(circuit.pin));
  boardView.update(board, led);
  monitor.update({ board, machine, led, ledPin: circuit.pin, runState, behind });
  editor.setExecLine(runState === 'running' || runState === 'error' ? machine?.line || 0 : 0);
}

$('#btn-compile').addEventListener('click', doCompile);
$('#btn-run').addEventListener('click', run);
$('#btn-stop').addEventListener('click', () => { stopMachine('stopped'); toast('Ejecución detenida.'); });
$('#btn-reset').addEventListener('click', resetBoard);
$('#speed').addEventListener('change', e => setSpeed(+e.target.value));

// ---------- Archivo ----------
const menu = $('.menu');
menu.addEventListener('click', e => {
  const b = e.target.closest('[data-file]');
  if (!b) return;
  menu.open = false;
  ({
    save: () => openPrograms(true),
    open: () => openPrograms(false),
    download: downloadIno,
    upload: () => $('#file-input').click(),
    reset: () => practica && loadCode(practica.inicial, 'reset'),
  })[b.dataset.file]();
});
document.addEventListener('click', e => { if (!menu.contains(e.target)) menu.open = false; });

function downloadIno() {
  const blob = new Blob([editor.value], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = $('#file-name').textContent;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$('#file-input').addEventListener('change', async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  if (f.size > 200000) { toast('El archivo es demasiado grande.'); return; }
  const text = await f.text();
  editor.replaceAll(text.replace(/\r\n/g, '\n'));
  $('#file-name').textContent = f.name;
  toast(`Abierto «${f.name}».`);
});

const dlgP = $('#dlg-programs');
function openPrograms(focusSave) {
  $('#prog-name').value = practica ? `Práctica ${practica.num} · ${new Date().toLocaleDateString('es-ES')}` : '';
  renderPrograms();
  dlgP.showModal();
  if (focusSave) $('#prog-name').select();
}
function renderPrograms() {
  const all = programs.list();
  const names = Object.keys(all).sort((a, b) => all[b].date.localeCompare(all[a].date));
  $('#prog-list').innerHTML = names.length ? names.map(n => `
    <li><div><b>${esc(n)}</b><span>${new Date(all[n].date).toLocaleString('es-ES')}</span></div>
      <button type="button" class="btn small" data-load="${esc(n)}">Abrir</button>
      <button type="button" class="btn small ghost" data-del="${esc(n)}" aria-label="Borrar ${esc(n)}">Borrar</button></li>`).join('')
    : '<li class="empty">Todavía no hay programas guardados.</li>';
}
$('#prog-save').addEventListener('click', () => {
  const name = $('#prog-name').value.trim();
  if (!name) { $('#prog-name').focus(); return; }
  if (programs.list()[name] && !confirm(`Ya existe «${name}». ¿Sustituirlo?`)) return;
  toast(programs.save(name, editor.value, practica?.id) ? `Guardado «${name}».` : 'No se ha podido guardar: el navegador no permite almacenamiento local.');
  renderPrograms();
});
$('#prog-list').addEventListener('click', e => {
  const l = e.target.closest('[data-load]'), d = e.target.closest('[data-del]');
  if (l) {
    const p = programs.list()[l.dataset.load];
    if (p) { editor.replaceAll(p.code); dlgP.close(); toast(`Abierto «${l.dataset.load}».`); }
  } else if (d && confirm(`¿Borrar «${d.dataset.del}»?`)) { programs.remove(d.dataset.del); renderPrograms(); }
});

// ---------- Tema, ayuda y panel lateral ----------
$('#btn-theme').addEventListener('click', () => {
  const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  store.set('theme', next);
  render();
});
$('#btn-help').addEventListener('click', () => $('#dlg-help').showModal());

const acts = $('#activities'), scrim = $('#scrim');
function openDrawer() { acts.classList.add('open'); scrim.hidden = false; $('#btn-acts').setAttribute('aria-expanded', 'true'); acts.querySelector('select').focus(); }
function closeDrawer() { acts.classList.remove('open'); scrim.hidden = true; $('#btn-acts').setAttribute('aria-expanded', 'false'); }
$('#btn-acts').addEventListener('click', () => (acts.classList.contains('open') ? closeDrawer() : openDrawer()));
$('#btn-close-acts').addEventListener('click', closeDrawer);
scrim.addEventListener('click', closeDrawer);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && acts.classList.contains('open')) closeDrawer(); });

let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

window.addEventListener('resize', () => render());

// ---------- Arranque ----------
{
  const pid = store.get('practica', 'p1');
  activities.show(PRACTICAS.find(p => p.id === pid)?.disponible ? pid : 'p1');
}
renderMessages();
updateButtons();

// Acceso para pruebas automáticas
window.__arduinoLab = { get machine() { return machine; }, board, editor, run, compile: doCompile };
