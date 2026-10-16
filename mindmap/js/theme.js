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
    // Кнопка "Тема" встречается в НЕСКОЛЬКИХ вкладках ribbon'а (ВИД и
    // ИНСТРУМЕНТЫ — см. uiConfig.js) как один и тот же action theme_toggle
    // под разными DOM id (btn-theme/btn-theme-tools). Раньше это были ДВЕ
    // кнопки с ОДНИМ И ТЕМ ЖЕ id='btn-theme' — document.getElementById
    // находил только первую, вторая была нерабочей "мёртвой кнопкой".
    // Находим все такие кнопки через общий data-action хук (простав-
    // ляется ribbonRenderer.js) и навешиваем обработчик на каждую.
    var btns = document.querySelectorAll('[data-action="theme_toggle"]');
    if (!btns.length) { return; }

    function sync() {
      btns.forEach(function (btn) {
        btn.classList.toggle('ribbon-btn--selected', current() === 'dark');
      });
    }

    sync();
    btns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        toggle();
        sync();
      });
    });
  }

  return { current: current, toggle: toggle, init: init };
})();
