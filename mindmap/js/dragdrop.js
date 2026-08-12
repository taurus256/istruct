/*
 * dragdrop.js — перенос узлов через HTML5 Drag&Drop API.
 * Во время dragover заранее проверяем допустимость переноса (циклы,
 * canHaveChildren целевого типа) и подсвечиваем цель зелёным/красным.
 *
 * Один и тот же жест drag&drop обслуживает ДВА разных сценария, различаемых
 * только точкой отпускания мыши:
 *  - drop поверх другого узла (.node)          -> смена иерархии (reparent),
 *    обрабатывается attachHandlers()/onDrop, как и раньше;
 *  - drop на свободном месте контейнера        -> ручное позиционирование
 *    (сдвиг узла и всей его ветви), обрабатывается
 *    attachContainerHandlers()/onRepositionDrop на основе смещения курсора
 *    мыши между dragstart и drop.
 */

var DragDrop = (function () {
  var draggedId = null;
  // Координаты курсора в момент dragstart — нужны, чтобы на drop вычислить
  // (dx, dy) реального перемещения мыши для сценария ручного позиционирования.
  var dragStartX = 0;
  var dragStartY = 0;

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
   * Навешивает на контейнер #mindmap-root обработчики drop на СВОБОДНОЕ
   * место (не на узел) — включают ручное позиционирование перетаскиваемого
   * узла вместо смены родителя. Должен вызываться один раз для корневого
   * контейнера, отдельно от attachHandlers() на каждом узле.
   * callbacks.onRepositionDrop(draggedId, dx, dy) — dx/dy в пикселях,
   * смещение курсора мыши между dragstart и drop.
   */
  function attachContainerHandlers(containerEl, callbacks) {
    containerEl.addEventListener('dragover', function (e) {
      if (!draggedId) {
        return;
      }
      var overNode = e.target.closest && e.target.closest('.node');
      if (overNode) {
        // Цель — узел: логику dropEffect/подсветки уже отработал его
        // собственный dragover-обработчик из attachHandlers().
        return;
      }
      e.preventDefault(); // разрешить drop на свободном месте
      e.dataTransfer.dropEffect = 'move';
      containerEl.classList.add('mm-drop-reposition');
    });

    containerEl.addEventListener('dragleave', function (e) {
      var overNode = e.target.closest && e.target.closest('.node');
      if (!overNode) {
        containerEl.classList.remove('mm-drop-reposition');
      }
    });

    containerEl.addEventListener('drop', function (e) {
      containerEl.classList.remove('mm-drop-reposition');
      if (!draggedId) {
        return;
      }
      var overNode = e.target.closest && e.target.closest('.node');
      if (overNode) {
        // Цель — узел: перенос (reparent) уже обработан drop-обработчиком
        // самого узла (событие в него попало раньше и всплыло сюда же).
        return;
      }
      e.preventDefault();
      var id = draggedId;
      var dx = e.clientX - dragStartX;
      var dy = e.clientY - dragStartY;
      draggedId = null;
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
