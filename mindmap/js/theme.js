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
    // Кнопки действия theme_toggle могут быть в НЕСКОЛЬКИХ вкладках ribbon'а
    // (см. ribbonConfig.js), у всех один и тот же data-action. КЛИК больше НЕ
    // навешивается здесь: поведение привязано централизованно в app.js — одним
    // делегированным обработчиком по [data-action] на #toolbar
    // (ActionHandlers.theme_toggle). Иначе на кнопке оказались бы ДВА
    // обработчика (этот + делегированный) и тема переключалась бы дважды —
    // визуально «не переключалась вообще».
    // Здесь остаётся только первичная синхронизация подсветки по текущей теме.
    syncButtons();
  }

  // Подсветка всех кнопок действия theme_toggle по текущей теме.
  // Вызывается при инициализации и из app.js после каждого переключения.
  function syncButtons() {
    var btns = document.querySelectorAll('[data-action="theme_toggle"]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('ribbon-btn--selected', current() === 'dark');
    }
  }

  return { current: current, toggle: toggle, init: init, syncButtons: syncButtons };
})();
