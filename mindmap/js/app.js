/*
 * app.js — точка входа приложения: инициализация, глобальный тулбар,
 * горячие клавиши.
 */

// ActionHandlers — обработчики действий по id действия из реестра Actions
// (actions.js). ЕДИНСТВЕННАЯ точка привязки поведения во всём интерфейсе:
//   • пункты всплывающих меню (popupMenu.js) — ActionHandlers[action.id](context);
//   • кнопки ribbon-тулбара (ribbonRenderer.js) — через делегирование клика по
//     [data-action] в конце файла (см. блок «Привязка действий ribbon»);
//   • кнопки декларативных панелей (buttonPanel.js) — так же по [data-action],
//     но рендерятся и обрабатываются внутри своих модулей (test.js/filesPanel.js).
// DOM id кнопок в риббоне больше НЕ используются — конфиг тулбара (ribbonConfig.js)
// описывает только ссылки на действия (item.action), ровно как popups.js.
//
// ВАЖНО: этот объект — в ГЛОБАЛЬНОЙ области, а функции-«внутренности» панелей
// (toggleSidePanel, updateMarkButtonState и т.п.) живут ВНУТРИ колбэка
// DOMContentLoaded ниже и снаружи не видны. Поэтому действия, которым нужна
// такая внутренняя логика, НЕ обращаются к ней напрямую — они просто шлют
// DOM-событие 'mindmap:action' на #toolbar (см. dispatchRibbonAction), а
// локальный слушатель внутри колбэка выполняет действие в замыкании.
// Исключение — действия на уже загруженных глобальных модулях (Theme, Help,
// Zoom, Storage, Model, Render), вызываемые напрямую.
// Канал из глобальной области в замыкание DOMContentLoaded: 'mindmap:action'.
// Слушатель на #toolbar внутри колбэка (см. «локальные действия») выполняет
// внутреннюю логику (панели, подсветка) — она НЕ доступна глобально.
function dispatchRibbonAction(type, detail) {
  var toolbar = document.getElementById('toolbar');
  if (!toolbar) {
    return;
  }
  toolbar.dispatchEvent(new CustomEvent('mindmap:action', { detail: { type: type, value: detail } }));
}

var ActionHandlers = {
  file_delete: function (schemeId) {
    FilesPanel.deleteScheme(schemeId);
  },
  file_import_json: function (schemeId) {
    FilesPanel.requestImportIntoScheme(schemeId);
  },
  file_import_md: function () {
    // Импорт схемы из Markdown — пока не реализован (нет ни формата, ни
    // парсера, см. анализ перед этим шагом). Пункт меню намеренно оставлен
    // видимым, но неактивным — заглушка вместо тихого no-op.
    alert('Импорт MD — в разработке');
  },

  // Контекстное меню узла (правый клик, см. Popups.node/render.js) — context
  // здесь ВСЕГДА id конкретного узла, по которому кликнули правой кнопкой
  // (НЕ обязательно текущий Render.getSelectedId(), хотя contextmenu-
  // обработчик и выделяет его заодно — см. render.js).
  node_add_text: function (nodeId) {
    Render.addChild(nodeId, 'main');
  },
  node_add_test: function (nodeId) {
    Render.addChild(nodeId, 'test');
  },
  node_add_link: function (nodeId) {
    Render.addChild(nodeId, 'link');
  },
  node_remove: function (nodeId) {
    Render.deleteNode(nodeId);
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
    if (nodeId) {
      Render.toggleMarked(nodeId);
      dispatchRibbonAction('node_mark_sync', nodeId);
    }
  },

  // Контекстное меню фона канвы (правый клик вне узлов, см. Popups.canvas/
  // render.js) — context здесь не используется (действия не привязаны к
  // конкретному узлу), поэтому обработчики ничего не принимают.
  scheme_zoom_in: function () {
    Zoom.zoomIn();
  },
  scheme_zoom_out: function () {
    Zoom.zoomOut();
  },
  scheme_export: function () {
    Storage.exportJSON();
  },

  // ---- Действия ribbon-тулбара (ribbonConfig.js). Контекст (context)
  // приходит как id текущего ВЫДЕЛЕННОГО узла (см. runToolbarAction ниже) —
  // кроме "Очистить" и переключателей темы/панели/справки, которые от
  // конкретного узла не зависят.
  scheme_clear: function () {
    var confirmed = window.confirm('Вы уверены, что хотите очистить схему и все данные?');
    if (!confirmed) {
      return;
    }
    Model.initEmpty();
    Storage.saveImmediate();
    // Структурное изменение всей модели — как и при импорте JSON, нужен полный
    // renderAll() (selectNode() теперь лёгкий и сам по себе не пересбирает DOM).
    Render.selectNode(null);
    Render.renderAll();
  },
  help_docs: function () {
    Help.toggle();
  },
  notes_panel: function () {
    dispatchRibbonAction('notes_panel');
  },
  theme_toggle: function () {
    Theme.toggle();
    dispatchRibbonAction('theme_toggle_sync');
  },
  node_color_reset: function (nodeId) {
    if (nodeId) {
      Render.setNodeColor(nodeId, null);
    }
  }
};

document.addEventListener('DOMContentLoaded', function () {
  // Рендерим ribbon-тулбар по декларативному описанию (RibbonConfig) ПЕРВОЙ
  // строкой — все остальные обработчики ниже ищут кнопки по id
  // (document.getElementById), они должны уже существовать в DOM.
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

  if (typeof Undo !== 'undefined') {
    if (undoBtn) {
      undoBtn.addEventListener('click', function () {
        Undo.undo();
      });
    }
    if (redoBtn) {
      redoBtn.addEventListener('click', function () {
        Undo.redo();
      });
    }
    Undo.setOnChange(updateUndoRedoButtons);
    updateUndoRedoButtons();
  }
  if (zoomResetBtn) {
    zoomResetBtn.addEventListener('click', function () {
      if (typeof Zoom !== 'undefined' && Zoom.reset) {
        Zoom.reset();
      } else {
        Render.setZoom(1);
      }
    });
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
          FilesPanel.toggle();
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

  // Вызывается действием notes_panel (см. ActionHandlers).
  function toggleSidePanel() {
    if (panelOpen) { closePanel(); } else { openPanel(); }
  }

  // Добавляет дочерний узел заданного типа к выделенному узлу, иначе к root.
  function addNodeOfType(type) {
    var targetId = Render.getSelectedId() || Model.getState().rootId;
    Render.addChild(targetId, type);
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

  /* ============ Привязка действий ribbon-тулбара ============
     ОДИН делегированный обработчик на всю панель вместо поиска каждой
     кнопки по DOM id: ribbonConfig.js описывает только ссылки на действия
     (item.action), а ribbonRenderer.js проставляет каждой кнопке
     data-action = item.action (тот же принцип, что popups.js/popupMenu.js).
     Поэтому раскладка тулбара меняется без правок в этом файле: одну и ту же
     кнопку (действие) можно ставить в несколько вкладок/групп, а новую кнопку
     с уже существующим действием — просто добавить в конфиг.

     Особенность: действия node_add_* / node_remove / node_comment /
     node_reset_position / node_open_* в контекстном меню узла работают с
     ПЕРЕДАННЫМ id узла, а из тулбара контекста нет — для них передаётся
     текущее выделение (если выделения нет — клик игнорируется). */
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

  var toolbarEl = document.getElementById('toolbar');

  // Действия добавления дочернего узла: action id -> тип узла в реестре
  // NodeTypeRegistry. Работают с ТЕКУЩИМ выделенным узлом (а не с узлом из
  // контекстного меню).
  var SELECTION_ADD_ACTIONS = {
    node_add_text: 'main',
    node_add_test: 'test',
    node_add_link: 'link'
  };

  // Действия, которым из тулбара передаётся id текущего выделенного узла.
  // Остальные действия ActionHandlers (scheme_clear, help_docs, notes_panel,
  // theme_toggle, scheme_export) от узла не зависят и вызываются без аргументов.
  var SELECTION_AWARE_ACTIONS = {
    node_remove: true,
    node_comment: true,
    node_reset_position: true,
    node_open_test: true,
    node_open_note: true,
    node_mark: true,
    node_color_reset: true
  };

  function runToolbarAction(actionId) {
    if (typeof actionId !== 'string' || !actionId) {
      return;
    }
    var selectedId = Render.getSelectedId() || null;

    // Добавление узла — по таблице action -> тип узла.
    if (Object.prototype.hasOwnProperty.call(SELECTION_ADD_ACTIONS, actionId)) {
      addNodeOfType(SELECTION_ADD_ACTIONS[actionId]);
      return;
    }

    // Цвет узла — действие node_color_<key> (включая node_color_reset).
    var colorKey = colorKeyFromAction(actionId);
    if (colorKey) {
      if (!selectedId) {
        return; // нечего красить — без выделения цвет не к чему применить
      }
      Render.setNodeColor(selectedId, colorKey === 'reset' ? null : colorKey);
      updateColorButtonsState(selectedId);
      return;
    }

    // "Отметить" — модальный переключатель, дополнительно синхронизирует
    // подсветку (ActionHandlers.node_mark делает это сам для id узла).
    if (actionId === 'node_mark') {
      if (!selectedId) {
        return;
      }
      ActionHandlers.node_mark(selectedId);
      return;
    }

    if (actionId === 'scheme_import') {
      // Открываем системный диалог выбора файла (скрытый input#input-import
      // остаётся статичным элементом index.html — это не кнопка тулбара).
      if (importInput) {
        importInput.click();
      }
      return;
    }

    var handler = ActionHandlers[actionId];
    if (typeof handler !== 'function') {
      console.warn('app.js: нет обработчика ActionHandlers для действия', actionId);
      return;
    }
    if (SELECTION_AWARE_ACTIONS[actionId]) {
      if (!selectedId) {
        return;
      }
      handler(selectedId);
      return;
    }
    handler();
  }

  // Слушатель 'mindmap:action' — тот самый «внутренний» канал для действий,
  // которым нужна локальная логика (см. комментарий к ActionHandlers
  // в начале файла).
  if (toolbarEl) {
    toolbarEl.addEventListener('mindmap:action', function (e) {
      var type = e.detail && e.detail.type;
      var value = e.detail && e.detail.value;
      if (type === 'notes_panel') {
        toggleSidePanel();
      } else if (type === 'node_mark_sync') {
        updateMarkButtonState(value || null);
      } else if (type === 'theme_toggle_sync') {
        updateThemeButtonState();
      }
    });
  }

  if (toolbarEl) {
    toolbarEl.addEventListener('click', function (e) {
      var actionEl = e.target.closest ? e.target.closest('[data-action]') : null;
      if (!actionEl || !toolbarEl.contains(actionEl) || actionEl.disabled) {
        return;
      }
      runToolbarAction(actionEl.dataset.action);
      // Модальные кнопки ("Отметить", цвета) отражают состояние узла —
      // после действия обновляем их подсветку.
      updateMarkButtonState(Render.getSelectedId());
      updateColorButtonsState(Render.getSelectedId());
    });
  }

  importInput.addEventListener('change', function (e) {
    var file = e.target.files[0];
    Storage.importJSON(file, function () {
      // Импорт — структурное изменение всей модели: нужен полный renderAll()
      // (selectNode() теперь лёгкий и не пересобирает DOM сам по себе).
      Render.selectNode(null);
      Render.renderAll();
      // Если в импортированном файле была сохранёна позиция панорамирования —
      // применить её; иначе останется стандартное scrollLeft=0/scrollTop=0.
      if (typeof Pan !== 'undefined' && typeof Pan.restore === 'function') {
        Pan.restore();
      }
    });
    importInput.value = ''; // сброс, чтобы можно было повторно выбрать тот же файл
  });

  // Горячие клавиши: Delete — удалить выделенный узел, Enter — редактировать
  // текст, Insert — добавить дочерний узел, Alt+1 — панель справки, Alt+2 —
  // общая боковая панель (тест/заметки), Alt+3 — панель ФАЙЛ.
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
        e.preventDefault();
        Help.toggle();
        return;
      }
      if (e.code === 'Digit2') {
        e.preventDefault();
        toggleSidePanel();
        return;
      }
      if (e.code === 'Digit3' && typeof FilesPanel !== 'undefined') {
        e.preventDefault();
        FilesPanel.toggle();
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
    if (e.ctrlKey && !e.altKey && !e.metaKey && typeof Undo !== 'undefined') {
      if (!e.shiftKey && e.code === 'KeyZ') {
        e.preventDefault();
        Undo.undo();
        return;
      }
      if (e.code === 'KeyY' || (e.shiftKey && e.code === 'KeyZ')) {
        e.preventDefault();
        Undo.redo();
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

    var selectedId = Render.getSelectedId();
    if (!selectedId) {
      return;
    }

    if (e.key === 'Delete') {
      e.preventDefault();
      Render.deleteNode(selectedId);
    } else if (e.key === 'Enter') {
      // Enter на выделенном узле — редактирование текста (как двойной клик).
      e.preventDefault();
      Render.editNode(selectedId);
    } else if (e.key === 'Insert') {
      // Insert на выделенном узле — добавление дочернего узла.
      e.preventDefault();
      // Если выделен root, направление ветви не выбирается хоткеем — 'right' по умолчанию.
      var isRootSelected = selectedId === Model.getState().rootId;
      Render.addChild(selectedId, 'main', isRootSelected ? 'right' : undefined);
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

