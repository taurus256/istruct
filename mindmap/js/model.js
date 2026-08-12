/*
 * model.js — модель дерева mind map.
 * Хранит узлы в плоском объекте {id: node} + идентификатор корня rootId.
 * Каждый узел: { id, type, text, parentId, data: {} }.
 * Корневой узел ровно один и не может быть удалён.
 *
 * data.offset — необязательное ручное смещение узла (и всей его ветви,
 * т.к. render.js применяет transform к обёртке узел+дети как единому целому)
 * относительно позиции, вычисленной автоматическим радиальным layout'ом:
 * { dx: number, dy: number } в пикселях. Отсутствует у узлов, которые ни разу
 * не были перемещены вручную (обычное поведение — авто-layout). Сбрасывается
 * при смене родителя (moveNode), т.к. смещение имеет смысл только относительно
 * прежнего места в дереве.
 *
 * data.comment — необязательный АТРИБУТ-комментарий узла (строка, может быть
 * многострочной). Это НЕ отдельный тип узла, а свойство любого узла любого
 * типа. Отсутствие поля означает «комментария нет». См.
 * setComment/getComment/clearComment ниже и render.js (.node__comment).
 */

var Model = (function () {
  var state = {
    rootId: null,
    nodes: {}
  };

  var idCounter = 0;

  // Простой генератор уникальных id без внешних библиотек.
  function generateId() {
    idCounter += 1;
    return 'n' + Date.now().toString(36) + idCounter.toString(36);
  }

  function getState() {
    return state;
  }

  // Полная замена состояния (используется storage.js при load/import).
  function setState(newState) {
    state = {
      rootId: newState.rootId,
      nodes: newState.nodes
    };
  }

  function getNode(id) {
    return state.nodes[id] || null;
  }

  function getRoot() {
    return getNode(state.rootId);
  }

  function getChildren(id) {
    var result = [];
    for (var key in state.nodes) {
      if (Object.prototype.hasOwnProperty.call(state.nodes, key) && state.nodes[key].parentId === id) {
        result.push(state.nodes[key]);
      }
    }
    return result;
  }



  /**
   * Создаёт новый узел заданного типа как ребёнка parentId.
   * Если parentId не указан и дерево пустое — узел становится корнем.
   * direction (только для прямых детей корня) — 'up'|'down'|'left'|'right',
   * задаёт, в какой из 4 ветвей растёт этот поддерево.
   * Более глубокие потомки наследуют направление от этого ближайшего предка
   * (своё data.direction у них не хранится).
   */
  function createNode(type, parentId, text, direction) {
    var typeDef = NodeTypeRegistry.get(type);
    if (!typeDef) {
      throw new Error('Неизвестный тип узла: ' + type);
    }

    var parent = parentId ? getNode(parentId) : null;
    if (parentId && !parent) {
      throw new Error('Родительский узел не найден: ' + parentId);
    }
    if (parent) {
      var parentTypeDef = NodeTypeRegistry.get(parent.type);
      if (parentTypeDef && parentTypeDef.canHaveChildren === false) {
        throw new Error('Узел типа "' + parent.type + '" не может иметь детей');
      }
      // Если тип узла ограничен до одного экземпляра на родителя
      // (singletonPerParent), а такой ребёнок уже есть — запретить.
      // Сейчас ни один зарегистрированный тип этот флаг не использует
      // (комментарий стал атрибутом data.comment, а не типом узла),
      // но механизм оставлен обобщённым для будущих типов.
      if (typeDef.singletonPerParent === true) {
        var siblings = getChildren(parentId);
        var hasSameType = siblings.some(function (sibling) {
          return sibling.type === type;
        });
        if (hasSameType) {
          throw new Error('У родителя уже есть ребёнок типа "' + type + '"');
        }
      }
    }

    var id = generateId();
    var node = {
      id: id,
      type: type,
      // text != null позволяет отличить осознанно пустую строку от "не передано"
      text: (text !== undefined && text !== null) ? text : typeDef.defaultText,
      parentId: parentId || null,
      data: {}
    };

    // direction играет роль только для прямых детей корня — они являются корнявыми
    // ветвями радиального layout.
    if (parentId && parentId === state.rootId) {
      node.data.direction = direction || 'right';
    }

    state.nodes[id] = node;

    if (!state.rootId) {
      state.rootId = id; // первый созданный узел автоматически становится корнем
    }

    return node;
  }

  /**
   * Возвращает направление ветви ('up'|'down'|'left'|'right'), к которой
   * принадлежит узел. Для root возвращает null. Для остальных узлов
   * поднимается по цепочке родителей до узла, чьё parentId === rootId,
   * и берёт его data.direction (fallback 'right', если поле почему-то отсутствует
   * — например, у данных, созданных до введения радиального layout).
   */
  function getDirection(nodeId) {
    if (nodeId === state.rootId) {
      return null;
    }
    var current = getNode(nodeId);
    if (!current) {
      return null;
    }
    while (current && current.parentId !== state.rootId) {
      current = getNode(current.parentId);
    }
    if (!current) {
      return 'right';
    }
    return (current.data && current.data.direction) || 'right';
  }

  /**
   * Удаляет узел. ВАЖНО: удаление НЕ каскадное — дети удаляемого узла
   * переносятся к его родителю. Корень удалить нельзя.
   */
  function removeNode(id) {
    if (id === state.rootId) {
      return false; // root неудаляем — no-op
    }

    var node = getNode(id);
    if (!node) {
      return false;
    }

    var newParentId = node.parentId;
    var children = getChildren(id);
    children.forEach(function (child) {
      child.parentId = newParentId;
    });

    delete state.nodes[id];
    return true;
  }

  // Проверяет, является ли candidateId потомком ancestorId (или тем же узлом).
  function isDescendant(ancestorId, candidateId) {
    var current = getNode(candidateId);
    while (current) {
      if (current.id === ancestorId) {
        return true;
      }
      current = current.parentId ? getNode(current.parentId) : null;
    }
    return false;
  }

  /**
   * Переносит узел id к новому родителю newParentId.
   * Возвращает { ok: boolean, reason?: string }.
   * Защита от циклов: нельзя переместить узел в самого себя или в своего потомка.
   */
  function moveNode(id, newParentId) {
    if (id === state.rootId) {
      return { ok: false, reason: 'root нельзя перемещать' };
    }
    if (id === newParentId) {
      return { ok: false, reason: 'нельзя переместить узел в самого себя' };
    }

    var node = getNode(id);
    var newParent = getNode(newParentId);
    if (!node || !newParent) {
      return { ok: false, reason: 'узел или новый родитель не найдены' };
    }

    // Ключевая проверка от циклов: если newParentId — потомок id,
    // перемещение создало бы петлю в дереве.
    if (isDescendant(id, newParentId)) {
      return { ok: false, reason: 'нельзя переместить узел в своего потомка (цикл)' };
    }

    var parentTypeDef = NodeTypeRegistry.get(newParent.type);
    if (parentTypeDef && parentTypeDef.canHaveChildren === false) {
      return { ok: false, reason: 'целевой узел не может иметь детей' };
    }

    var oldParentId = node.parentId;
    node.parentId = newParentId;

    // Синхронизация data.direction с новым местом узла в дереве:
    if (newParentId === state.rootId) {
      // Стал прямым ребёнком корня — если направление ещё не задано, назначаем по умолчанию.
      if (!node.data.direction) {
        node.data.direction = 'right';
      }
    } else if (oldParentId === state.rootId) {
      // Был прямым ребёнком корня, а теперь нет — direction больше не нужен,
      // направление теперь наследуется от нового родителя.
      delete node.data.direction;
    }

    // Ручное смещение (data.offset) вычислялось относительно позиции узла
    // под СТАРЫМ родителем — под новым родителем оно потеряло бы смысл
    // (узел визуально "улетел" бы в случайную точку). Сбрасываем, чтобы
    // узел встал на автоматическую позицию нового поддерева.
    delete node.data.offset;

    return { ok: true };
  }

  /**
   * Задаёт абсолютное ручное смещение узла (и всей его ветви — см. render.js)
   * относительно автоматически вычисленной radial-позиции.
   */
  function setOffset(id, dx, dy) {
    var node = getNode(id);
    if (!node || id === state.rootId) {
      return false; // root не перемещается вручную, как и через drag&drop
    }
    node.data.offset = { dx: dx, dy: dy };
    return true;
  }

  /**
   * Добавляет (dx, dy) к уже накопленному ручному смещению узла — используется
   * при повторном перетаскивании уже смещённого узла (смещения суммируются).
   */
  function addOffset(id, dx, dy) {
    var node = getNode(id);
    if (!node || id === state.rootId) {
      return false;
    }
    var current = node.data.offset || { dx: 0, dy: 0 };
    node.data.offset = { dx: current.dx + dx, dy: current.dy + dy };
    return true;
  }

  // Возвращает узел к автоматической radial-позиции (снимает ручное смещение).
  function clearOffset(id) {
    var node = getNode(id);
    if (!node || !node.data.offset) {
      return false;
    }
    delete node.data.offset;
    return true;
  }

  function updateNodeText(id, text) {
    var node = getNode(id);
    if (!node) {
      return false;
    }
    node.text = text;
    return true;
  }

  /**
   * Комментарий — необязательный атрибут любого узла (node.data.comment):
   * многострочный текст. Хранится только когда задан (пустой/отсутствующий —
   * это «комментария нет»).
   */
  function setComment(id, text) {
    var node = getNode(id);
    if (!node) {
      return false;
    }
    node.data.comment = text;
    return true;
  }

  function getComment(id) {
    var node = getNode(id);
    return (node && node.data) ? node.data.comment : undefined;
  }

  function clearComment(id) {
    var node = getNode(id);
    if (!node || node.data.comment === undefined) {
      return false;
    }
    delete node.data.comment;
    return true;
  }

  // Создаёт пустую модель с одним корневым узлом типа "main".
  function initEmpty() {
    state = { rootId: null, nodes: {} };
    createNode('main', null, 'Корневой узел');
    return state;
  }

  return {
    getState: getState,
    setState: setState,
    getNode: getNode,
    getRoot: getRoot,
    getChildren: getChildren,
    createNode: createNode,
    removeNode: removeNode,
    moveNode: moveNode,
    isDescendant: isDescendant,
    updateNodeText: updateNodeText,
    setComment: setComment,
    getComment: getComment,
    clearComment: clearComment,
    getDirection: getDirection,
    setOffset: setOffset,
    addOffset: addOffset,
    clearOffset: clearOffset,
    initEmpty: initEmpty
  };
})();
