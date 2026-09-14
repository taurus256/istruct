/*
 * zoom.js — масштабирование (зум) содержимого схемы колесом мыши при
 * зажатом Ctrl. Зумится ТОЛЬКО дерево + SVG-связи (через Render.setZoom(),
 * который применяет CSS zoom к .mm-row-middle внутри #mindmap-root) — тулбар,
 * боковые панели и статус-бар находятся вне #mindmap-root и не масштабируются.
 *
 * Уровень зума сохраняется в localStorage (ключ mindmap-zoom) — чисто
 * UI-настройка, как тема и ширины панелей; НЕ входит в экспорт/импорт схемы.
 *
 * Не использует ES-модули — открывается через file:// обычным <script>.
 */

var Zoom = (function () {
  var STORAGE_KEY = 'mindmap-zoom';
  var STEP = 1.1;        // множитель на один «щелчок» колеса (~10%)
  var MIN = 0.2;
  var MAX = 3.0;

  var container = null;  // #mindmap-root

  function clamp(z) {
    if (!isFinite(z)) { return 1; }
    if (z < MIN) { return MIN; }
    if (z > MAX) { return MAX; }
    return z;
  }

  function persist(z) {
    try { localStorage.setItem(STORAGE_KEY, String(z)); } catch (e) {}
  }

  function loadSaved() {
    var raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { raw = null; }
    if (raw == null) { return 1; }
    var val = parseFloat(raw);
    if (!isFinite(val)) { return 1; }
    return clamp(val);
  }

  function onWheel(e) {
    // Без Ctrl — обычный скролл контейнера, не трогаем.
    if (!e.ctrlKey) {
      return;
    }
    // С Ctrl — подавляем нативный зум страницы браузера и масштабируем схему.
    e.preventDefault();

    var oldZoom = Render.getZoom();
    var newZoom = clamp(e.deltaY < 0 ? oldZoom * STEP : oldZoom / STEP);
    if (newZoom === oldZoom) {
      return; // упёрлись в границу — ничего не делаем
    }

    var rect = container.getBoundingClientRect();
    // Позиция курсора внутри видимой области контейнера (в CSS-пикселях).
    var viewX = e.clientX - rect.left;
    var viewY = e.clientY - rect.top;
    // Точка контента под курсором в НАТУРАЛЬНЫХ координатах (до масштаба):
    // видимая координата + скролл, делённые на старый зум. scrollLeft/scrollTop
    // у zoom-контейнера — в тех же (масштабированных) единицах, что и viewX*zoom,
    // поэтому деление на oldZoom переводит точку в натуральную систему контента.
    var contentX = (viewX + container.scrollLeft) / oldZoom;
    var contentY = (viewY + container.scrollTop) / oldZoom;

    Render.setZoom(newZoom);

    // Корректируем скролл так, чтобы та же точка контента осталась под курсором:
    // новый scroll = contentX * newZoom - viewX (и аналогично по Y).
    container.scrollLeft = contentX * newZoom - viewX;
    container.scrollTop = contentY * newZoom - viewY;

    persist(newZoom);
  }

  function init(rootContainer) {
    container = rootContainer;
    if (!container) { return; }

    // passive:false ОБЯЗАТЕЛЬНО — иначе preventDefault() не сработает и
    // Ctrl+колесо зазумит всю страницу браузера.
    container.addEventListener('wheel', onWheel, { passive: false });

    // Восстанавливаем сохранённый уровень зума (Render уже проинициализирован
    // и дерево отрендерено к моменту вызова Zoom.init из app.js).
    var saved = loadSaved();
    if (saved !== 1) {
      Render.setZoom(saved);
    }
  }

  return {
    init: init
  };
})();
