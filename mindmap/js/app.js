/*
 * app.js — точка входа приложения: инициализация, глобальный тулбар,
 * горячие клавиши.
 */

// Поведение кнопок, пунктов меню и горячих клавиш привязано к действиям
// (actions.js) и запускается только через ActionManager.run(id). Общие обработчики
// регистрируются внутри DOMContentLoaded (блок «Обработчики действий»), чтобы
// иметь доступ к функциям панелей; специфичные для панелей — в filesPanel.js и test.js.

document.addEventListener('DOMContentLoaded', function () {
  // Рендерим ribbon-тулбар по декларативному описанию (RibbonConfig) ПЕРВОЙ
  // строкой — обработчики ниже ищут кнопки в DOM.
  if (typeof RibbonRenderer !== 'undefined' && typeof RibbonConfig !== 'undefined') {
    RibbonRenderer.init(document.getElementById('toolbar'), RibbonConfig);
  }

  Theme.init();

  var mindmapRoot = document.getElementById('mindmap-root');

  /* ===================== Хранилище (IndexedDB) ==========================
     Storage.init() АСИНХРОНЕН (IndexedDB) — он открывает базу, при
     необходимости переносит данные из localStorage и загружает активную схему
     в Model. Всё, что работает с содержимым модели (Render.init/renderAll,
     восстановление зума и pan, панели заметок/теста), обязано дождаться его:
     до этого Model ещё не содержит загруженного дерева. */
  function startApp() {
    Render.init(mindmapRoot);
    Render.renderAll();
    Pan.init(mindmapRoot);
    // Зум схемы колесом при зажатом Ctrl (после Render.init/renderAll — дерево
    // уже в DOM, можно восстановить сохранённый масштаб).
    if (typeof Zoom !== 'undefined') {
      Zoom.init(mindmapRoot);
    }
    // Восстанавливаем позицию панорамирования СТРОГО ПОСЛЕ зума — pan.js:restore()
    // сам переводит натуральные координаты в текущий зум и клампит в допустимый
    // диапазон — если вызвать до зума, следующее изменение зума сбило бы позицию.
    if (typeof Pan !== 'undefined' && typeof Pan.restore === 'function') {
      Pan.restore();
    }
    Notes.init();
    TestPanel.init();
    // Индикатор масштаба строится по актуальному зуму — уже после старта.
    updateZoomIndicator(Render.getZoom());
  }

  var storageReady = (typeof Storage !== 'undefined' && typeof Storage.init === 'function')
    ? Storage.init()
    : Promise.resolve();

  storageReady.then(function () {
    startApp();
    // Режим «только для чтения» известен только после загрузки схемы.
    ActionManager.notifyLockChanged();
    // Браузер по умолчанию вправе вытеснить данные origin'а при нехватке
    // места. Просим «постоянное» хранилище — для установленного PWA это
    // происходит без диалога, на обычной странице решает эвристика браузера.
    // Запрос фоновый: он не блокирует запуск и не влияет на работу, если в
    // нём отказано.
    if (typeof Storage !== 'undefined' && typeof Storage.requestPersistence === 'function') {
      Storage.requestPersistence();
    }
  });

  // Проверка целостности IndexedDB (test.js) — независимый модуль, ей не
  // нужна ни разметка, ни Storage: тест сам создаёт временную базу.
  if (typeof StorageSelfTest !== 'undefined') {
    window.runStorageSelfTest = StorageSelfTest.run;
  }

  /* ============ Индикатор масштаба и кнопка сброса в статус-баре ============
     Индикатор показывает текущий масштаб в %, кнопка сброса всегда занимает
     своё место в статус-баре (не скрывается — не дёргает высоту полосы),
     но при масштабе 100% становится disabled и её текст очищается. */
  var zoomLabel = document.getElementById('status-zoom');
  var zoomResetBtn = document.getElementById('btn-zoom-reset');

  function updateZoomIndicator(z) {
    var percent = Math.round(z * 100);
    if (zoomLabel) {
      zoomLabel.textContent = 'Масштаб: ' + percent + '%';
    }
    if (zoomResetBtn) {
      var isDefaultZoom = (percent === 100);
      zoomResetBtn.disabled = isDefaultZoom;
      zoomResetBtn.textContent = isDefaultZoom ? '' : 'Вернуть';
    }
  }

  if (typeof Render.setOnZoomChange === 'function') {
    Render.setOnZoomChange(updateZoomIndicator);
  }

  /* ============ Кнопки Undo/Redo на тулбаре (справа от вкладок) ============
     Активность/иконка отражают наличие снапшотов в соответствующем буфере
     (Undo.canUndo()/canRedo()). Обновляется при любом изменении стеков через
     Undo.setOnChange — не требует дублирования вызова в каждом из множества мест,
     откуда вызывается Undo.push() (render.js/notes.js). */
  var undoBtn = document.getElementById('btn-undo');
  var redoBtn = document.getElementById('btn-redo');

  function updateUndoRedoButtons() {
    if (typeof Undo === 'undefined') {
      return;
    }
    if (undoBtn) {
      var canUndo = Undo.canUndo();
      undoBtn.disabled = !canUndo;
      undoBtn.querySelector('img').src = canUndo
        ? 'assets/icons/small/undo.svg'
        : 'assets/icons/small/undo_disable.svg';
    }
    if (redoBtn) {
      var canRedo = Undo.canRedo();
      redoBtn.disabled = !canRedo;
      redoBtn.querySelector('img').src = canRedo
        ? 'assets/icons/small/redo.svg'
        : 'assets/icons/small/redo_disable.svg';
    }
  }

  // Клики Undo/Redo (data-action edit_undo/edit_redo) и «Вернуть» в статус-баре
  // (scheme_zoom_reset) идут через ActionManager — см. «Обработчики действий».
  if (typeof Undo !== 'undefined') {
    Undo.setOnChange(updateUndoRedoButtons);
    updateUndoRedoButtons();
  }
  var statusBarEl = document.getElementById('status-bar');
  if (statusBarEl) {
    ActionManager.bindClicks(statusBarEl);
  }

  // Панель выбора схемы (#files-panel) — открывается вкладкой "ФАЙЛ"
  // ribbon-тулбара. Вкладка помечена nonSwitching: true (ribbonConfig.js) —
  // ribbonRenderer.js не переключает на неё ribbon-контент сама, а
  // рассылает событие 'ribbon:nonswitching-tab-click' с именем вкладки,
  // на которое мы здесь подписываемся. Должно идти ДО Storage.load()/
  // Render.init() ниже? Нет — наоборот, FilesPanel.render() (внутри open())
  // читает Storage.listSchemes()/Model.getRoot() только когда панель
  // реально открывают (по клику), а не при инициализации — порядок
  // относительно Storage.load()/Render.init() не важен, важно только что
  // сама RibbonRenderer.init() выше уже отрисовала кнопку вкладки.
  if (typeof FilesPanel !== 'undefined') {
    var filesTabBtn = document.querySelector('.ribbon-tab[data-tab-name="ФАЙЛ"]');
    if (filesTabBtn) {
      FilesPanel.init({ tabBtnEl: filesTabBtn });
      document.addEventListener('ribbon:nonswitching-tab-click', function (e) {
        if (e.detail && e.detail.tabName === 'ФАЙЛ') {
          ActionManager.run('files_panel');
        }
      });
    }
  }

  // Справка — независимая левая панель (#help-panel), полностью управляется
  // внутри help.js и НЕ взаимодействует с координатором #side-panel ниже —
  // обе панели могут быть открыты одновременно. Кнопка тулбара
  // (action help_docs) подключается в конце файла.
  Help.init();

  // Первый запуск приложения в этом браузере — сразу показываем справку
  // (флаг в localStorage, чисто UI-настройка, как тема/ширина панели).
  try {
    if (!localStorage.getItem('mindmap-help-seen')) {
      Help.open();
      localStorage.setItem('mindmap-help-seen', '1');
    }
  } catch (e) {
    // localStorage недоступен (приватный режим) — просто не открываем автоматически.
  }

  // Ресайз боковых панелей (перетаскивание ширины мышью) — ширина сохраняется
  // в localStorage, НЕ входит в экспорт/импорт JSON схемы (чисто UI-настройка,
  // как и тема). Единая логика для обеих панелей — см. panelResize.js.
  var helpPanelEl = document.getElementById('help-panel');
  if (helpPanelEl && typeof PanelResize !== 'undefined') {
    PanelResize.attach({
      panelEl: helpPanelEl,
      storageKey: 'mindmap-help-panel-width',
      edge: 'right',
      minWidth: 260
    });
  }

  /* ================= Координатор общей боковой панели =================
     Панель открывается ТОЛЬКО действием notes_panel (кнопка "Панель"
     тулбара). Когда открыта: для узла типа 'test' показываем тест-вью,
     иначе — вью заметок. Смена выделения при открытой панели переключает
     вью. */
  var sidePanel = document.getElementById('side-panel');
  if (sidePanel && typeof PanelResize !== 'undefined') {
    PanelResize.attach({
      panelEl: sidePanel,
      storageKey: 'mindmap-side-panel-width',
      edge: 'left',
      minWidth: 260
    });
  }
  var notesView = document.getElementById('notes-view');
  var testView = document.getElementById('test-view');
  var panelOpen = false;
  var currentView = null; // 'notes' | 'test' | null

  function isTestNode(id) {
    var node = id ? Model.getNode(id) : null;
    return !!(node && node.type === 'test');
  }

  // Сброс состояния выходящего вью (сохранение заметки / прерывание теста).
  function flushView(view) {
    if (view === 'notes') {
      Notes.saveCurrent();
    } else if (view === 'test') {
      TestPanel.abortIfActive();
    }
  }

  function routeSelection(id) {
    if (!panelOpen) {
      return;
    }
    var desired = isTestNode(id) ? 'test' : 'notes';

    // При смене ТИПА вью — сбросить выходящий (внутри-вью смена узла
    // обрабатывается самими модулями: Notes.showNode/TestPanel.show).
    if (currentView && currentView !== desired) {
      flushView(currentView);
    }

    if (notesView) { notesView.hidden = (desired !== 'notes'); }
    if (testView) { testView.hidden = (desired !== 'test'); }

    if (desired === 'test') {
      TestPanel.show(id);
    } else {
      Notes.showNode(id);
    }
    currentView = desired;
  }

  function openPanel() {
    if (panelOpen) { return; }
    panelOpen = true;
    if (sidePanel) { sidePanel.hidden = false; }
    syncSidePanelButtons(true);
    currentView = null;
    routeSelection(Render.getSelectedId());
  }

  function closePanel() {
    if (!panelOpen) { return; }
    flushView(currentView); // сохранить заметку / прервать тест перед закрытием
    panelOpen = false;
    currentView = null;
    if (sidePanel) { sidePanel.hidden = true; }
    syncSidePanelButtons(false);
  }

  // Действие notes_panel может быть размещено НЕСКОЛЬКИМИ кнопками в разных
  // вкладках (см. ribbonConfig.js) — поэтому подсветка ставится/снимается
  // сразу у всех кнопок с этим data-action, а не у одной известной по id.
  function syncSidePanelButtons(open) {
    var btns = document.querySelectorAll('[data-action="notes_panel"]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('ribbon-btn--selected', !!open);
    }
  }

  // Вызывается действием notes_panel.
  function toggleSidePanel() {
    if (panelOpen) { closePanel(); } else { openPanel(); }
  }

  // "Отметить" — модальная кнопка: отражает состояние выделенного узла
  // (data.marked), а не одно и то же нажатое/ненажатое состояние. Подсветка
  // (ribbon-btn--selected) обновляется здесь же и при каждой смене выделения
  // (см. Render.setOnSelectionChange выше). Кнопок этого действия может быть
  // несколько — подсвечиваются все (поиск по data-action, а не по DOM id).
  function updateMarkButtonState(id) {
    var marked = !!(id && Model.isMarked(id));
    var btns = document.querySelectorAll('[data-action="node_mark"]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('ribbon-btn--selected', marked);
    }
  }

  // Группа "Цвета" — то же "модальная кнопка отражает состояние узла", что и
  // у "Отметить" выше, но тут подсвечивается РОВНО одна из 6 кнопок (цвет —
  // не независимый boolean-флаг, а один из взаимоисключающих вариантов).
  // Ключ цвета восстанавливается из id действия node_color_<key>, чтобы не
  // держать отдельную карту DOM-кнопок по id (см. Actions в actions.js).
  function colorKeyFromAction(action) {
    var prefix = 'node_color_';
    if (typeof action !== 'string' || action.indexOf(prefix) !== 0) {
      return null;
    }
    return action.slice(prefix.length);
  }

  // Подсветка кнопок "Тема" (может быть несколько — по data-action).
  function updateThemeButtonState() {
    if (typeof Theme.syncButtons === 'function') {
      Theme.syncButtons();
    }
  }

  function updateColorButtonsState(id) {
    var current = id ? Model.getColor(id) : undefined;
    var btns = document.querySelectorAll('[data-action^="node_color_"]');
    for (var i = 0; i < btns.length; i++) {
      var key = colorKeyFromAction(btns[i].dataset.action);
      var isSelected = key === 'reset'
        ? (!!id && !current)
        : (!!id && current === key);
      btns[i].classList.toggle('ribbon-small-btn--selected', isSelected);
    }
  }

  // Кнопка ✕ в любом вью просит закрыть панель.
  Notes.setOnCloseRequest(closePanel);
  TestPanel.setOnCloseRequest(closePanel);

  var importInput = document.getElementById('input-import');

  // Единая регистрация хука смены выделения — маршрутизирует в нужный вью
  // и обновляет состояние модальных кнопок "Выполнен"/"Цвета".
  Render.setOnSelectionChange(function (id) {
    routeSelection(id);
    updateMarkButtonState(id);
    updateColorButtonsState(id);
  });

  // Клик по кнопке «открыть заметку/тест» на узле (render.js) уже выделил
  // узел через selectNode() до вызова этого колбэка — routeSelection для него
  // уже сработал (если панель была открыта — вью уже переключился на новый
  // узел). Остаётся только гарантировать видимость панели, если она была закрыта.
  Render.setOnOpenPanelRequest(function () {
    openPanel();
  });

  /* ==================== Режим аннотирования ====================
     Схема загружена из обфусцированного файла «Экспортировать курс»
     ("locked": true, см. Storage.getLocked). Структуру и текст менять нельзя,
     но можно дополнять заметки/комментарии, проходить тесты, отмечать и
     раскрашивать узлы — и отменять эти правки. Что доступно, задаёт поле
     lockedAvailable действий (actions.js): ActionManager не запускает
     остальные действия, а их кнопки/пункты меню скрываются.
     Режим меняется при загрузке/импорте/смене схемы — после них вызывается
     ActionManager.notifyLockChanged(). */
  var statusLockEl = document.getElementById('status-lock');
  var statusLockDividerEl = document.getElementById('status-lock-divider');

  ActionManager.onLockChange(function (locked) {
    if (statusLockEl) {
      statusLockEl.hidden = !locked;
    }
    if (statusLockDividerEl) {
      statusLockDividerEl.hidden = !locked;
    }
    updateUndoRedoButtons();
  });

  /* ======================== Обработчики действий ========================
     Контекст (id узла) для действий с полем target подставляет ActionManager:
     из меню узла приходит id кликнутого узла, из ленты и горячих клавиш —
     выделенный узел (см. actions.js). */
  // options.direction — сторона кнопки добавления на корневом узле (render.js).
  function addChildOfType(type) {
    return function (nodeId, options) {
      Render.addChild(nodeId, type, options && options.direction);
    };
  }

  function setColor(colorKey) {
    return function (nodeId) {
      Render.setNodeColor(nodeId, colorKey);
      // Смена цвета создаёт шаг истории — Undo.push сам onChange не вызывает.
      updateUndoRedoButtons();
      updateColorButtonsState(nodeId);
    };
  }

  ActionManager.registerAll({
    scheme_import: function () {
      // Скрытый input#input-import — статичный элемент index.html.
      importInput.click();
    },
    scheme_export: function () {
      Storage.exportJSON();
    },
    // «Экспортировать курс» — обфусцированный файл, который при загрузке
    // открывается в режиме только для чтения (см. Storage.exportLocked).
    scheme_export_locked: function () {
      Storage.exportLocked();
    },
    scheme_clear: function () {
      var confirmed = window.confirm('Вы уверены, что хотите очистить схему и все данные?');
      if (!confirmed) {
        return;
      }
      Model.initEmpty();
      Storage.saveImmediate();
      // Структурное изменение всей модели — нужен полный renderAll().
      Render.selectNode(null);
      Render.renderAll();
    },
    scheme_zoom_in: function () {
      Zoom.zoomIn();
    },
    scheme_zoom_out: function () {
      Zoom.zoomOut();
    },
    scheme_zoom_reset: function () {
      Zoom.reset();
    },
    node_add_text: addChildOfType('main'),
    node_add_test: addChildOfType('test'),
    node_add_link: addChildOfType('link'),
    node_remove: function (nodeId) {
      Render.deleteNode(nodeId);
    },
    node_edit: function (nodeId) {
      Render.editNode(nodeId);
    },
    node_comment: function (nodeId) {
      Render.editOrAddComment(nodeId);
    },
    node_reset_position: function (nodeId) {
      Render.resetPosition(nodeId);
    },
    node_open_test: function (nodeId) {
      Render.openNotePanel(nodeId);
    },
    node_open_note: function (nodeId) {
      Render.openNotePanel(nodeId);
    },
    node_mark: function (nodeId) {
      Render.toggleMarked(nodeId);
      updateMarkButtonState(nodeId);
    },
    node_color_yellow: setColor('yellow'),
    node_color_gray: setColor('gray'),
    node_color_green: setColor('green'),
    node_color_pink: setColor('pink'),
    node_color_blue: setColor('blue'),
    node_color_reset: setColor(null),
    edit_undo: function () {
      Undo.undo();
    },
    edit_redo: function () {
      Undo.redo();
    },
    help_docs: function () {
      Help.toggle();
    },
    notes_panel: toggleSidePanel,
    theme_toggle: function () {
      Theme.toggle();
      updateThemeButtonState();
    },
    file_import_md: function () {
      // Импорт из Markdown пока не реализован — заглушка вместо тихого no-op.
      alert('Импорт MD — в разработке');
    }
  });

  importInput.addEventListener('change', function (e) {
    var file = e.target.files[0];
    Storage.importJSON(file, function () {
      // Импорт — структурное изменение всей модели: нужен полный renderAll()
      // (selectNode() теперь лёгкий и не пересобирает DOM сам по себе).
      // История отмены относилась к прежнему содержимому (или другой схеме,
      // если файл лёг копией) — сбрасываем её.
      Undo.reset();
      Render.selectNode(null);
      Render.renderAll();
      // Если в импортированном файле была сохранёна позиция панорамирования —
      // применить её; иначе останется стандартное scrollLeft=0/scrollTop=0.
      if (typeof Pan !== 'undefined' && typeof Pan.restore === 'function') {
        Pan.restore();
      }
      // Импортированный файл мог быть схемой курса ("locked").
      ActionManager.notifyLockChanged();
    });
    importInput.value = ''; // сброс, чтобы можно было повторно выбрать тот же файл
  });

  // Горячие клавиши: Delete — удалить выделенный узел, Enter — редактировать
  // текст, Insert — добавить дочерний узел, Alt+1 — панель справки, Alt+2 —
  // общая боковая панель (тест/заметки), Alt+3 — панель ФАЙЛ.
  // Все они запускают действия через ActionManager; если действие недоступно
  // (режим «только для чтения», нет выделения), клавиша достаётся браузеру.
  function runHotkey(e, actionId) {
    if (ActionManager.run(actionId)) {
      e.preventDefault();
    }
  }

  document.addEventListener('keydown', function (e) {
    var active = document.activeElement;

    // Alt+1/Alt+2/Alt+3 — переключение панелей. НАРОЧНО проверяются ДО guard'а
    // ниже (который отключает хоткеи во время ввода текста) — иначе
    // Alt+2 не закрывал бы боковую панель, если курсор стоит в поле
    // заметки/теста внутри НЕЁ ЖЕ САМОЙ (типичный кейс: редактируешь
    // заметку и хочешь тут же свернуть панель, не кликая по крестику).
    // Alt+цифра не встречается при обычном наборе текста, конфликтов с
    // редактированием нет.
    if (e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
      if (e.code === 'Digit1') {
        runHotkey(e, 'help_docs');
        return;
      }
      if (e.code === 'Digit2') {
        runHotkey(e, 'notes_panel');
        return;
      }
      if (e.code === 'Digit3') {
        runHotkey(e, 'files_panel');
        return;
      }
    }

    // Не перехватываем остальные клавиши во время ввода текста: редактирование
    // текста узла (contentEditable), а также поля ввода — в частности
    // <textarea> редактора заметок (иначе Enter/Delete в заметке создавали/
    // удаляли бы узлы).
    if (active && (active.isContentEditable ||
        active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) {
      return;
    }

    // Undo/Redo узлов схемы: Ctrl+Z — отмена, Ctrl+Y или Ctrl+Shift+Z —
    // повтор. СТРОГО ПОСЛЕ guard'а выше (не до него, как Alt+1/Alt+2) —
    // если фокус в текстоом поле (редактирование текста узла, textarea
    // заметки) — Ctrl+Z должен достаться браузеру (собственный undo этого
    // конкретного поля) — это уже обеспечивает guard выше. Используем
    // e.code (не e.key), чтобы хоткей работал независимо от раскладки клавиатуры.
    if (e.ctrlKey && !e.altKey && !e.metaKey) {
      if (!e.shiftKey && e.code === 'KeyZ') {
        runHotkey(e, 'edit_undo');
        return;
      }
      if (e.code === 'KeyY' || (e.shiftKey && e.code === 'KeyZ')) {
        runHotkey(e, 'edit_redo');
        return;
      }
    }

    // Навигация между узлами стрелками — только чистые стрелки (без
    // модификаторов, чтобы не конфликтовать с Alt+«+/-/0» зумом и пр.).
    // Обрабатываются ДО проверки выделения: при отсутствии выделения
    // moveSelection() сам выделит корень.
    if (!e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
      var arrowDir = null;
      if (e.key === 'ArrowUp') { arrowDir = 'up'; }
      else if (e.key === 'ArrowDown') { arrowDir = 'down'; }
      else if (e.key === 'ArrowLeft') { arrowDir = 'left'; }
      else if (e.key === 'ArrowRight') { arrowDir = 'right'; }
      if (arrowDir) {
        e.preventDefault();
        Render.moveSelection(arrowDir);
        return;
      }
    }

    // Действия с target работают с выделенным узлом. Для Insert на корне
    // направление не выбирается — Model.createNode берёт 'right' по умолчанию.
    if (!Render.getSelectedId()) {
      return;
    }
    if (e.key === 'Delete') {
      runHotkey(e, 'node_remove');
    } else if (e.key === 'Enter') {
      runHotkey(e, 'node_edit');
    } else if (e.key === 'Insert') {
      runHotkey(e, 'node_add_text');
    }
  });

  // Клик по свободному месту контейнера снимает выделение узла — но не если
  // это был конец панорамирования (реальное перетаскивание мыши), иначе
  // выделение будет неожиданно сбрасываться при любом pan'е.
  mindmapRoot.addEventListener('click', function () {
    if (typeof Pan !== 'undefined' && Pan.wasPanning && Pan.wasPanning()) {
      return;
    }
    Render.selectNode(null);
  });

  // Правый клик по фону канвы (вне узлов) — контекстное меню (см.
  // Popups.canvas/popups.js) ВМЕСТО стандартного браузерного меню. Правый
  // клик по самому узлу обрабатывается отдельно в render.js (contextmenu на
  // .node__body) и останавливает всплытие (stopPropagation) — сюда он не
  // доходит, поэтому здесь обработчик безусловный, без проверки e.target.
  mindmapRoot.addEventListener('contextmenu', function (e) {
    e.preventDefault();
    if (typeof PopupMenu === 'undefined') {
      return;
    }
    PopupMenu.open('canvas', null, null, {
      atPoint: { x: e.clientX, y: e.clientY }
    });
  });
});

