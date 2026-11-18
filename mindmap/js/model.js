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
 *
 * data.note — необязательный АТРИБУТ-заметка узла (строка в формате Markdown,
 * многострочная). Редактируется через боковую панель заметок (notes.js).
 * Отсутствие поля означает «заметки нет». См. setNote/getNote/clearNote ниже.
 *
 * data.test и data.testResult — необязательные поля тестирования (версия
 * формата 4): data.test — ОПРЕДЕЛЕНИЕ теста (вопросы/варианты/порог), создаётся
 * внешним приложением (редактора в UI нет); data.testResult — результат
 * ПОСЛЕДНЕЙ попытки (историю не храним), пишется только при завершении
 * прохождения. Формат см. storage.js (version 4). См. setTest/getTest/hasTest/
 * clearTest и setTestResult/getTestResult/clearTestResult ниже, а также test.js.
 *
 * data.marked — необязательный АТРИБУТ-отметка узла (boolean, версия формата 5):
 * визуальный маркер (зелёная рамка + "вкладка" слева, см. theme.css), который
 * может быть установлен тремя способами: вручную кнопкой "Выполнен" тулбара
 * (toggleMarked), автоматически при успешном прохождении теста (test.js —
 * см. data.test/data.testResult выше) либо автоматически для узла-родителя,
 * когда ВСЕ его дети отмечены (см. recomputeAncestorMarks — "все дети
 * выполнены ⇒ родитель выполнен"). Отсутствие поля равнозначно false.
 * Корневой узел не отмечается (см. Render.toggleMarked).
 * См. setMarked/isMarked/toggleMarked/recomputeAncestorMarks ниже.
 *
 * data.color — необязательный АТРИБУТ цвета фона узла (строка, версия
 * формата 8): один из NODE_COLORS ("yellow"|"gray"|"green"|"pink"|"blue"),
 * переключается кнопками группы "Цвета" тулбара (вкладка УЗЛЫ). Отсутствие
 * поля (или значение не из NODE_COLORS) равнозначно «цвет не задан» —
 * нейтральный фон по умолчанию. Независим от data.marked: оба атрибута
 * могут быть установлены одновременно (цвет красит фон, отметка — рамку).
 * Корневой узел не окрашивается (см. Render.setNodeColor).
 * См. NODE_COLORS/setColor/getColor/clearColor ниже.
 *
 * "locked" (версия формата 10) — флаг СХЕМЫ ЦЕЛИКОМ, а не узла: у пайлоада
 * рядом с version/rootId/nodes (см. storage.js) может стоять "locked": true,
 * что означает «схема только для чтения» (файл «Экспортировать курс»).
 * В модель флаг НЕ попадает (он не часть дерева и не участвует в
 * undo-снапшотах) — живёт в Storage (currentLocked, см. Storage.getLocked),
 * а Model.isLocked() отдаёт его здесь же. См. isLocked ниже и actionManager.js.
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

  /**
   * true, если АКТИВНАЯ схема открыта в РЕЖИМЕ АННОТИРОВАНИЯ
   * ("locked": true в её пайлоаде, см. шапку файла). Флаг берётся из
   * Storage, а не из state — он не часть дерева и не должен попадать в
   * undo-снапшоты. В режиме аннотирования структура схемы менять нельзя
   * (создание/удаление/перенос/текст/offset/comments-структура/тела тестов),
   * а аннотации (note, comment, color, marked, testResult) — можно.
   */
  function isLocked() {
    return !!(typeof Storage !== 'undefined' && typeof Storage.getLocked === 'function' && Storage.getLocked());
  }

  function getState() {
    return state;
  }

  // Полная замена состояния (используется storage.js при load/import).
  // ВАЖНО: в сериализованном формате (version 6) у узлов НЕТ внутреннего поля
  // id — идентификатор узла это его КЛЮЧ в объекте nodes. В памяти же весь код
  // (render.js, dragdrop.js, isDescendant и др.) читает node.id, поэтому здесь
  // восстанавливаем id из ключа. Ключ — первичный идентификатор: если в старых
  // данных (version ≤5) у узла было внутреннее id и оно вдруг расходится с
  // ключом — ключ побеждает (перезаписывает node.id).
  function setState(newState) {
    var nodes = newState.nodes || {};
    for (var key in nodes) {
      if (Object.prototype.hasOwnProperty.call(nodes, key)) {
        nodes[key].id = key;
      }
    }
    state = {
      rootId: newState.rootId,
      nodes: nodes
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
    if (isLocked()) {
      return false;
    }
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
    if (isLocked()) {
      return { ok: false, reason: 'схема открыта только для чтения' };
    }
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
    if (isLocked()) {
      return false;
    }
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
    if (isLocked()) {
      return false;
    }
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
    if (isLocked()) {
      return false;
    }
    var node = getNode(id);
    if (!node || !node.data.offset) {
      return false;
    }
    delete node.data.offset;
    return true;
  }

  function updateNodeText(id, text) {
    if (isLocked()) {
      return false;
    }
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
    if (isLocked()) {
      return false;
    }
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
    if (isLocked()) {
      return false;
    }
    var node = getNode(id);
    if (!node || node.data.comment === undefined) {
      return false;
    }
    delete node.data.comment;
    return true;
  }

  /**
   * Отметка — необязательный атрибут любого узла (node.data.marked): boolean.
   * Чисто визуальный маркер (зелёная рамка), не влияет на структуру/логику
   * дерева. Хранится только когда true — отсутствие поля равнозначно false.
   */
  function setMarked(id, value) {
    var node = getNode(id);
    if (!node) {
      return false;
    }
    if (value) {
      node.data.marked = true;
    } else {
      delete node.data.marked;
    }
    return true;
  }

  function isMarked(id) {
    var node = getNode(id);
    return !!(node && node.data && node.data.marked);
  }

  function toggleMarked(id) {
    var node = getNode(id);
    if (!node) {
      return null;
    }
    var next = !isMarked(id);
    setMarked(id, next);
    return next;
  }

  /**
   * Пересчитывает "производную" отметку узлов с детьми по правилу: узел,
   * имеющий детей, считается выполненным (marked), когда отметку имеют ВСЕ
   * его дети — иначе отметка снимается. Поднимается от startId вверх по
   * цепочке родителей, пока отметка предка реально меняется (дальше по
   * цепочке, если отметка не поменялась, пересчёт тоже ничего не даст).
   * Корневой узел никогда не получает отметку (см. комментарий к data.marked
   * выше) — цепочка останавливается, до него не доходя.
   *
   * Вызывается ПОСЛЕ любого изменения, способного повлиять на "завершённость"
   * родителя: ручной toggleMarked, авто-отметка теста (см. setTestResult в
   * test.js) и структурные изменения — добавление/удаление/перенос узла
   * (см. render.js: addChild/deleteNode/onDrop). Листовые узлы (без детей)
   * не трогает — у них отметка не производная (ручная или от теста).
   *
   * Возвращает массив id узлов, чья отметка реально изменилась (вызывающий
   * код использует его, чтобы точечно обновить DOM без полного renderAll()
   * там, где это уместно — см. Render.toggleMarked).
   */
  function recomputeAncestorMarks(startId) {
    var changed = [];
    var id = startId;
    while (id != null && id !== state.rootId) {
      var node = getNode(id);
      if (!node) {
        break;
      }
      var children = getChildren(id);
      var allChildrenMarked = children.length > 0 && children.every(function (child) {
        return !!(child.data && child.data.marked);
      });
      var wasMarked = isMarked(id);
      if (allChildrenMarked === wasMarked) {
        break; // выше по цепочке ничего не изменится
      }
      setMarked(id, allChildrenMarked);
      changed.push(id);
      id = node.parentId;
    }
    return changed;
  }

  /**
   * Цвет фона — необязательный атрибут любого узла (node.data.color): один
   * из NODE_COLORS. Чисто визуальный, не влияет на структуру/логику дерева.
   * Хранится только когда задан допустимым значением — отсутствие поля 
   * равнозначно «цвет не задан» (setColor с недопустимым/пустым значением
   * ведёт себя как clearColor). Аннотация: доступна и в locked-схеме.
   */
  var NODE_COLORS = ['yellow', 'gray', 'green', 'pink', 'blue'];

  function setColor(id, colorKey) {
    var node = getNode(id);
    if (!node) {
      return false;
    }
    if (NODE_COLORS.indexOf(colorKey) === -1) {
      return clearColor(id);
    }
    node.data.color = colorKey;
    return true;
  }

  function getColor(id) {
    var node = getNode(id);
    return (node && node.data) ? node.data.color : undefined;
  }

  function clearColor(id) {
    var node = getNode(id);
    if (!node || node.data.color === undefined) {
      return false;
    }
    delete node.data.color;
    return true;
  }

  /**
   * Заметка — необязательный атрибут любого узла (node.data.note): текст в
   * формате Markdown. Хранится только когда задана. Пустая/whitespace-строка
   * трактуется как «заметки нет» (setNote при пустом значении удаляет поле).
   * Доступна и в схеме курса (locked), как testResult/marked.
   */
  function setNote(id, md) {
    var node = getNode(id);
    if (!node) {
      return false;
    }
    if (md === undefined || md === null || String(md).trim() === '') {
      return clearNote(id);
    }
    node.data.note = String(md);
    return true;
  }

  function getNote(id) {
    var node = getNode(id);
    return (node && node.data) ? node.data.note : undefined;
  }

  function clearNote(id) {
    var node = getNode(id);
    if (!node || node.data.note === undefined) {
      return false;
    }
    delete node.data.note;
    return true;
  }

  /**
   * Тест — необязательный атрибут узла (node.data.test): ОПРЕДЕЛЕНИЕ теста
   * (заголовок, описание, порог прохождения, список вопросов с вариантами).
   * Создаётся внешним приложением; в UI редактора нет. Формат см. storage.js
   * (version 4). Обычно задаётся у узлов типа 'test'.
   */
  function setTest(id, testObj) {
    if (isLocked()) {
      return false;
    }
    var node = getNode(id);
    if (!node) {
      return false;
    }
    if (testObj === undefined || testObj === null) {
      return clearTest(id);
    }
    node.data.test = testObj;
    return true;
  }

  function getTest(id) {
    var node = getNode(id);
    return (node && node.data) ? node.data.test : undefined;
  }

  function hasTest(id) {
    var t = getTest(id);
    return !!(t && Array.isArray(t.questions) && t.questions.length > 0);
  }

  function clearTest(id) {
    if (isLocked()) {
      return false;
    }
    var node = getNode(id);
    if (!node || node.data.test === undefined) {
      return false;
    }
    delete node.data.test;
    return true;
  }

  /**
   * Результат прохождения теста (node.data.testResult) — ТОЛЬКО последняя
   * попытка (историю не храним). Пишется исключительно при завершении
   * прохождения (успех/провал/прерывание). Формат см. storage.js (version 4).
   */
  function setTestResult(id, resultObj) {
    var node = getNode(id);
    if (!node) {
      return false;
    }
    if (resultObj === undefined || resultObj === null) {
      return clearTestResult(id);
    }
    node.data.testResult = resultObj;
    return true;
  }

  function getTestResult(id) {
    var node = getNode(id);
    return (node && node.data) ? node.data.testResult : undefined;
  }

  function clearTestResult(id) {
    var node = getNode(id);
    if (!node || node.data.testResult === undefined) {
      return false;
    }
    delete node.data.testResult;
    return true;
  }

  // Создаёт пустую модель с одним корневым узлом типа "main".
  function initEmpty() {
    state = { rootId: null, nodes: {} };
    createNode('main', null, 'Корневой узел');
    return state;
  }

  var ANNOTATION_FIELDS = ['note', 'comment', 'color', 'marked', 'testResult'];

  /**
   * Заменяет ТОЛЬКО аннотации узлов (см. ANNOTATION_FIELDS) значениями из
   * snap (снимок Undo в locked-схеме). Структура, текст и offset остаются
   * текущими: в режиме аннотирования они не меняются, а откат снимка не
   * должен трогать состав дерева.
   */
  function restoreAnnotations(snap) {
    for (var key in snap.nodes) {
      if (!Object.prototype.hasOwnProperty.call(snap.nodes, key)) {
        continue;
      }
      var node = getNode(key);
      if (!node) {
        continue;
      }
      var annotations = (snap.nodes[key] && snap.nodes[key].data) || {};
      ANNOTATION_FIELDS.forEach(function (field) {
        if (annotations[field] === undefined) {
          delete node.data[field];
        } else {
          node.data[field] = JSON.parse(JSON.stringify(annotations[field]));
        }
      });
    }
  }

  return {
    getState: getState,
    isLocked: isLocked,
    restoreAnnotations: restoreAnnotations,
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
    setMarked: setMarked,
    isMarked: isMarked,
    toggleMarked: toggleMarked,
    recomputeAncestorMarks: recomputeAncestorMarks,
    NODE_COLORS: NODE_COLORS,
    setColor: setColor,
    getColor: getColor,
    clearColor: clearColor,
    setNote: setNote,
    getNote: getNote,
    clearNote: clearNote,
    setTest: setTest,
    getTest: getTest,
    hasTest: hasTest,
    clearTest: clearTest,
    setTestResult: setTestResult,
    getTestResult: getTestResult,
    clearTestResult: clearTestResult,
    getDirection: getDirection,
    setOffset: setOffset,
    addOffset: addOffset,
    clearOffset: clearOffset,
    initEmpty: initEmpty
  };
})();
