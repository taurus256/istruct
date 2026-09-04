/*
 * panelResize.js — переиспользуемая логика ресайза (изменения ширины
 * перетаскиванием) для боковых панелей приложения (#help-panel слева,
 * #side-panel справа). Единая реализация для обеих панелей — вызывающий
 * код (app.js) передаёт DOM-элемент панели, ключ localStorage и сторону,
 * на которой рисуется ручка-разделитель.
 *
 * Ширина панели — чисто UI-настройка (НЕ данные диаграммы): сохраняется в
 * localStorage под своим ключом на каждую панель, НЕ входит в экспорт/импорт
 * JSON схемы (аналогично теме — см. theme.js, mindmap-theme).
 *
 * Не зависит от Model/Render — работает только с DOM, поэтому может быть
 * подключён в любом месте до app.js (который и вызывает PanelResize.attach()
 * для обеих панелей при инициализации).
 */

var PanelResize = (function () {
  // Порог в пикселях, после которого движение мыши считается перетаскиванием
  // ручки (а не дрожанием руки при обычном клике) — по аналогии с pan.js.
  var DRAG_THRESHOLD = 3;

  /**
   * Навешивает ресайз на панель.
   * options: {
   *   panelEl: DOM-элемент панели (например #help-panel/#side-panel),
   *   storageKey: строка — ключ localStorage для сохранения ширины,
   *   edge: 'left' | 'right' — на какой стороне панели рисовать ручку
   *     (та сторона, что граничит с #mindmap-root); также определяет знак
   *     дельты движения мыши при вычислении новой ширины,
   *   minWidth: минимальная ширина в px,
   *   maxWidth: максимальная ширина в px
   * }
   */
  function attach(options) {
    var panelEl = options.panelEl;
    if (!panelEl) {
      return;
    }
    var storageKey = options.storageKey;
    var edge = options.edge === 'left' ? 'left' : 'right';
    var minWidth = options.minWidth || 260;
    var maxWidth = options.maxWidth || 700;

    // Якорь для абсолютно позиционированной ручки.
    panelEl.style.position = panelEl.style.position || 'relative';

    // Ручка-разделитель — создаётся программно (не в разметке index.html),
    // чтобы весь жизненный цикл ресайза был инкапсулирован в этом модуле.
    var handle = document.createElement('div');
    handle.className = 'panel-resize-handle panel-resize-handle--' + edge;
    panelEl.appendChild(handle);

    // Некоторые вью (например help.js) перерисовывают своё содержимое через
    // panelEl.innerHTML = ..., что стирает добавленную выше ручку (она была простым
    // ребёнком panelEl). Следим за childList через MutationObserver и восстанавливаем
    // ручку, если она пропала из DOM — без этого каждый рендер вью убивал бы возможность
    // ресайза. Для панелей, которые не трогают innerHTML контейнера напрямую (например
    // #side-panel, где innerHTML меняют только вложенные вью), наблюдатель просто никогда не срабатывает.
    if (typeof MutationObserver !== 'undefined') {
      var observer = new MutationObserver(function () {
        if (!panelEl.contains(handle)) {
          panelEl.appendChild(handle);
        }
      });
      observer.observe(panelEl, { childList: true });
    }

    // Применяет ширину и к самому элементу (переопределяет CSS
    // flex: 0 0 400px инлайн-стилем — стандартный надёжный способ).
    function applyWidth(width) {
      panelEl.style.flexBasis = width + 'px';
      panelEl.style.width = width + 'px';
    }

    // Ограничивает ширину диапазоном [minWidth, maxWidth] и дополнительно
    // не позволяет панели съесть весь экран — оставляем #mindmap-root не
    // менее 200px, иначе диаграмма становится непригодной для работы.
    function clampWidth(width) {
      var hardMax = Math.min(maxWidth, window.innerWidth - 200);
      return Math.max(minWidth, Math.min(width, hardMax));
    }

    // Восстанавливаем сохранённую ширину при инициализации (fallback —
    // текущая CSS-ширина, если ничего не сохранено или значение невалидно).
    function restoreWidth() {
      var saved = null;
      try {
        saved = localStorage.getItem(storageKey);
      } catch (e) {
        saved = null;
      }
      var parsed = saved != null ? parseInt(saved, 10) : NaN;
      if (isFinite(parsed) && parsed > 0) {
        applyWidth(clampWidth(parsed));
      }
      // Если сохранённого значения нет/оно невалидно — оставляем как есть
      // (текущая CSS-ширина 400px из layout.css), ничего не переопределяем.
    }

    function saveWidth(width) {
      try {
        localStorage.setItem(storageKey, String(width));
      } catch (e) {
        // localStorage недоступен (приватный режим и т.п.) — просто не сохраняем.
      }
    }

    var resizing = false;
    var moved = false;
    var startX = 0;
    var startWidth = 0;

    function onMouseDown(e) {
      if (e.button !== 0) {
        return; // только левая кнопка мыши
      }
      // Подавляем нативное выделение текста на странице при перетаскивании
      // (тот же приём, что в pan.js — иначе браузер запускает собственное
      // text-selection-drag поверх нашей логики).
      e.preventDefault();

      resizing = true;
      moved = false;
      startX = e.clientX;
      startWidth = panelEl.getBoundingClientRect().width;
    }

    function onMouseMove(e) {
      if (!resizing) {
        return;
      }
      var dx = e.clientX - startX;

      if (!moved && Math.abs(dx) > DRAG_THRESHOLD) {
        moved = true;
        document.body.classList.add('mm-resizing');
      }

      if (moved) {
        // Панель растёт "от центра экрана наружу": для правой панели
        // (edge:'left', граница слева) движение мыши влево увеличивает
        // ширину; для левой панели (edge:'right', граница справа) —
        // движение мыши вправо увеличивает ширину.
        var delta = edge === 'left' ? -dx : dx;
        applyWidth(clampWidth(startWidth + delta));
      }
    }

    function onMouseUp() {
      if (!resizing) {
        return;
      }
      resizing = false;
      document.body.classList.remove('mm-resizing');
      if (moved) {
        var finalWidth = panelEl.getBoundingClientRect().width;
        saveWidth(Math.round(finalWidth));
      }
      moved = false;
    }

    // Защита от «зависшего» ресайза, если Ctrl/кнопка мыши отпущены за
    // пределами окна браузера — аналогично защите в pan.js.
    function onWindowBlur() {
      if (!resizing) {
        return;
      }
      resizing = false;
      moved = false;
      document.body.classList.remove('mm-resizing');
    }

    handle.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    window.addEventListener('blur', onWindowBlur);

    restoreWidth();
  }

  return {
    attach: attach
  };
})();
