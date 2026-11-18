/*
 * undo.js — отмена/повтор для структурных/содержательных мутаций узлов
 * mind map (snapshot-подход, вариант 1 из анализа): каждый шаг истории —
 * ПОЛНЫЙ глубокий снимок Model.getState() на момент ДО мутации.
 *
 * ОБЛАСТЬ ДЕЙСТВИЯ: создание/удаление/перемещение узла, редактирование
 * текста узла и комментария-атрибута, ручное позиционирование (offset) и
 * его сброс, переключение отметки "Выполнен", сохранение заметки (один шаг
 * на сессию редактирования — браузер сам обеспечивает undo нажатий клавиш
 * ВНУТРИ textarea/contenteditable, см. notes.js:saveCurrent).
 *
 * НЕ отслеживается: тесты (data.test/data.testResult — неизменяемы
 * пользователем через UI, явное решение), тема, зум, панорамирование,
 * открытие/ширина боковых панелей — это UI-состояние, не данные дерева.
 *
 * Undo.push() вызывается ЯВНО из конкретных точек в render.js/notes.js —
 * ОДИН раз на одно логическое действие пользователя (а не на каждый
 * низкоуровневый Model-вызов), чтобы составные действия (например, создание
 * узла-ссылки: createNode + setComment URL) откатывались ОДНИМ шагом.
 *
 * Стеки живут только в памяти вкладки (не сериализуются в localStorage/
 * экспорт) — сбрасываются при перезагрузке страницы, это ожидаемо.
 *
 * РЕЖИМ АННОТИРОВАНИЯ (схема с "locked": true, см. Model.isLocked):
 * структуру менять нельзя, но заметки, комментарии, цвета, отметки и
 * результаты тестов — можно. Поэтому история здесь работает, но снимок
 * хранит только АННОТАЦИИ (ANNOTATION_FIELDS): текст, структура (parentId,
 * direction) и ручной offset в locked не меняются, а откат структурного
 * снимка восстановил бы подснапшот в обход защиты.
 */
var Undo = (function () {
  var MAX_UNDO = 100;
  var undoStack = [];
  var redoStack = [];
  var onChange = null;

  // Поля node.data, которые доступны в режиме аннотирования.
  var ANNOTATION_FIELDS = ['note', 'comment', 'color', 'marked', 'testResult'];

  function snapshot() {
    var snap = JSON.parse(JSON.stringify(Model.getState()));
    if (!Model.isLocked()) {
      return snap;
    }
    for (var key in snap.nodes) {
      if (!Object.prototype.hasOwnProperty.call(snap.nodes, key)) {
        continue;
      }
      var data = snap.nodes[key].data || {};
      var annotations = {};
      ANNOTATION_FIELDS.forEach(function (field) {
        if (data[field] !== undefined) {
          annotations[field] = data[field];
        }
      });
      snap.nodes[key].data = annotations;
    }
    return snap;
  }

  // Вызывается после ЛЮБОго изменения стеков (push/undo/redo) — используется
  // app.js для обновления состояния кнопок Undo/Redo на тулбаре (активна/
  // неактивна), не требуя дублировать вызов в каждом из множества мест, откуда
  // вызывается Undo.push() (render.js/notes.js).
  function setOnChange(fn) {
    onChange = (typeof fn === 'function') ? fn : null;
  }

  function notifyChange() {
    if (onChange) {
      onChange();
    }
  }

  function push() {
    undoStack.push(snapshot());
    if (undoStack.length > MAX_UNDO) {
      undoStack.shift();
    }
    // Новое действие делает прежнюю "будущую" историю недостижимой —
    // стандартное поведение undo/redo.
    redoStack.length = 0;
    notifyChange();
  }

  // Общий паттерн восстановления — тот же, что уже используется при
  // импорте JSON и кнопке "Очистить": полная замена модели + сохранение +
  // полный renderAll() (selectNode() теперь лёгкий и сам по себе не пересобирает DOM).
  //
  // В ОТЛИЧИЕ от импорта/очистки ВЫДЕЛЕНИЕ НЕ сбрасываем в null, а восстанавливаем
  // на тот же узел, что был выделен до undo/redo (если он всё ещё существует в
  // восстановленном состоянии). Иначе Render.selectNode(null) синхронно дёргает
  // хук onSelectionChange(null) → app.js:routeSelection(null) → Notes.showNode(null),
  // который очищает панель заметок до того, как она успеет подхватить
  // восстановленный текст заметки — визуально выглядевшим как "текст не
  // вернулся" и "фокус слетел с узла".
  function restore(snap) {
    var selectedId = Render.getSelectedId();
    if (Model.isLocked()) {
      // Режим аннотирования: снимок содержит только аннотации —
      // структуру дерева не трогаем.
      Model.restoreAnnotations(snap);
    } else {
      Model.setState(snap);
    }
    Storage.saveImmediate();
    Render.renderAll();
    var stillExists = selectedId != null && !!Model.getNode(selectedId);
    if (stillExists) {
      // Узел тот же — selectNode(selectedId) был бы no-op (id не меняется),
      // поэтому форсируем уведомление, чтобы панель заметок/теста
      // перезагрузила содержимое восстановленного узла.
      Render.refreshSelection();
    } else {
      // Узел исчез из восстановленного состояния (например undo создания
      // этого узла) — снимаем выделение, как раньше.
      Render.selectNode(null);
    }
  }

  function undo() {
    if (undoStack.length === 0) {
      return false;
    }
    redoStack.push(snapshot());
    var snap = undoStack.pop();
    restore(snap);
    notifyChange();
    return true;
  }

  function redo() {
    if (redoStack.length === 0) {
      return false;
    }
    undoStack.push(snapshot());
    var snap = redoStack.pop();
    restore(snap);
    notifyChange();
    return true;
  }

  function canUndo() {
    return undoStack.length > 0;
  }

  function canRedo() {
    return redoStack.length > 0;
  }

  // Полностью очищает историю — вызывается при переключении/создании/
  // импорте СХЕМЫ (см. filesPanel.js): история одной схемы не имеет смысла
  // для другой (снимки хранят rootId/nodes конкретного дерева), поэтому
  // смена активной схемы обязана сбрасывать оба стека, иначе Undo мог бы
  // "протащить" узлы одной схемы в другую.
  function reset() {
    undoStack.length = 0;
    redoStack.length = 0;
    notifyChange();
  }

  return {
    push: push,
    undo: undo,
    redo: redo,
    canUndo: canUndo,
    canRedo: canRedo,
    setOnChange: setOnChange,
    reset: reset
  };
})();
