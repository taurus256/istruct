/*
 * storage.js — сохранение/загрузка модели в localStorage,
 * экспорт и импорт в формате JSON.
 * Формат файла: { "version": 6, "rootId": "n1", "nodes": { ... } }
 *
 * ИДЕНТИФИКАТОР УЗЛА (важно): узел хранится как значение по КЛЮЧУ в объекте
 * "nodes" — именно ключ и есть идентификатор узла. Внутреннего поля "id" у
 * объекта узла в сериализованном формате НЕТ (см. version 6 ниже). rootId и
 * parentId ссылаются на эти ключи.
 *
 * version 2: у узлов в "nodes" может появиться необязательное
 * поле "data.offset": { "dx": number, "dy": number } — ручное смещение узла
 * (и всей его ветви) относительно автоматической radial-позиции, задаваемое
 * через Model.setOffset()/addOffset() (см. render.js/dragdrop.js).
 *
 * version 3: у узлов может появиться необязательное поле
 * "data.note" — строка в формате Markdown (заметка узла, редактируется через
 * боковую панель заметок, см. notes.js). Отсутствие поля означает «заметки нет».
 *
 * version 4: у узлов могут появиться необязательные поля тестирования:
 *   "data.test"       — ОПРЕДЕЛЕНИЕ теста (создаётся внешним приложением):
 *       {
 *         title?: string,            // если нет — заголовком служит node.text
 *         description?: string,      // Markdown, показывается на старте
 *         passThreshold: number,     // % правильных вопросов для «пройдено» (0..100)
 *         estimatedMinutes?: number, // если нет — оценка от числа вопросов
 *         questions: [ {
 *           id: string, text: string (Markdown), multiple: boolean,
 *           options: [ { id: string, text: string (Markdown), correct: boolean } ]
 *         } ]
 *       }
 *   "data.testResult" — результат ПОСЛЕДНЕЙ попытки (историю не храним),
 *       пишется только при завершении (успех/провал/прерывание):
 *       {
 *         completedAt: number, status: "passed"|"failed"|"aborted",
 *         correctCount: number, answeredCount: number, totalCount: number,
 *         scorePercent: number, passed: boolean, elapsedMs: number,
 *         wrong: [ { questionText, yourText, correctText } ]
 *       }
 *   См. model.js (get/set/clear Test/TestResult) и test.js.
 *
 * version 5: у узлов может появиться необязательное поле
 * "data.marked" — boolean, чисто визуальная отметка узла (зелёная рамка),
 * переключается кнопкой "Выполнен" тулбара. Отсутствие поля означает
 * «не отмечен». См. model.js (setMarked/isMarked/toggleMarked) и
 * render.js (Render.toggleMarked).
 *
 * version 6 (текущая): убрано дублирующее внутреннее поле "id" у узлов —
 * идентификатор узла теперь ТОЛЬКО его ключ в объекте "nodes" (раньше id
 * хранился и как ключ, и как поле "id" внутри объекта, и они обязаны были
 * совпадать). При сериализации поле "id" исключается (см. serializeNodes),
 * при загрузке восстанавливается в памяти из ключа (см. Model.setState).
 *
 * Обратная совместимость: файлы version 1–5 читаются без изменений —
 * отсутствие поля data.* трактуется как авто-позиция / «заметки нет» /
 * «теста нет» / «не отмечен»; старое внутреннее поле "id" (если есть)
 * игнорируется и перезаписывается ключом при загрузке (Model.setState).
 * isValidPayload не требует наличия внутреннего id.
 */

var Storage = (function () {
  var STORAGE_KEY = 'mindmap.model.v1';
  var DEBOUNCE_MS = 400;
  var debounceTimer = null;

  // Строит объект nodes для сериализации БЕЗ внутреннего поля "id" у каждого
  // узла (идентификатор = ключ). Не мутирует in-memory state: приложение
  // продолжает работать с моделью в памяти, где node.id обязателен (его
  // массово читают render.js/dragdrop.js/model.js). Копируем каждый узел в
  // новый объект и убираем у копии поле id.
  function serializeNodes(nodes) {
    var out = {};
    for (var key in nodes) {
      if (Object.prototype.hasOwnProperty.call(nodes, key)) {
        var copy = {};
        var node = nodes[key];
        for (var prop in node) {
          if (Object.prototype.hasOwnProperty.call(node, prop) && prop !== 'id') {
            copy[prop] = node[prop];
          }
        }
        out[key] = copy;
      }
    }
    return out;
  }

  function saveImmediate() {
    try {
      var state = Model.getState();
      var payload = { version: 6, rootId: state.rootId, nodes: serializeNodes(state.nodes) };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.error('Не удалось сохранить mind map в localStorage', e);
    }
  }

  /**
   * Отложенное сохранение (debounce): если мутации происходят часто
   * (например, ввод текста), реальная запись в localStorage выполняется
   * только один раз после паузы в DEBOUNCE_MS миллисекунд.
   */
  function save() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(saveImmediate, DEBOUNCE_MS);
  }

  // Минимальная валидация структуры перед тем, как доверять данным.
  function isValidPayload(payload) {
    return !!payload &&
      typeof payload === 'object' &&
      'version' in payload &&
      typeof payload.rootId === 'string' &&
      !!payload.nodes && typeof payload.nodes === 'object' &&
      !!payload.nodes[payload.rootId];
  }

  // Загружает модель при старте приложения.
  function load() {
    var raw = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      raw = null;
    }

    if (raw) {
      try {
        var payload = JSON.parse(raw);
        if (isValidPayload(payload)) {
          Model.setState({ rootId: payload.rootId, nodes: payload.nodes });
          return;
        }
        console.warn('Данные в localStorage не прошли валидацию, создаём новое дерево');
      } catch (e) {
        console.warn('Повреждённые данные в localStorage, создаём новое дерево', e);
      }
    }

    // Нет данных или они повреждены — создаём дерево с одним root-узлом.
    Model.initEmpty();
  }

  // Экспорт текущей модели в файл mindmap.json (Blob + скрытая ссылка-скачивание).
  function exportJSON() {
    var state = Model.getState();
    var payload = { version: 6, rootId: state.rootId, nodes: serializeNodes(state.nodes) };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);

    var a = document.createElement('a');
    a.href = url;
    a.download = 'mindmap.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Импорт JSON из выбранного файла.
   * При ошибке структуры/парсинга показывает alert и НЕ трогает текущее состояние.
   * onSuccess вызывается после успешного применения импортированных данных.
   */
  function importJSON(file, onSuccess) {
    if (!file) {
      return;
    }

    var reader = new FileReader();
    reader.onload = function (event) {
      var payload;
      try {
        payload = JSON.parse(event.target.result);
      } catch (e) {
        alert('Не удалось прочитать файл: некорректный JSON.');
        return;
      }

      if (!isValidPayload(payload)) {
        alert('Файл повреждён или имеет неверный формат: ожидаются поля version, rootId, nodes.');
        return;
      }

      Model.setState({ rootId: payload.rootId, nodes: payload.nodes });
      saveImmediate();
      if (typeof onSuccess === 'function') {
        onSuccess();
      }
    };
    reader.onerror = function () {
      alert('Ошибка чтения файла.');
    };
    reader.readAsText(file);
  }

  return {
    save: save,
    saveImmediate: saveImmediate,
    load: load,
    exportJSON: exportJSON,
    importJSON: importJSON
  };
})();
