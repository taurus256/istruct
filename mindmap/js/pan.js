/*
 * pan.js — панорамирование (pan) видимой области дерева перетаскиванием
 * пустого фона контейнера #mindmap-root левой кнопкой мыши, как в
 * графических редакторах/картах ("drag to pan").
 *
 * Не зависит от Model/Render — работает только с DOM-контейнером и его
 * scrollLeft/scrollTop, поэтому может быть подключён независимо от порядка
 * nodeTypes→model→storage→dragdrop→render→app (главное — до app.js, чтобы
 * не пришлось трогать порядок остальных скриптов).
 */

var Pan = (function () {
  var container = null;
  var panning = false;
  var moved = false; // отличаем настоящий drag от простого клика без движения
  var startX = 0;
  var startY = 0;
  var startScrollLeft = 0;
  var startScrollTop = 0;

  // Порог в пикселях, после которого движение мыши считается "перетаскиванием"
  // (а не дрожанием руки во время обычного клика).
  var DRAG_THRESHOLD = 3;

  function init(rootContainer) {
    container = rootContainer;

    container.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  function onMouseDown(e) {
    if (e.button !== 0) {
      return; // только левая кнопка мыши
    }
    // Клик по узлу (или по чему-то внутри узла — тексту, кнопкам тулбара) —
    // это не панорамирование, обычное взаимодействие с узлом.
    if (e.target.closest && e.target.closest('.node')) {
      return;
    }

    // Подавляем нативное поведение браузера, запускаемое тем же mousedown
    // (drag-выделение текста на фоне контейнера). Без этого браузер начинает
    // собственное text-selection-drag, а при выходе курсора мыши за пределы
    // окна включается встроенный auto-scroll-при-выделении — он работает по
    // своим правилам (через внутренний таймер браузера, не через наши
    // mousemove) и визуально выглядит как панорамирование в обратную сторону,
    // упирающееся в предельные значения scrollLeft/scrollTop.
    e.preventDefault();

    panning = true;
    moved = false;
    startX = e.clientX;
    startY = e.clientY;
    startScrollLeft = container.scrollLeft;
    startScrollTop = container.scrollTop;
  }

  function onMouseMove(e) {
    if (!panning) {
      return;
    }
    var dx = e.clientX - startX;
    var dy = e.clientY - startY;

    if (!moved && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
      moved = true;
      container.classList.add('mm-panning');
    }

    if (moved) {
      container.scrollLeft = startScrollLeft - dx;
      container.scrollTop = startScrollTop - dy;
    }
  }

  // true сразу после того, как завершилось панорамирование с реальным
  // перемещением мыши (не просто клик) — на этот же tick ещё придёт click
  // от mouseup, и app.js может проверить этот флаг, чтобы не сбрасывать
  // выделение узла при обычном клике по фону после pan'а.
  var wasDragging = false;

  function onMouseUp() {
    if (!panning) {
      return;
    }
    panning = false;
    wasDragging = moved;
    moved = false;
    container.classList.remove('mm-panning');
  }

  function wasPanning() {
    return wasDragging;
  }

  // Защита от «зависшего» panning: если пользователь утащил курсор за
  // пределы окна браузера целиком (на другой монитор/приложение) и отпустил
  // кнопку мыши уже там, mouseup на document нашей страницы вообще не
  // произойдёт — panning остался бы true навсегда (до следующего клика).
  // При потере фокуса окна принудительно завершаем панорамирование, как
  // при обычном mouseup, но без выставления wasDragging (это не завершение
  // пользовательского действия кликом, а аварийный сброс состояния).
  function onWindowBlur() {
    if (!panning) {
      return;
    }
    panning = false;
    moved = false;
    container.classList.remove('mm-panning');
  }

  window.addEventListener('blur', onWindowBlur);

  return {
    init: init,
    wasPanning: wasPanning
  };
})();
