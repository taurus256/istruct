/*
 * dragdrop.js — перенос узлов через HTML5 Drag&Drop API.
 * Во время dragover заранее проверяем допустимость переноса (циклы,
 * canHaveChildren целевого типа) и подсвечиваем цель зелёным/красным.
 *
 * Один и тот же жест drag&drop обслуживает ДВА разных сценария, различаемых
 * КЛАВИШЕЙ-МОДИФИКАТОРОМ (Ctrl), а не точкой отпускания мыши:
 *  - обычный drag (без Ctrl)     -> смена иерархии (reparent): работает
 *    только если отпустить МЫШЬ ПОВЕРХ ДРУГОГО УЗЛА; отпускание на свободном
 *    месте контейнера — no-op (как в исходном поведении до появления
 *    ручного позиционирования);
 *  - drag с зажатым Ctrl         -> ручное позиционирование (сдвиг узла и
 *    всей его ветви на дельту перемещения курсора между dragstart и drop),
 *    работает НЕЗАВИСИМО от того, где отпущена мышь — хоть на свободном
 *    месте, хоть поверх другого узла (иерархия в этом случае не меняется).
 * Модификатор выбран Ctrl (не Alt/Meta), т.к. на многих Linux-окружениях
 * (GNOME/KDE) Alt+перетаскивание перехватывается оконным менеджером для
 * перемещения окна целиком, что конфликтовало бы с этим жестом на уровне ОС.
 *
 * Вся логика принятия решения "reparent или reposition" сосредоточена в
 * ОДНОМ месте — обработчиках attachContainerHandlers() на корневом
 * контейнере, т.к. событие 'drop', возникающее на любом дочернем узле,
 * всё равно всплывает до контейнера (per-node обработчики drop не нужны и
 * не регистрируются — это исключает дублирование и рассинхронизацию логики).
 * attachHandlers() на каждом узле отвечает только за визуальную часть:
 * draggable-атрибут, класс .dragging, подсветка допустимой/недопустимой
 * цели при обычном (без Ctrl) drag поверх узла.
 */

var DragDrop = (function () {
  var draggedId = null;
  // Координаты курсора в момент dragstart — нужны, чтобы на drop вычислить
  // (dx, dy) реального перемещения мыши для сценария ручного позиционирования.
  var dragStartX = 0;
  var dragStartY = 0;

  /**
   * Навешивает drag&drop-обработчики на DOM-элемент узла. Отвечает только за
   * визуальные эффекты (draggable, .dragging, подсветка цели переноса) —
   * решение о том, что произойдёт при drop, принимается централизованно в
   * attachContainerHandlers() (см. комментарий в шапке файла).
   */
  function attachHandlers(el, node) {
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
      e.dataTransfer.setData('text/plain', node.id);
      e.dataTransfer.effectAllowed = 'move';
      el.classList.add('dragging');
    });

    el.addEventListener('dragend', function () {
      el.classList.remove('dragging');
      draggedId = null;
      clearDropHighlights();
    });

    el.addEventListener('dragover', function (e) {
      if (!draggedId || draggedId === node.id) {
        return;
      }
      // Ctrl зажат — это будет ручное позиционирование, а не смена
      // иерархии, поэтому подсветка "допустимая/недопустимая цель для
      // reparent" здесь неуместна (сброс на случай, если Ctrl отпустили
      // прямо во время dragover над этим же узлом).
      if (e.ctrlKey) {
        el.classList.remove('drop-valid', 'drop-invalid');
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
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
   * Навешивает на контейнер #mindmap-root ЕДИНСТВЕННЫЙ источник истины для
   * решения о результате drop (см. комментарий в шапке файла). Должен
   * вызываться один раз для корневого контейнера.
   * callbacks.onReparentDrop(draggedId, targetId) — смена родителя (обычный
   *   drag без Ctrl, отпущено поверх узла targetId).
   * callbacks.onRepositionDrop(draggedId, dx, dy) — ручное смещение (Ctrl
   *   зажат в момент drop, независимо от того, что под курсором).
   */
  function attachContainerHandlers(containerEl, callbacks) {
    containerEl.addEventListener('dragover', function (e) {
      if (!draggedId) {
        return;
      }
      var overNode = e.target.closest && e.target.closest('.node');

      if (e.ctrlKey) {
        // Ctrl зажат — drop разрешён в любой точке (и над узлом, и на
        // свободном месте), т.к. результат всегда один — позиционирование.
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        containerEl.classList.add('mm-drop-reposition');
        return;
      }

      containerEl.classList.remove('mm-drop-reposition');
      if (overNode) {
        // Цель — узел, Ctrl не зажат: логику dropEffect/подсветки уже
        // отработал собственный dragover-обработчик узла из attachHandlers().
        return;
      }
      // Свободное место без Ctrl — недопустимая цель в исходном поведении
      // (только смена иерархии поддерживается без модификатора): НЕ вызываем
      // preventDefault(), поэтому браузер сам покажет курсор "запрещено" и
      // событие drop здесь не возникнет.
    });

    containerEl.addEventListener('dragleave', function (e) {
      var overNode = e.target.closest && e.target.closest('.node');
      if (!overNode) {
        containerEl.classList.remove('mm-drop-reposition');
      }
    });

    containerEl.addEventListener('drop', function (e) {
      containerEl.classList.remove('mm-drop-reposition');
      clearDropHighlights();
      if (!draggedId) {
        return;
      }
      var id = draggedId;
      draggedId = null;

      if (e.ctrlKey) {
        // Ручное позиционирование — независимо от того, что под курсором.
        e.preventDefault();
        var dx = e.clientX - dragStartX;
        var dy = e.clientY - dragStartY;
        if (typeof callbacks.onRepositionDrop === 'function') {
          callbacks.onRepositionDrop(id, dx, dy);
        }
        return;
      }

      var overNode = e.target.closest && e.target.closest('.node');
      if (!overNode) {
        return; // свободное место без Ctrl — no-op, как в исходном поведении
      }
      e.preventDefault();
      var targetId = overNode.dataset.id;
      var check = canDrop(id, targetId);
      if (check.ok && typeof callbacks.onReparentDrop === 'function') {
        callbacks.onReparentDrop(id, targetId);
      }
    });
  }

  return {
    attachHandlers: attachHandlers,
    attachContainerHandlers: attachContainerHandlers,
    canDrop: canDrop
  };
})();
