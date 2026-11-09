import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('../frontend/public/bootstrap-recovery.js', import.meta.url), 'utf8');

function browser(storage = new Map()) {
  const listeners = {};
  const status = { textContent: 'Loading' };
  const button = { hidden: true };
  let reloads = 0;
  const window = {
    location: { pathname: '/', reload() { reloads++; } },
    sessionStorage: {
      getItem: key => storage.get(key),
      setItem: (key, value) => storage.set(key, value),
    },
    addEventListener: (name, fn) => { listeners[name] = fn; },
    setTimeout: fn => { listeners.timeout = fn; },
  };
  const elements = { 'enziu-startup-status': status, 'enziu-startup-reload': button };
  const document = {
    querySelector: () => ({ src: 'https://enziurooms.xyz/assets/index-test.js' }),
    getElementById: id => elements[id] ?? null,
  };
  vm.runInNewContext(source, { window, document });
  return { listeners, window, button, status, elements, reloads: () => reloads };
}

test('stale chunk reloads once across page loads, then offers manual retry', () => {
  const storage = new Map();
  const first = browser(storage);
  let prevented = false;
  first.listeners['vite:preloadError']({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(first.reloads(), 1);
  const second = browser(storage);
  second.listeners.error({ target: { tagName: 'SCRIPT', type: 'module' } });
  assert.equal(second.reloads(), 0);
  assert.equal(second.button.hidden, false);
  second.button.onclick();
  assert.equal(second.reloads(), 1);
});

test('disabled session storage never loops', () => {
  const page = browser();
  page.window.sessionStorage.getItem = () => { throw new Error('blocked'); };
  page.listeners.error({ target: { tagName: 'SCRIPT', type: 'module' } });
  assert.equal(page.reloads(), 0);
  assert.equal(page.button.hidden, false);
});

test('image errors and application errors do not reload the page', () => {
  const page = browser();
  page.listeners.error({ target: { tagName: 'IMG' } });
  page.listeners.error({ target: page.window, message: 'application failure' });
  assert.equal(page.reloads(), 0);
});

test('startup timeout exposes retry, but never changes a mounted React tree', () => {
  const page = browser();
  page.listeners.DOMContentLoaded();
  page.listeners.timeout();
  assert.equal(page.button.hidden, false);
  delete page.elements['enziu-startup-status'];
  delete page.elements['enziu-startup-reload'];
  assert.doesNotThrow(() => page.listeners.timeout());
  assert.equal(page.reloads(), 0);
});
