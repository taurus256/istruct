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

    // Если реально было перемещение (а не просто клик по фону) —
    // сохраняем итоговую позицию панорамирования в модель данных активной
    // схемы, чтобы при следующем открытии показать ту же область. Храним в
    // НАТУРАЛЬНЫХ координатах (без учёта текущего зума — см. zoom.js, где
    // CSS zoom масштабирует и scrollLeft/scrollTop), чтобы восстановление
    // было корректным независимо от того, на каком зуме схему открыли в
    // следующий раз. pan.js концептуально не зависит от Render/Storage
    // (работает с голым DOM), поэтому обращаемся к ним через typeof-проверку
    // — на случай отсутствия (не должно случаться при обычном порядке
    // подключения скриптов, но не плодим жёсткую зависимость).
    if (wasDragging && typeof Storage !== 'undefined' && typeof Storage.setPan === 'function') {
      var zoom = (typeof Render !== 'undefined' && typeof Render.getZoom === 'function') ? (Render.getZoom() || 1) : 1;
      Storage.setPan(container.scrollLeft / zoom, container.scrollTop / zoom);
    }
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

  // Восстанавливает сохранённую в модели данных активной схемы позицию
  // панорамирования (Storage.getPan(), хранится в НАТУРАЛЬНЫХ координатах,
  // см. storage.js про version 9). Вызывать нужно ПОСЛЕ того, как дерево
  // отрисовано (renderAll уже применил compensateNegativeOffsets и дал
  // контейнеру финальный scrollWidth/scrollHeight) И ПОСЛЕ того, как
  // применён актуальный зум (Zoom.init()/восстановление схемы из панели
  // "ФАЙЛ"), иначе координаты собьются последующим изменением зума.
  //
  // КРИТИЧНО: сырые сохранённые координаты НЕ применяются напрямую —
  // клампятся в актуальный допустимый диапазон [0, scrollWidth-clientWidth] /
  // [0, scrollHeight-clientHeight]. Это защищает от восстановления заведомо
  // недостижимой позиции, если содержимое/размер окна изменились с момента
  // сохранения (например узел удалён/добавлен, или зум восстановлен на другой
  // величине).
  function restore() {
    if (!container || typeof Storage === 'undefined' || typeof Storage.getPan !== 'function') {
      return;
    }
    var pan = Storage.getPan();
    if (!pan) {
      return; // ничего не сохранено — оставляем стандартное scrollLeft=0/scrollTop=0
    }

    function apply() {
      var zoom = (typeof Render !== 'undefined' && typeof Render.getZoom === 'function') ? (Render.getZoom() || 1) : 1;
      var maxLeft = Math.max(0, container.scrollWidth - container.clientWidth);
      var maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
      var left = pan.x * zoom;
      var top = pan.y * zoom;
      container.scrollLeft = left < 0 ? 0 : (left > maxLeft ? maxLeft : left);
      container.scrollTop = top < 0 ? 0 : (top > maxTop ? maxTop : top);
    }

    // Сразу после Render.setZoom() (который вызывает Zoom.init() при восстановлении
    // сохранённого зума) scrollWidth/scrollHeight контейнера МОГУТ быть ЕЩЁ
    // НЕФИНАЛЬНЫМИ: узлы с ручным data.offset досчитывают финальную позицию
    // АСИНХРОННО (beginConnectorsSettle/verifyConnectorsSettled в render.js — до нескольких
    // доп. кадров после смены зума). Если применить клампинг до этого — scrollLeft/scrollTop
    // обрежутся по заниженному (ещё не досчитанному) maxScroll и НЕ пересчитается сам после
    // того, как геометрия дорастёт до итоговой — поэтому ждём реальной стабилизации через
    // Render.whenGeometrySettled (вызовет синхронно, если стабилизация не идёт).
    if (typeof Render !== 'undefined' && typeof Render.whenGeometrySettled === 'function') {
      Render.whenGeometrySettled(apply);
    } else {
      apply();
    }
  }

  return {
    init: init,
    wasPanning: wasPanning,
    restore: restore
  };
})();
