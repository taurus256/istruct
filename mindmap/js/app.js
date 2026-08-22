/*
 * app.js — точка входа приложения: инициализация, глобальный тулбар,
 * горячие клавиши.
 */

document.addEventListener('DOMContentLoaded', function () {
  Storage.load();

  var mindmapRoot = document.getElementById('mindmap-root');
  Render.init(mindmapRoot);
  Render.renderAll();
  Pan.init(mindmapRoot);
  Notes.init();
  TestPanel.init();

  /* ================= Координатор общей боковой панели =================
     Панель открывается ТОЛЬКО кнопкой #btn-notes. Когда открыта: для узла
     типа 'test' показываем тест-вью, иначе — вью заметок. Смена выделения
     при открытой панели переключает вью. */
  var sidePanel = document.getElementById('side-panel');
  var notesView = document.getElementById('notes-view');
  var testView = document.getElementById('test-view');
  var notesBtn = document.getElementById('btn-notes');
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
    if (notesBtn) { notesBtn.classList.add('ribbon-btn--selected'); }
    currentView = null;
    routeSelection(Render.getSelectedId());
  }

  function closePanel() {
    if (!panelOpen) { return; }
    flushView(currentView); // сохранить заметку / прервать тест перед закрытием
    panelOpen = false;
    currentView = null;
    if (sidePanel) { sidePanel.hidden = true; }
    if (notesBtn) { notesBtn.classList.remove('ribbon-btn--selected'); }
  }

  function togglePanel() {
    if (panelOpen) { closePanel(); } else { openPanel(); }
  }

  // Кнопка ✕ в любом вью просит закрыть панель.
  Notes.setOnCloseRequest(closePanel);
  TestPanel.setOnCloseRequest(closePanel);

  // Единая регистрация хука смены выделения — маршрутизирует в нужный вью.
  Render.setOnSelectionChange(function (id) {
    routeSelection(id);
  });

  if (notesBtn) {
    notesBtn.addEventListener('click', function () {
      togglePanel();
    });
  }

  var addNodeBtn = document.getElementById('btn-add-node');
  var addTestBtn = document.getElementById('btn-add-test');
  var addLinkBtn = document.getElementById('btn-add-link');
  var exportBtn = document.getElementById('btn-export');
  var importBtn = document.getElementById('btn-import');
  var importInput = document.getElementById('input-import');

  // Добавляет дочерний узел заданного типа к выделенному узлу, иначе к root.
  function addNodeOfType(type) {
    var targetId = Render.getSelectedId() || Model.getState().rootId;
    Render.addChild(targetId, type);
  }

  addNodeBtn.addEventListener('click', function () {
    addNodeOfType('main');
  });

  addTestBtn.addEventListener('click', function () {
    addNodeOfType('test');
  });

  addLinkBtn.addEventListener('click', function () {
    addNodeOfType('link');
  });

  exportBtn.addEventListener('click', function () {
    Storage.exportJSON();
  });

  importBtn.addEventListener('click', function () {
    importInput.click();
  });

  importInput.addEventListener('change', function (e) {
    var file = e.target.files[0];
    Storage.importJSON(file, function () {
      // Импорт — структурное изменение всей модели: нужен полный renderAll()
      // (selectNode() теперь лёгкий и не пересобирает DOM сам по себе).
      Render.selectNode(null);
      Render.renderAll();
    });
    importInput.value = ''; // сброс, чтобы можно было повторно выбрать тот же файл
  });

  // Горячие клавиши: Delete — удалить выделенный узел, Enter — добавить дочерний узел типа main.
  document.addEventListener('keydown', function (e) {
    var active = document.activeElement;
    // Не перехватываем клавиши во время ввода текста: редактирование текста
    // узла (contentEditable), а также поля ввода — в частности <textarea>
    // редактора заметок (иначе Enter/Delete в заметке создавали/удаляли бы узлы).
    if (active && (active.isContentEditable ||
        active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) {
      return;
    }

    var selectedId = Render.getSelectedId();
    if (!selectedId) {
      return;
    }

    if (e.key === 'Delete') {
      e.preventDefault();
      Render.deleteNode(selectedId);
    } else if (e.key === 'Enter') {
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
});
