/*
 * dragdrop.js — перенос узлов через HTML5 Drag&Drop API.
 * Во время dragover заранее проверяем допустимость переноса (циклы,
 * canHaveChildren целевого типа) и подсвечиваем цель зелёным/красным.
 *
 * Два разных сценария одного и того же жеста drag&drop различаются тем,
 * зажат ли Ctrl в момент отпускания (а не тем, отпущено ли поверх узла —
 * так было раньше, и это путало перемещение позиции с переносом в другого
 * родителя, если узел просто оказывался визуально над другим узлом):
 *  - Ctrl зажат + drop поверх другого узла (.node) -> смена иерархии
 *    (reparent), обрабатывается attachHandlers()/onDrop;
 *  - Ctrl НЕ зажат (drop где угодно — хоть над узлом, хоть на свободном
 *    месте)                                        -> ручное позиционирование
 *    (сдвиг узла и всей его ветви), обрабатывается
 *    attachContainerHandlers()/onRepositionDrop на основе смещения курсора
 *    мыши между dragstart и drop. Если dragover/drop случились над узлом
 *    без Ctrl, per-node обработчик в attachHandlers() намеренно НЕ вызывает
 *    preventDefault()/не глотает событие — оно всплывает к контейнеру и
 *    обрабатывается там точно так же, как drop на свободном месте.
 */

// 1×1 прозрачный GIF — подменяет собой нативный браузерный «призрак» drag&drop (статичный
// снимок перетаскиваемого элемента под курсором), чтобы live-превью ручного
// позиционирования (реальный узел, двигающийся за курсором) было видно пользователю,
// а не закрыто замороженным снимком-призраком.
var TRANSPARENT_DRAG_IMAGE = new Image();
TRANSPARENT_DRAG_IMAGE.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7';

var DragDrop = (function () {
  var draggedId = null;
  // Координаты курсора в момент dragstart — нужны, чтобы на drop вычислить
  // (dx, dy) реального перемещения мыши для сценария ручного позиционирования.
  var dragStartX = 0;
  var dragStartY = 0;
  // Callbacks текущего активного ручного позиционирования — нужны dragend-обработчику
  // на самом узле (attachHandlers), чтобы завершить жест, если drag завершился без нативного 'drop'.
  var activeRepositionCallbacks = null;
  // true между реальным 'drop' и следующим 'dragend'. Chrome иногда не доставляет
  // нативное событие 'drop' при очень быстром drag&drop (известный баг тайминга нативного
  // HTML5 DnD в Chromium, не воспроизводится в Firefox/Safari) — без дополнительной обработки это приводило
  // к тому, что dragend трактовал такой жест как «отмену» и откатывал узел ровно к той позиции, с
  // которой начался drag. Оба drop-обработчика (узла и контейнера) выставляют этот флаг
  // в true — dragend проверяет его, чтобы не обрабатывать уже завершённый жест повторно.
  var dropFired = false;
  // true, если пользователь явно нажал Escape во время активного drag — такой жест должен
  // ОТМЕНЯТЬ перемещение (откат к стартовой позиции), в отличие от Chrome-бага выше,
  // когда 'drop' просто не доставлен браузером, хотя пользователь штатно отпустил кнопку мыши над холстом.
  var escapeCancelled = false;

  document.addEventListener('keydown', function (e) {
    if (draggedId && (e.key === 'Escape' || e.code === 'Escape')) {
      escapeCancelled = true;
    }
  });

  /**
   * Навешивает drag&drop-обработчики на DOM-элемент узла.
   * callbacks.onDrop(draggedId, targetId) вызывается при успешном отпускании.
   */
  function attachHandlers(el, node, callbacks) {
    var isRoot = node.id === Model.getState().rootId;
    // Запрет переноса root: элемент вообще не становится draggable.
    el.setAttribute('draggable', isRoot ? 'false' : 'true');

    el.addEventListener('dragstart', function (e) {
      if (isRoot) {
        e.preventDefault();
        return;
      }
      draggedId = node.id;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      dropFired = false;
      escapeCancelled = false;
      e.dataTransfer.setData('text/plain', node.id);
      e.dataTransfer.effectAllowed = 'move';
      el.classList.add('dragging');
      // Подменяем нативный "призрак" браузера на прозрачный 1x1-пиксель: без
      // этого браузер показывает статичный снимок перетаскиваемого элемента под курсором,
      // который невозможно перерисовать в реальном времени — нам нужен live-превью
      // на реальном узле (см. onRepositionDrag в attachContainerHandlers).
      if (typeof e.dataTransfer.setDragImage === 'function') {
        e.dataTransfer.setDragImage(TRANSPARENT_DRAG_IMAGE, 0, 0);
      }
    });

    el.addEventListener('dragend', function (e) {
      el.classList.remove('dragging');
      var endedId = draggedId;
      draggedId = null;
      // Если нативный 'drop' уже отработал жест (статистический большинство случаев) —
      // ничего делать не нужно, onRepositionDrop/onDrop уже всё завершили.
      if (dropFired) {
        activeRepositionCallbacks = null;
        clearDropHighlights();
        return;
      }
      // 'drop' не сработал. Если это именно настоящая отмена пользователем (Escape, отпущено за
      // пределами окна) — сбрасываем live-превью к нулю, как и раньше. ИНАЧЕ (Chrome-баг
      // тайминга, см. комментарий при dropFired выше) — 'drop' просто не доставлен браузером, хотя
      // жест реально завершился внутри холста — тогда фиксируем позицию сами, как если бы это был
          // настоящий drop, используя координаты самого dragend (он несёт финальные clientX/clientY даже
          // когда drop не сработал).
      var hasCoords = !escapeCancelled && e && (e.clientX || e.clientY);
      var container = activeRepositionCallbacks && activeRepositionCallbacks.__container;
      if (hasCoords && activeRepositionCallbacks && typeof activeRepositionCallbacks.onRepositionDrop === 'function') {
        var dx = e.clientX - dragStartX;
        var dy = e.clientY - dragStartY;
        activeRepositionCallbacks.onRepositionDrop(endedId, dx, dy);
      } else if (activeRepositionCallbacks && typeof activeRepositionCallbacks.onRepositionCancel === 'function') {
        activeRepositionCallbacks.onRepositionCancel(endedId);
      }
      activeRepositionCallbacks = null;
      clearDropHighlights();
    });

    el.addEventListener('dragover', function (e) {
      if (!draggedId || draggedId === node.id) {
        return;
      }
      // Без Ctrl это НЕ смена родителя — намеренно НЕ вызываем
      // preventDefault() и не трогаем классы подсветки: событие всплывёт к
      // attachContainerHandlers() на контейнере, который обработает его как
      // обычное перетаскивание на свободное место (ручное позиционирование),
      // даже если курсор физически сейчас над этим узлом.
      if (!e.ctrlKey) {
        el.classList.remove('drop-valid', 'drop-invalid');
        return;
      }
      e.preventDefault(); // обязательно, иначе drop не сработает

      var check = canDrop(draggedId, node.id);
      el.classList.toggle('drop-valid', check.ok);
      el.classList.toggle('drop-invalid', !check.ok);
      e.dataTransfer.dropEffect = check.ok ? 'move' : 'none';
    });

    el.addEventListener('dragleave', function () {
      el.classList.remove('drop-valid', 'drop-invalid');
    });

    el.addEventListener('drop', function (e) {
      // См. dragover выше: без Ctrl это не наш сценарий — не глотаем
      // событие, пусть всплывёт к контейнеру (ручное позиционирование).
      if (!e.ctrlKey) {
        return;
      }
      e.preventDefault();
      el.classList.remove('drop-valid', 'drop-invalid');
      if (!draggedId) {
        return;
      }

      var check = canDrop(draggedId, node.id);
      if (check.ok && typeof callbacks.onDrop === 'function') {
        callbacks.onDrop(draggedId, node.id);
      }
      draggedId = null;
    });
  }

  /**
   * Предварительная (без побочных эффектов) проверка допустимости переноса —
   * дублирует часть логики Model.moveNode, чтобы подсвечивать цель ДО drop.
   */
  function canDrop(dragId, targetId) {
    if (dragId === targetId) {
      return { ok: false, reason: 'нельзя перенести узел в самого себя' };
    }
    if (dragId === Model.getState().rootId) {
      return { ok: false, reason: 'root нельзя перемещать' };
    }
    // Защита от циклов: если цель — потомок перемещаемого узла, перенос запрещён.
    if (Model.isDescendant(dragId, targetId)) {
      return { ok: false, reason: 'цель является потомком перемещаемого узла (цикл)' };
    }
    var targetNode = Model.getNode(targetId);
    if (!targetNode) {
      return { ok: false, reason: 'целевой узел не найден' };
    }
    var typeDef = NodeTypeRegistry.get(targetNode.type);
    if (typeDef && typeDef.canHaveChildren === false) {
      return { ok: false, reason: 'целевой тип узла не принимает детей' };
    }
    return { ok: true };
  }

  function clearDropHighlights() {
    var els = document.querySelectorAll('.drop-valid, .drop-invalid, .mm-drop-reposition');
    els.forEach(function (el) {
      el.classList.remove('drop-valid', 'drop-invalid', 'mm-drop-reposition');
    });
  }

  /**
   * Навешивает на контейнер #mindmap-root обработчики drop на ручное
   * позиционирование — свободное место ИЛИ (без зажатого Ctrl) поверх
   * другого узла: тогда его собственный dragover/drop из attachHandlers()
   * намеренно не глотает событие (не вызывает preventDefault), и оно
   * всплывает сюда же. Должен вызываться один раз для корневого контейнера,
   * отдельно от attachHandlers() на каждом узле.
   * callbacks.onRepositionDrop(draggedId, dx, dy) — dx/dy в пикселях,
   * смещение курсора мыши между dragstart и drop.
   * callbacks.onRepositionDrag(draggedId, dx, dy) — вызывается НЕОДНОКРАТНО во время
   * перетаскивания (на каждый кадр, через requestAnimationFrame-троттлинг) с теми
   * же dx/dy, чтобы отрисовать live-превью перемещения ветви за курсором до drop.
   * callbacks.onRepositionCancel(draggedId) — drag завершён без drop (dragend без
   * предшествующего 'drop'), live-превью нужно сбросить.
   */
  function attachContainerHandlers(containerEl, callbacks) {
    // Сценарий смены иерархии (Ctrl + drop поверх узла) полностью обрабатывает
    // сам узел (attachHandlers) — здесь его нужно пропустить, не перехватывая
    // как ручное позиционирование.
    function isReparentScenario(e) {
      var overNode = e.target.closest && e.target.closest('.node');
      return !!(overNode && e.ctrlKey);
    }

    // Троттлинг onRepositionDrag через rAF: dragover стреляет значительно чаще, чем
    // браузер успевает отрисовать кадр — вызываем live-превью не чаще одного раза
    // на кадр, чтобы не нагружать главный поток лишними пересчётами стилей.
    var dragFrameScheduled = false;

    containerEl.addEventListener('dragover', function (e) {
      if (!draggedId || isReparentScenario(e)) {
        return;
      }
      e.preventDefault(); // разрешить drop как ручное позиционирование
      e.dataTransfer.dropEffect = 'move';
      containerEl.classList.add('mm-drop-reposition');

      activeRepositionCallbacks = callbacks;
      if (typeof callbacks.onRepositionDrag === 'function' && !dragFrameScheduled) {
        dragFrameScheduled = true;
        var liveDx = e.clientX - dragStartX;
        var liveDy = e.clientY - dragStartY;
        var liveId = draggedId;
        requestAnimationFrame(function () {
          dragFrameScheduled = false;
          // draggedId мог уже сброситься к моменту кадра (drop/dragend уже случились) —
          // не применяем устаревшую превью.
          if (draggedId === liveId) {
            callbacks.onRepositionDrag(liveId, liveDx, liveDy);
          }
        });
      }
    });

    containerEl.addEventListener('dragleave', function (e) {
      if (!isReparentScenario(e)) {
        containerEl.classList.remove('mm-drop-reposition');
      }
    });

    containerEl.addEventListener('drop', function (e) {
      containerEl.classList.remove('mm-drop-reposition');
      if (!draggedId || isReparentScenario(e)) {
        // Сценарий смены иерархии — перенос (reparent) уже обработан
        // drop-обработчиком самого узла (событие в него попало раньше и
        // всплыло сюда же).
        return;
      }
      e.preventDefault();
      var id = draggedId;
      var dx = e.clientX - dragStartX;
      var dy = e.clientY - dragStartY;
      draggedId = null;
      activeRepositionCallbacks = null;
      if (typeof callbacks.onRepositionDrop === 'function') {
        callbacks.onRepositionDrop(id, dx, dy);
      }
    });
  }

  return {
    attachHandlers: attachHandlers,
    attachContainerHandlers: attachContainerHandlers,
    canDrop: canDrop
  };
})();
