/*
 * render.js — отрисовка модели в радиальный (4-направленный) layout и
 * обработка взаимодействий: выделение, редактирование текста, кнопки узлов,
 * drag&drop.
 *
 * Общая структура DOM внутри #mindmap-root (см. также layout.css):
 *   .mm-row.mm-row-middle — единственная строка верхнего уровня:
 *     [.mm-zone-left] [.mm-center-column] [.mm-zone-right]
 *   .mm-center-column — НЕ растягивается (flex: 0 0 auto), поэтому её
 *     высота равна сумме реального контента; внутри неё по вертикали:
 *       .mm-row-up   — поддеревья direction='up'   (смежные с root сверху)
 *       root box
 *       .mm-row-down — поддеревья direction='down' (смежные с root снизу)
 *   svg.mm-connectors — абсолютный оверлей с линиями-коннекторами
 *
 * Каждое поддерево (ветвь) рендерится рекурсивно функцией renderBranch():
 * узел + контейнер его детей — соседи по flex, направление раскладки
 * зависит от направления ветви (см. buildWrapClass/childrenClass).
 */

var Render = (function () {
  var DIRECTIONS = ['up', 'down', 'left', 'right'];


  var container = null;
  var selectedId = null;
  // Реестр DOM-элементов узлов (.node) по id — используется для пересчёта
  // координат SVG-коннекторов после каждого рендера/ресайза.
  var nodeEls = {};
  // Реестр видимых боксов (.node__body) по id узла — именно по геометрии
  // бокса (а не внешнего .node, который включает комментарий под ним)
  // рисуются SVG-коннекторы.
  var nodeBodyEls = {};
  // Реестр DOM-элементов комментариев (.node__comment) по id узла —
  // чтобы можно было запустить редактирование комментария по кнопке.
  var commentEls = {};
  // id узла, комментарий которого нужно начать редактировать сразу после
  // ближайшего renderAll() (например, после нажатия «добавить комментарий»,
  // когда пустой комментарий ещё не был в DOM).
  var pendingCommentEditId = null;
  var connectorsRaf = null;

  function init(rootContainer) {
    container = rootContainer;
    container.classList.add('mindmap-root');

    // Пересчитываем коннекторы при изменении размеров контейнера
    // (например, при разворачивании/сворачивании ветвей или ресайзе окна).
    if (typeof ResizeObserver !== 'undefined') {
      var ro = new ResizeObserver(function () {
        scheduleConnectorsUpdate();
      });
      ro.observe(container);
    }
    window.addEventListener('resize', scheduleConnectorsUpdate);

    // Панорамирование/скролл контейнера: раньше здесь ошибочно
    // предполагалось, что getBoundingClientRect() узлов и контейнера
    // смещаются одинаково при внутреннем скролле, поэтому их разница не
    // меняется. Это НЕВЕРНО: containerRect (позиция самого #mindmap-root
    // на странице) не меняется при scrollLeft/scrollTop контейнера, а
    // rect узлов внутри — меняется, поэтому разница зависела от текущей
    // прокрутки. После фикса renderConnectors() координаты линий приведены
    // к системе координат КОНТЕНТА (не видимой области) через
    // toContentX/toContentY, которые компенсируют scrollLeft/scrollTop —
    // поэтому сами линии больше не «уезжают» при скролле и пересчёт по
    // событию scroll строго не обязателен для корректности (SVG и узлы
    // скроллятся синхронно как обычные позиционированные потомки контента).
    // Оставляем подписку как дополнительную защёлку на случай, если размер
    // контента (scrollWidth/scrollHeight) изменился без ResizeObserver-события
    // (например, контент раскрылся ровно во время скролла) — цена дешёвая.
    container.addEventListener('scroll', scheduleConnectorsUpdate);

    // Ручное позиционирование: drop на свободном месте контейнера (не на
    // другом узле — тот сценарий уже обрабатывается attachHandlers()/onDrop
    // в renderNodeBox() и означает смену родителя) сдвигает перетаскиваемый
    // узел (и всю его ветвь — см. transform в renderBranch()) на дельту
    // перемещения мыши между dragstart и drop.
    DragDrop.attachContainerHandlers(container, {
      onRepositionDrop: function (draggedId, dx, dy) {
        if (dx === 0 && dy === 0) {
          return; // отпустили практически на месте — ничего не меняем
        }
        var moved = Model.addOffset(draggedId, dx, dy);
        if (moved) {
          Storage.save();
          renderAll();
        }
      }
    });
  }

  function getSelectedId() {
    return selectedId;
  }

  // Лёгкое переключение выделения: НЕ пересобирает DOM (renderAll()), а просто
  // переключает класс node--selected у существующих элементов из реестра
  // nodeEls. Это критично для двойного клика по тексту узла — если бы каждый
  // одиночный click (в т.ч. первый клик двойного клика) вызывал полный
  // renderAll(), то textEl пересоздавался бы синхронно ДО того, как браузер
  // диспатчит dblclick, и dblclick прилетал бы в уже отсоединённый от
  // документа узел (см. историю багов). Структурные изменения модели
  // (добавление узла, импорт JSON) должны вызывать renderAll() явно сами,
  // а не полагаться на побочный эффект этой функции.
  function selectNode(id) {
    if (selectedId === id) {
      return;
    }
    var prevId = selectedId;
    selectedId = id;

    if (prevId != null && nodeEls[prevId]) {
      nodeEls[prevId].classList.remove('node--selected');
    }
    if (id != null && nodeEls[id]) {
      nodeEls[id].classList.add('node--selected');
    }
    notifySelectionChanged();
  }

  // Необязательный колбэк смены выделения (регистрируется из app.js).
  // Развязывает render.js от notes.js: render.js не знает о Notes, а
  // просто уведомляет подписчика, если он есть.
  var onSelectionChange = null;
  function setOnSelectionChange(fn) {
    onSelectionChange = (typeof fn === 'function') ? fn : null;
  }
  function notifySelectionChanged() {
    if (onSelectionChange) {
      onSelectionChange(selectedId);
    }
  }

  // Полная перерисовка дерева от корня.
  function renderAll() {
    if (!container) {
      return;
    }
    container.innerHTML = '';
    nodeEls = {};
    nodeBodyEls = {};
    commentEls = {};

    var root = Model.getRoot();
    if (!root) {
      return;
    }

    var rowMiddle = document.createElement('div');
    rowMiddle.className = 'mm-row mm-row-middle';

    var zoneLeft = document.createElement('div');
    zoneLeft.className = 'mm-zone mm-zone-left';

    var zoneRight = document.createElement('div');
    zoneRight.className = 'mm-zone mm-zone-right';

    // Центральная колонка: [rowUp][rootBox][rowDown] вложены в одну колонку,
    // которая НЕ растягивается на всю высоту rowMiddle (flex: 0 0 auto в CSS),
    // благодаря чему root оказывается зажат между up- и down-ветками без зазоров.
    var centerColumn = document.createElement('div');
    centerColumn.className = 'mm-center-column';

    var rowUp = document.createElement('div');
    rowUp.className = 'mm-row mm-row-up';

    var rowDown = document.createElement('div');
    rowDown.className = 'mm-row mm-row-down';

    var rootBox = renderNodeBox(root);
    rootBox.classList.add('mm-root-box');

    centerColumn.appendChild(rowUp);
    centerColumn.appendChild(rootBox);
    centerColumn.appendChild(rowDown);

    rowMiddle.appendChild(zoneLeft);
    rowMiddle.appendChild(centerColumn);
    rowMiddle.appendChild(zoneRight);

    var children = Model.getChildren(root.id);
    children.forEach(function (child) {
      // Фолбэк на 'right' для старых данных (из localStorage до появления
      // радиального layout), у которых ещё нет data.direction.
      var direction = (child.data && child.data.direction) || 'right';
      var branchEl = renderBranch(child, direction);
      if (direction === 'up') {
        rowUp.appendChild(branchEl);
      } else if (direction === 'down') {
        rowDown.appendChild(branchEl);
      } else if (direction === 'left') {
        zoneLeft.appendChild(branchEl);
      } else {
        zoneRight.appendChild(branchEl);
      }
    });

    container.appendChild(rowMiddle);

    // SVG-оверлей с линиями между узлами — создаём после того, как остальной
    // DOM уже на месте, чтобы он лежал сверху и покрывал весь контейнер.
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'mm-connectors');
    container.appendChild(svg);

    scheduleConnectorsUpdate();

    // Если был запрошен автостарт редактирования комментария (например,
    // только что создан пустой комментарий) — запускаем его теперь,
    // когда элемент комментария уже в DOM.
    if (pendingCommentEditId && commentEls[pendingCommentEditId]) {
      var cid = pendingCommentEditId;
      pendingCommentEditId = null;
      startEditingComment(commentEls[cid], cid);
    } else {
      pendingCommentEditId = null;
    }
  }

  /**
   * Рекурсивно рисует одну ветвь (узел + его потомков) в заданном
   * направлении. Направление не хранится у глубоких потомков — оно просто
   * передаётся дальше при рекурсии (наследуется от прямого ребёнка root).
   */
  function renderBranch(node, direction) {
    var wrap = document.createElement('div');
    wrap.className = 'mm-node-wrap mm-dir-' + direction;

    // Ручное смещение (data.offset) применяется к wrapper'у узла+дети через
    // transform: translate — оно не влияет на flex-раскладку соседей
    // (остальные ветви не "прыгают"), а все потомки внутри wrap
    // смещаются вместе с ним как единое целое.
    var offset = node.data && node.data.offset;
    if (offset && (offset.dx || offset.dy)) {
      wrap.style.transform = 'translate(' + offset.dx + 'px, ' + offset.dy + 'px)';
      wrap.classList.add('mm-node-wrap--offset');
    }

    var box = renderNodeBox(node);
    wrap.appendChild(box);

    var children = Model.getChildren(node.id);
    if (children.length > 0) {
      var childrenContainer = document.createElement('div');
      childrenContainer.className = 'mm-children mm-dir-' + direction;
      children.forEach(function (child) {
        childrenContainer.appendChild(renderBranch(child, direction));
      });
      wrap.appendChild(childrenContainer);
    }

    return wrap;
  }

  // Создаёт DOM-элемент самого узла (.node) с текстом и тулбаром,
  // навешивает обработчики клика/редактирования/drag&drop.
  function renderNodeBox(node) {
    var typeDef = NodeTypeRegistry.get(node.type) || {
      cssClass: '', label: node.type, canHaveChildren: true
    };
    var isRoot = node.id === Model.getState().rootId;

    // Внешний контейнер .node — якорь позиционирования для абсолютных
    // всплывающих панелей и контейнер для [видимый бокс + комментарий].
    // Сам по себе не имеет рамки/фона — визуальный бокс это .node__body.
    var box = document.createElement('div');
    box.className = 'node';
    box.dataset.id = node.id;
    if (node.id === selectedId) {
      box.classList.add('node--selected');
    }

    // Видимый бокс узла: рамка/фон/текст. На нём же типовые модификаторы
    // (node--main/test/link) и node--root — чтобы цвета/шрифты применялись
    // именно к боксу, а не к комментарию под ним.
    var bodyEl = document.createElement('div');
    bodyEl.className = 'node__body ' + typeDef.cssClass;
    if (isRoot) {
      bodyEl.classList.add('node--root');
    }

    var textEl = document.createElement('span');
    textEl.className = 'node__text';
    textEl.textContent = node.text;
    bodyEl.appendChild(textEl);

    // Фиксированная панель редактирования (удаление, комментарий, сброс
    // позиции) — сверху бокса с привязкой к правому краю; видна при hover.
    var editPanel = buildEditPanel(node, typeDef, isRoot);

    // Всплывающие панели добавления дочерних узлов — с той стороны, где
    // может быть создана связь: для root — со всех 4 сторон, для
    // остальных — только со стороны направления ветви. Видны при hover.
    // Панель направления 'up' располагалась бы сверху бокса и перекрывалась
    // бы с панелью действий (edit, тоже сверху), поэтому её кнопки
    // объединяются в одну панель с действиями (см. node__panel--add-group).
    if (typeDef.canHaveChildren !== false) {
      var dirs = isRoot ? DIRECTIONS : [Model.getDirection(node.id) || 'right'];
      dirs.forEach(function (direction) {
        if (direction === 'up') {
          // Кнопки добавления "вверх" вставляем в НАЧАЛО edit-панели,
          // отделив их от кнопок действий вертикальным разделителем.
          var addGroup = document.createElement('span');
          addGroup.className = 'node__panel-add-group';
          // direction явно передаём только прямым детям root (у них
          // направление хранится); у остальных — undefined (наследуется).
          makeAddButtons(addGroup, node.id, isRoot ? direction : undefined);
          editPanel.insertBefore(addGroup, editPanel.firstChild);
          editPanel.classList.add('node__panel--merged');
        } else {
          var panel = document.createElement('span');
          panel.className = 'node__panel node__panel--add node__panel--add-' + direction;
          makeAddButtons(panel, node.id, isRoot ? direction : undefined);
          bodyEl.appendChild(panel);
        }
      });
    }

    bodyEl.appendChild(editPanel);

    box.appendChild(bodyEl);
    nodeBodyEls[node.id] = bodyEl;

    // Комментарий-атрибут: мелкий серый текст под боксом узла,
    // выровненный по левому краю. Показывается только когда задан (не undefined).
    var comment = Model.getComment(node.id);
    if (comment !== undefined) {
      var commentEl = document.createElement('div');
      commentEl.className = 'node__comment';
      commentEl.textContent = comment;
      box.appendChild(commentEl);
      commentEls[node.id] = commentEl;

      commentEl.addEventListener('dblclick', function (e) {
        e.stopPropagation();
        startEditingComment(commentEl, node.id);
      });
    }

    // Клик по узлу — выделение (stopPropagation, чтобы не сбрасывалось кликом по фону).
    box.addEventListener('click', function (e) {
      e.stopPropagation();
      selectNode(node.id);
    });

    // Двойной клик по тексту — редактирование через contenteditable.
    textEl.addEventListener('dblclick', function (e) {
      e.stopPropagation();
      startEditing(textEl, node.id);
    });

    DragDrop.attachHandlers(box, node, {
      onDrop: function (draggedId, targetId) {
        var result = Model.moveNode(draggedId, targetId);
        if (!result.ok) {
          console.warn('Перенос узла отклонён: ' + result.reason);
        } else {
          Storage.save();
        }
        renderAll();
      }
    });

    nodeEls[node.id] = box;

    return box;
  }

  // Фиксированная панель редактирования узла: всегда сверху с привязкой к
  // правому краю узла (абсолютное позиционирование в CSS). Содержит кнопки
  // редактирования самого узла (комментарий, сброс позиции, удаление).
  // Кнопки добавления детей — в боковых/нижней панелях (node__panel--add-*);
  // исключение — направление 'up', кнопки которого встраиваются в эту панель
  // (см. renderNodeBox), чтобы верхние панели не перекрывались.
  function buildEditPanel(node, typeDef, isRoot) {
    var panel = document.createElement('span');
    panel.className = 'node__panel node__panel--edit';

    // Кнопка добавления/редактирования комментария-атрибута.
    var hasComment = Model.getComment(node.id) !== undefined;
    var commentBtn = document.createElement('button');
    commentBtn.type = 'button';
    commentBtn.className = 'node__btn node__btn--comment';
    commentBtn.title = hasComment ? 'Редактировать комментарий' : 'Добавить комментарий';
    commentBtn.innerHTML = '<img src="assets/icons/small/comment.svg" alt="">';
    commentBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      editOrAddComment(node.id);
    });
    panel.appendChild(commentBtn);

    // Кнопка сброса ручного позиционирования — только у узлов с data.offset.
    if (!isRoot && node.data && node.data.offset) {
      var resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.className = 'node__btn node__btn--reset-position';
      resetBtn.title = 'Сбросить ручное положение узла';
      resetBtn.textContent = '\u27F2';
      resetBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        Model.clearOffset(node.id);
        Storage.save();
        renderAll();
      });
      panel.appendChild(resetBtn);
    }

    if (!isRoot) {
      var delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'node__btn node__btn--delete';
      delBtn.title = 'Удалить узел (дети перейдут к родителю)';
      delBtn.innerHTML = '<img src="assets/icons/small/trash.svg" alt="">';
      delBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        deleteNode(node.id);
      });
      panel.appendChild(delBtn);
    }

    return panel;
  }

  // Создаёт кнопки добавления по одной на каждый зарегистрированный тип
  // узла (+У/+Т/+С) в указанном направлении. direction передаётся в addChild
  // только для прямых детей root; у остальных направление наследуется
  // (передаём undefined).
  function makeAddButtons(parentContainer, nodeId, direction) {
    NodeTypeRegistry.getAll().forEach(function (childTypeDef) {
      var addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'node__btn node__btn--add';
      addBtn.title = 'Добавить: ' + childTypeDef.label;
      if (childTypeDef.icon) {
        addBtn.innerHTML = '<img src="' + childTypeDef.icon + '" alt="">';
      } else {
        addBtn.textContent = '+' + childTypeDef.label.charAt(0).toUpperCase();
      }
      addBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        addChild(nodeId, childTypeDef.type, direction);
      });
      parentContainer.appendChild(addBtn);
    });
  }

  // Редактирование текста узла прямо в дереве через contenteditable.
  function startEditing(textEl, nodeId) {
    textEl.contentEditable = 'true';
    textEl.classList.add('node__text--editing');
    textEl.focus();

    // Выделяем весь текст, чтобы удобно было сразу всё перепечатать.
    var range = document.createRange();
    range.selectNodeContents(textEl);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    function finishEditing() {
      textEl.removeEventListener('blur', finishEditing);
      textEl.removeEventListener('keydown', onKeyDown);
      textEl.contentEditable = 'false';
      textEl.classList.remove('node__text--editing');

      var node = Model.getNode(nodeId);
      if (!node) {
        return;
      }
      var typeDef = NodeTypeRegistry.get(node.type);
      var newText = textEl.textContent.trim() || (typeDef ? typeDef.defaultText : '');
      Model.updateNodeText(nodeId, newText);
      Storage.save();
      renderAll();
    }

    function onKeyDown(e) {
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        // КРИТИЧНО: stopPropagation() до textEl.blur() — без него этот же
        // keydown продолжает всплываться после выхода из этой функции и доходит
        // до глобального хоткея в app.js. blur() вызывает finishEditing()
        // СИНХРОННО (renderAll() уже отработал к тому моменту), поэтому
        // document.activeElement к моменту всплытия уже НЕ isContentEditable, и
        // глобальный обработчик Enter/Delete в app.js ошибочно срабатывал (например,
        // создавал лишний дочерний узел по Enter, из-за чего визуально казалось,
        // что у отредактированного узла сбросилось ручное позиционирование).
        e.stopPropagation();
      }
      if (e.key === 'Enter') {
        textEl.blur(); // сохранить по Enter
      } else if (e.key === 'Escape') {
        var node = Model.getNode(nodeId);
        textEl.textContent = node ? node.text : ''; // отменить правку
        textEl.blur();
      }
    }

    textEl.addEventListener('blur', finishEditing);
    textEl.addEventListener('keydown', onKeyDown);
  }

  // Нажатие кнопки комментария в панели редактирования. Если комментария
  // ещё нет — создаём пустой и перерисовываем, чтобы элемент появился в DOM,
  // а затем (через pendingCommentEditId в renderAll) автоматически входим в
  // режим редактирования. Если комментарий уже есть — сразу редактируем.
  function editOrAddComment(nodeId) {
    selectNode(nodeId);
    if (Model.getComment(nodeId) === undefined) {
      Model.setComment(nodeId, '');
      pendingCommentEditId = nodeId;
      renderAll();
    } else if (commentEls[nodeId]) {
      startEditingComment(commentEls[nodeId], nodeId);
    }
  }

  // Редактирование комментария-атрибута через contenteditable (аналогично
  // startEditing для основного текста). Отличия: комментарий МНОГОСТРОЧНЫЙ —
  // Enter вставляет перенос строки (не завершает редактирование), а завершение —
  // по blur или Escape; пустой комментарий после редактирования удаляется.
  function startEditingComment(commentEl, nodeId) {
    commentEl.contentEditable = 'true';
    commentEl.classList.add('node__comment--editing');
    commentEl.focus();

    var range = document.createRange();
    range.selectNodeContents(commentEl);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    function finishEditing() {
      commentEl.removeEventListener('blur', finishEditing);
      commentEl.removeEventListener('keydown', onKeyDown);
      commentEl.contentEditable = 'false';
      commentEl.classList.remove('node__comment--editing');

      var newText = commentEl.textContent.replace(/\s+$/, '');
      if (newText === '') {
        // Пустой комментарий — удаляем атрибут целиком («комментария нет»).
        Model.clearComment(nodeId);
      } else {
        Model.setComment(nodeId, newText);
      }
      Storage.save();
      renderAll();
    }

    function onKeyDown(e) {
      // Enter без Shift — перенос строки внутри комментария (многострочный
      // текст). Завершаем редактирование только по Escape (или blur кликом
      // вне элемента). stopPropagation — чтобы клавиши не всплывали в
      // глобальный хоткей app.js (аналогично багу с основным текстом).
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        var node = Model.getNode(nodeId);
        commentEl.textContent = (node && node.data.comment !== undefined) ? node.data.comment : '';
        commentEl.blur();
      } else if (e.key === 'Enter') {
        // Не завершаем — пусть браузер вставит перенос строки; останавливаем
        // всплытие, чтобы глобальный хоткей Enter не добавил узел.
        e.stopPropagation();
      }
    }

    commentEl.addEventListener('blur', finishEditing);
    commentEl.addEventListener('keydown', onKeyDown);
  }

  // direction передаётся только когда явно выбрана стрелка в тулбаре root'а;
  // для остальных случаев Model.createNode сама решит, нужен ли фолбэк.
  function addChild(parentId, type, direction) {
    try {
      var newNode = Model.createNode(type, parentId, null, direction);
      Storage.save();
      // Структурное изменение модели: новый узел ещё не существует в DOM,
      // поэтому нужен полный renderAll() (не полагаемся на побочный эффект
      // selectNode() — он теперь лёгкий и только переключает класс).
      selectedId = newNode.id;
      renderAll();
      notifySelectionChanged();
    } catch (e) {
      alert('Не удалось добавить узел: ' + e.message);
    }
  }

  function deleteNode(id) {
    if (id === Model.getState().rootId) {
      return; // root неудаляем — блокируем в UI
    }
    var node = Model.getNode(id);
    if (!node) {
      return;
    }
    var newSelection = node.parentId; // после удаления выделяем родителя

    var removed = Model.removeNode(id);
    if (removed) {
      Storage.save();
      selectedId = newSelection;
      renderAll();
      notifySelectionChanged();
    }
  }

  // Откладываем пересчёт координат коннекторов на следующий кадр, чтобы
  // браузер успел применить flex-layout и getBoundingClientRect() вернул
  // актуальные координаты.
  function scheduleConnectorsUpdate() {
    if (connectorsRaf) {
      cancelAnimationFrame(connectorsRaf);
    }
    // Двойной rAF: первый кадр гарантирует, что браузер уже применил свежий
    // flex-layout (в частности — самый первый рендер сразу после вставки
    // #mindmap-root в DOM), второй — что все синхронные layout-мутации из
    // этого же тика точно улеглись перед чтением getBoundingClientRect().
    connectorsRaf = requestAnimationFrame(function () {
      connectorsRaf = requestAnimationFrame(function () {
        connectorsRaf = null;
        renderConnectors();
      });
    });
  }

  // Пересчитывает и перерисовывает все линии-коннекторы между узлами и их
  // родителями поверх текущего DOM (SVG-оверлей .mm-connectors).
  function renderConnectors() {
    if (!container) {
      return;
    }
    var svg = container.querySelector('.mm-connectors');
    if (!svg) {
      return;
    }

    var containerRect = container.getBoundingClientRect();
    // SVG должен покрывать ВЕСЬ прокручиваемый контент, а не только видимую
    // область: containerRect.width/height (getBoundingClientRect()) — это
    // размер viewport контейнера (аналог clientWidth/clientHeight), а не
    // scrollWidth/scrollHeight. Если дерево узлов больше видимой области
    // (а при overflow:auto так и есть), SVG с размером видимой области
    // физически не может покрыть узлы за пределами исходно видимого куска.
    var contentWidth = container.scrollWidth;
    var contentHeight = container.scrollHeight;
    svg.setAttribute('width', contentWidth);
    svg.setAttribute('height', contentHeight);
    // Явно задаём CSS-размер бокса через style, а не только атрибуты
    // width/height: у SVG без viewBox фактический CSS-размер бокса (из
    // CSS, в т.ч. потенциального inset/width) должен совпадать с атрибутами
    // width/height, иначе браузер трактует их как систему координат и
    // масштабирует/искажает содержимое под фактический CSS-размер. Ставим
    // style.width/height напрямую, чтобы 1 SVG-юнит гарантированно был равен
    // 1 CSS-пикселю независимо от CSS-правил в layout.css.
    svg.style.width = contentWidth + 'px';
    svg.style.height = contentHeight + 'px';
    svg.innerHTML = '';

    // Переводит viewport-координату (из getBoundingClientRect()) в систему
    // координат, привязанную к КОНТЕНТУ контейнера (т.е. не зависящую от
    // текущего scrollLeft/scrollTop) — прибавляем обратно текущий скролл,
    // который getBoundingClientRect() «вычитает» неявно. Благодаря этому
    // координаты линий остаются верными независимо от момента скролла между
    // вызовами renderConnectors().
    function toContentX(clientX) {
      return clientX - containerRect.left + container.scrollLeft;
    }
    function toContentY(clientY) {
      return clientY - containerRect.top + container.scrollTop;
    }

    Object.keys(nodeEls).forEach(function (id) {
      var node = Model.getNode(id);
      if (!node || !node.parentId) {
        return; // у root нет родителя — линию рисовать не от чего
      }
      // Коннекторы привязываем к видимому боксу (.node__body), а не к внешнему
      // .node, который может включать комментарий под боксом и исказить
      // точку присоединения линии.
      var parentBox = nodeBodyEls[node.parentId];
      var childBox = nodeBodyEls[id];
      if (!parentBox || !childBox) {
        return;
      }

      var direction = Model.getDirection(id) || 'right';
      var p = parentBox.getBoundingClientRect();
      var c = childBox.getBoundingClientRect();

      // Координаты пересчитываем относительно контента контейнера (не
      // видимой области), соединяя ближний к родителю край с ближним к
      // ребёнку краем.
      var x1, y1, x2, y2;
      if (direction === 'right') {
        x1 = toContentX(p.right);
        y1 = toContentY(p.top + p.height / 2);
        x2 = toContentX(c.left);
        y2 = toContentY(c.top + c.height / 2);
      } else if (direction === 'left') {
        x1 = toContentX(p.left);
        y1 = toContentY(p.top + p.height / 2);
        x2 = toContentX(c.right);
        y2 = toContentY(c.top + c.height / 2);
      } else if (direction === 'up') {
        x1 = toContentX(p.left + p.width / 2);
        y1 = toContentY(p.top);
        x2 = toContentX(c.left + c.width / 2);
        y2 = toContentY(c.bottom);
      } else { // down
        x1 = toContentX(p.left + p.width / 2);
        y1 = toContentY(p.bottom);
        x2 = toContentX(c.left + c.width / 2);
        y2 = toContentY(c.top);
      }

      var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', x1);
      line.setAttribute('y1', y1);
      line.setAttribute('x2', x2);
      line.setAttribute('y2', y2);
      line.setAttribute('class', 'mm-connector-line');
      svg.appendChild(line);
    });
  }

  return {
    init: init,
    renderAll: renderAll,
    getSelectedId: getSelectedId,
    selectNode: selectNode,
    setOnSelectionChange: setOnSelectionChange,
    addChild: addChild,
    deleteNode: deleteNode
  };
})();
