// Guardado local (en este navegador). Todo va protegido con try/catch:
// en modo privado o con el almacenamiento bloqueado la aplicación sigue funcionando sin guardar.
const PREFIX = 'arduinolab:';

export const store = {
  get(key, fallback = null) {
    try { const v = localStorage.getItem(PREFIX + key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; } catch { return false; }
  },
  remove(key) { try { localStorage.removeItem(PREFIX + key); } catch { /* sin almacenamiento */ } },
};

/** Programas guardados con nombre: { nombre: { code, date, practica } } */
export const programs = {
  list() { return store.get('programs', {}); },
  save(name, code, practica) {
    const all = this.list();
    all[name] = { code, date: new Date().toISOString(), practica };
    return store.set('programs', all);
  },
  remove(name) { const all = this.list(); delete all[name]; store.set('programs', all); },
};
