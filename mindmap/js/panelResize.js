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

  // Минимум ширины рабочей области (#mindmap-root) между панелями. Верхнего
  // предела ширины у панели нет, но обе панели вместе не должны перекрываться
  // и выдавливать эту область полностью — иначе с диаграммой нельзя работать.
  var MIN_MINDMAP_ROOT = 200;

  /**
   * Навешивает ресайз на панель.
   * options: {
   *   panelEl: DOM-элемент панели (например #help-panel/#side-panel),
   *   storageKey: строка — ключ localStorage для сохранения ширины,
   *   edge: 'left' | 'right' — на какой стороне панели рисовать ручку
   *     (та сторона, что граничит с #mindmap-root); также определяет знак
   *     дельты движения мыши при вычислении новой ширины,
   *   minWidth: минимальная ширина в px
   * }
   * Верхнего предела ширины нет: панель можно тянуть сколь угодно широко, пока
   * вторая панель и минимальная рабочая область (#mindmap-root) помещаются в
   * окно — панели не перекрываются (см. clampWidth / otherPanelsWidth).
   */
  function attach(options) {
    var panelEl = options.panelEl;
    if (!panelEl) {
      return;
    }
    var storageKey = options.storageKey;
    var edge = options.edge === 'left' ? 'left' : 'right';
    var minWidth = options.minWidth || 260;

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

    // Суммарная ширина ДРУГИХ видимых боковых панелей — соседей panelEl по
    // флекс-строке #work-area (та же строка, что и #mindmap-root). Скрытые
    // панели (display:none по [hidden]) дают 0. Нужна, чтобы верхняя граница
    // ширины этой панели учитывала место, уже занятое второй панелью, и они
    // никогда не перекрывались.
    function otherPanelsWidth() {
      var parent = panelEl.parentElement;
      if (!parent) {
        return 0;
      }
      var total = 0;
      var kids = parent.children;
      for (var i = 0; i < kids.length; i++) {
        var el = kids[i];
        if (el === panelEl || el.nodeName !== 'ASIDE' || el.hasAttribute('hidden')) {
          continue;
        }
        total += el.getBoundingClientRect().width;
      }
      return total;
    }

    // Ограничивает ширину диапазоном [minWidth, hardMax]. Верхнего фиксированного
    // предела нет — hardMax это всё свободное место окна за вычетом второй панели
    // и минимальной рабочей области, поэтому панели не перекрываются. minWidth
    // всегда в приоритете (в очень узком окне свободного места может не хватить).
    function clampWidth(width) {
      var hardMax = window.innerWidth - otherPanelsWidth() - MIN_MINDMAP_ROOT;
      hardMax = Math.max(hardMax, minWidth);
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

    // Пере-ограничивает текущую ширину, когда меняются внешние условия:
    // окно уменьшилось или открылась вторая панель. Без этого панель, ставшая
    // слишком широкой раньше, могла бы перекрыть соседнюю. Во время активного
    // перетаскивания не вмешиваемся — там ширину ведёт onMouseMove.
    function reclamp() {
      if (resizing) {
        return;
      }
      var current = panelEl.getBoundingClientRect().width;
      if (current <= 0) {
        return; // панель скрыта — ширину не трогаем
      }
      var clamped = clampWidth(current);
      if (Math.round(clamped) !== Math.round(current)) {
        applyWidth(clamped);
      }
    }

    handle.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('resize', reclamp);

    // Открытие/закрытие любой боковой панели (переключение атрибута hidden где-то
    // в #work-area) может изменить свободное место — пересчитываем свою ширину.
    if (typeof MutationObserver !== 'undefined' && panelEl.parentElement) {
      var visObserver = new MutationObserver(reclamp);
      visObserver.observe(panelEl.parentElement, {
        subtree: true,
        attributes: true,
        attributeFilter: ['hidden']
      });
    }

    restoreWidth();
  }

  return {
    attach: attach
  };
})();
