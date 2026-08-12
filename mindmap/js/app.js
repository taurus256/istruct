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
    // Не перехватываем клавиши во время редактирования текста узла.
    if (active && active.isContentEditable) {
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
