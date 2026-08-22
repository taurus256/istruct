/*
 * theme.js — переключение светлой/тёмной темы (кнопка "Тема" в тулбаре).
 * Сама тема — это набор CSS-переменных в css/theme.css, переключаемых
 * атрибутом data-theme на <html> (см. :root[data-theme="dark"]).
 * Начальное значение атрибута проставляется инлайн-скриптом в <head>
 * index.html (до отрисовки, чтобы не было мигания светлой темой).
 */

var Theme = (function () {
  var STORAGE_KEY = 'mindmap-theme';

  function current() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) {}
  }

  function toggle() {
    var next = current() === 'dark' ? 'light' : 'dark';
    apply(next);
    return next;
  }

  function init() {
    var btn = document.getElementById('btn-theme');
    if (!btn) { return; }

    function sync() {
      btn.classList.toggle('ribbon-btn--selected', current() === 'dark');
    }

    sync();
    btn.addEventListener('click', function () {
      toggle();
      sync();
    });
  }

  return { current: current, toggle: toggle, init: init };
})();
