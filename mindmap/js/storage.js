/*
 * storage.js — сохранение/загрузка модели в localStorage,
 * экспорт и импорт в формате JSON.
 * Формат файла: { "version": 8, "rootId": "n1", "nodes": { ... } }
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
 * version 6: убрано дублирующее внутреннее поле "id" у узлов —
 * идентификатор узла теперь ТОЛЬКО его ключ в объекте "nodes" (раньше id
 * хранился и как ключ, и как поле "id" внутри объекта, и они обязаны были
 * совпадать). При сериализации поле "id" исключается (см. serializeNodes),
 * при загрузке восстанавливается в памяти из ключа (см. Model.setState).
 *
 * version 7: у вопроса теста (data.test.questions[i], см. version 4
 * выше) может появиться необязательное поле "type": "choice" | "freeform".
 * Отсутствие поля равносильно "choice" (старые данные version ≤6 — все
 * выборочные вопросы читаются без изменений). При "type": "freeform"
 * поля "options"/"multiple" не используются, вместо них ОБЯЗАТЕЛЬНО поле
 * "expectedAnswer": string — эталонный ответ. Проверка: введённый пользователем
 * текст засчитывается верным, только если совпадает с "expectedAnswer" после
 * обрезки пробелов по краям и приведения к нижнему регистру у обеих строк
 * (без нечёткого сравнения). См. test.js (isQuestionCorrect/finalize) и
 * DATA_FORMAT.md §4.1.
 *
 * version 8 (текущая): у узлов может появиться необязательное поле
 * "data.color" — string, один из "yellow"|"gray"|"green"|"pink"|"blue".
 * Чисто визуальная заливка фона узла, переключается кнопками группы "Цвета"
 * тулбара (вкладка УЗЛЫ). Отсутствие поля или нераспознанное значение
 * означает «цвет не задан» (нейтральный фон). См. model.js
 * (setColor/getColor/clearColor) и render.js (Render.setNodeColor).
 * Корневой узел не окрашивается. DATA_FORMAT.md §2.7.
 *
 * Обратная совместимость: файлы version 1–6 читаются без изменений —
 * отсутствие поля data.* трактуется как авто-позиция / «заметки нет» /
 * «теста нет» / «не отмечен»; отсутствие "type" у вопроса теста трактуется
 * как "choice"; старое внутреннее поле "id" (если есть) игнорируется и
 * перезаписывается ключом при загрузке (Model.setState). isValidPayload не
 * требует наличия внутреннего id.
 *
 * НЕСКОЛЬКО СХЕМ (многофайловость): формат ПОЛЕЗНОЙ НАГРУЗКИ одной схемы
 * (версия 7 выше) не изменился — файл, полученный через exportJSON(), и
 * сегодня, и раньше имеет один и тот же вид. Изменилось только то, ГДЕ и
 * СКОЛЬКО таких payload'ов хранится в localStorage:
 *
 *   'mindmap.schemes.v1'   — ИНДЕКС: { version, activeId, schemes: [
 *                              { id, modifiedAt, savedAt }, ... ] }.
 *                            Имя схемы НЕ хранится в индексе — это всегда
 *                            text корневого узла самой схемы (см.
 *                            getSchemeName), поэтому переименование корня
 *                            никогда не требует синхронизации индекса.
 *   'mindmap.scheme.<id>'  — payload ОДНОЙ схемы, формат как раньше у
 *                            'mindmap.model.v1' ({version, rootId, nodes}).
 *
 * modifiedAt обновляется при каждом автосохранении (saveImmediate) —
 * отражает момент последнего изменения. savedAt обновляется ТОЛЬКО при
 * exportJSON() (экспорт в файл сейчас — единственное действие, которое
 * считается «сохранением»; в будущем сюда добавится онлайн-синхронизация).
 *
 * Миграция: при первом запуске после этого изменения, если индекса ещё нет,
 * а старый единственный ключ 'mindmap.model.v1' существует — он становится
 * payload'ом первой схемы, строится индекс из одной записи, старый ключ
 * удаляется (см. migrateLegacyIfNeeded).
 */

var Storage = (function () {
  var LEGACY_KEY = 'mindmap.model.v1';
  var INDEX_KEY = 'mindmap.schemes.v1';
  var SCHEME_KEY_PREFIX = 'mindmap.scheme.';
  var DEBOUNCE_MS = 400;
  var debounceTimer = null;
  var idCounter = 0;

  // Простой генератор уникальных id схем (независимый от Model.generateId,
  // который приватен и предназначен для узлов, а не схем).
  function generateSchemeId() {
    idCounter += 1;
    return 's' + Date.now().toString(36) + idCounter.toString(36);
  }

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

  // Минимальная валидация структуры payload'а ОДНОЙ схемы перед тем, как
  // доверять данным (используется и для localStorage, и для импорта файлов).
  function isValidPayload(payload) {
    return !!payload &&
      typeof payload === 'object' &&
      'version' in payload &&
      typeof payload.rootId === 'string' &&
      !!payload.nodes && typeof payload.nodes === 'object' &&
      !!payload.nodes[payload.rootId];
  }

  function schemeKey(id) {
    return SCHEME_KEY_PREFIX + id;
  }

  function readIndex() {
    try {
      var raw = localStorage.getItem(INDEX_KEY);
      if (!raw) {
        return null;
      }
      var idx = JSON.parse(raw);
      if (!idx || typeof idx !== 'object' || !Array.isArray(idx.schemes)) {
        return null;
      }
      return idx;
    } catch (e) {
      return null;
    }
  }

  function writeIndex(idx) {
    try {
      localStorage.setItem(INDEX_KEY, JSON.stringify(idx));
    } catch (e) {
      console.error('Не удалось сохранить индекс схем в localStorage', e);
    }
  }

  function readSchemePayload(id) {
    try {
      var raw = localStorage.getItem(schemeKey(id));
      if (!raw) {
        return null;
      }
      var payload = JSON.parse(raw);
      return isValidPayload(payload) ? payload : null;
    } catch (e) {
      return null;
    }
  }

  function writeSchemePayload(id, payload) {
    try {
      localStorage.setItem(schemeKey(id), JSON.stringify(payload));
    } catch (e) {
      console.error('Не удалось сохранить схему в localStorage', e);
    }
  }

  function findSchemeEntry(idx, id) {
    for (var i = 0; i < idx.schemes.length; i++) {
      if (idx.schemes[i].id === id) {
        return idx.schemes[i];
      }
    }
    return null;
  }

  // modifiedAt — момент последнего автосохранения (живое редактирование).
  function touchModified(id) {
    var idx = readIndex();
    var entry = idx && findSchemeEntry(idx, id);
    if (entry) {
      entry.modifiedAt = Date.now();
      writeIndex(idx);
    }
  }

  // savedAt — момент последнего ЯВНОГО «сохранения» (сегодня это только
  // экспорт в JSON-файл, см. комментарий НЕСКОЛЬКО СХЕМ в шапке файла).
  // Экспорт означает, что текущее состояние памяти теперь зафиксировано
  // во внешнем файле, поэтому заодно обновляем и modifiedAt.
  function touchSaved(id) {
    var idx = readIndex();
    var entry = idx && findSchemeEntry(idx, id);
    if (entry) {
      var now = Date.now();
      entry.savedAt = now;
      entry.modifiedAt = now;
      writeIndex(idx);
    }
  }

  // Регистрирует payload как новую схему в индексе и делает её активной.
  function registerScheme(id, payload, now) {
    writeSchemePayload(id, payload);
    var idx = readIndex() || { version: 1, activeId: null, schemes: [] };
    idx.schemes.push({ id: id, modifiedAt: now, savedAt: now });
    idx.activeId = id;
    writeIndex(idx);
  }

  // Одноразовая миграция со старого единственного ключа 'mindmap.model.v1'
  // на индекс + per-scheme ключи. Не делает ничего, если индекс уже есть
  // (уже мигрировано) или старого ключа нет (чистая установка).
  function migrateLegacyIfNeeded() {
    if (localStorage.getItem(INDEX_KEY)) {
      return;
    }
    var legacyRaw = null;
    try {
      legacyRaw = localStorage.getItem(LEGACY_KEY);
    } catch (e) {
      legacyRaw = null;
    }
    if (!legacyRaw) {
      return;
    }
    try {
      var payload = JSON.parse(legacyRaw);
      if (!isValidPayload(payload)) {
        return;
      }
      registerScheme(generateSchemeId(), payload, Date.now());
      localStorage.removeItem(LEGACY_KEY);
    } catch (e) {
      console.warn('Не удалось мигрировать старые данные mindmap.model.v1', e);
    }
  }

  // Сохраняет ТЕКУЩУЮ модель (Model.getState()) в payload АКТИВНОЙ схемы.
  function saveImmediate() {
    var idx = readIndex();
    if (!idx || !idx.activeId) {
      return; // активной схемы нет — сохранять некуда (не должно случаться после load())
    }
    try {
      var state = Model.getState();
      var payload = { version: 8, rootId: state.rootId, nodes: serializeNodes(state.nodes) };
      writeSchemePayload(idx.activeId, payload);
      touchModified(idx.activeId);
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

  // Загружает активную схему при старте приложения: мигрирует старые данные
  // при необходимости, затем читает индекс и payload активной схемы. Если
  // схем ещё нет вообще (первый запуск) или активная схема повреждена —
  // создаёт пустое дерево и сразу регистрирует его как первую схему.
  function load() {
    migrateLegacyIfNeeded();

    var idx = readIndex();
    if (idx && idx.activeId) {
      var payload = readSchemePayload(idx.activeId);
      if (payload) {
        Model.setState({ rootId: payload.rootId, nodes: payload.nodes });
        return;
      }
      console.warn('Активная схема повреждена или отсутствует, создаём новую');
    }

    Model.initEmpty();
    createScheme();
  }

  // Экспорт текущей модели в файл mindmap.json (Blob + скрытая ссылка-скачивание).
  // Экспорт — это единственное сегодня действие, которое считается
  // «сохранением» (см. шапку файла) — помечаем savedAt активной схемы.
  function exportJSON() {
    var state = Model.getState();
    var payload = { version: 8, rootId: state.rootId, nodes: serializeNodes(state.nodes) };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);

    var a = document.createElement('a');
    a.href = url;
    a.download = 'mindmap.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    var activeId = getActiveId();
    if (activeId) {
      touchSaved(activeId);
    }
  }

  /**
   * Импорт JSON из выбранного файла — ПЕРЕЗАПИСЫВАЕТ АКТИВНУЮ схему на месте
   * (используется кнопкой "Импорт JSON" вкладки СХЕМА). При ошибке
   * структуры/парсинга показывает alert и НЕ трогает текущее состояние.
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

  /**
   * Импорт JSON из файла КАК НОВОЙ схемы — используется панелью "ФАЙЛ"
   * (кнопка "Импортировать с компьютера"), НЕ трогает активную схему до
   * успешного парсинга. При ошибке — alert, ничего не меняется. onSuccess(id)
   * вызывается с id новой схемы ПОСЛЕ того, как она создана и зарегистрирована
   * активной в индексе — загрузку payload'а в Model (loadScheme(id)) выполняет
   * вызывающий код (см. filesPanel.js), как и явный flush исходящей схемы
   * перед переключением.
   */
  function importAsNewScheme(file, onSuccess) {
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

      saveImmediate(); // flush исходящей (текущей активной) схемы перед переключением

      var id = generateSchemeId();
      registerScheme(id, payload, Date.now());

      if (typeof onSuccess === 'function') {
        onSuccess(id);
      }
    };
    reader.onerror = function () {
      alert('Ошибка чтения файла.');
    };
    reader.readAsText(file);
  }

  // Загружает payload схемы id в Model. НЕ трогает индекс/активную схему —
  // это забота вызывающего (см. switchScheme).
  function loadScheme(id) {
    var payload = readSchemePayload(id);
    if (!payload) {
      return false;
    }
    Model.setState({ rootId: payload.rootId, nodes: payload.nodes });
    return true;
  }

  // Переключение на другую схему: сначала flush'ит исходящую схему в
  // localStorage (иначе последние ~400мс несохранённых правок из-за
  // debounce потерялись бы), затем загружает выбранную схему и делает её
  // активной.
  function switchScheme(id) {
    saveImmediate();
    if (!loadScheme(id)) {
      return false;
    }
    var idx = readIndex();
    if (idx) {
      idx.activeId = id;
      writeIndex(idx);
    }
    return true;
  }

  function getActiveId() {
    var idx = readIndex();
    return (idx && idx.activeId) || null;
  }

  // Имя схемы = live text её корневого узла. Читает из payload'а в
  // localStorage (используется для НЕактивных схем — см. listSchemes).
  function getSchemeName(id) {
    var payload = readSchemePayload(id);
    if (payload && payload.nodes && payload.nodes[payload.rootId]) {
      return payload.nodes[payload.rootId].text || 'Без названия';
    }
    return 'Без названия';
  }

  // Создаёt новую схему ИЗ ТЕКУЩЕГО состояния Model — вызывающий код сам
  // готовит нужное состояние (обычно Model.initEmpty() непосредственно перед
  // вызовом). Регистрирует её в индексе, делает активной. Возвращает id.
  function createScheme() {
    var id = generateSchemeId();
    var state = Model.getState();
    var payload = { version: 8, rootId: state.rootId, nodes: serializeNodes(state.nodes) };
    registerScheme(id, payload, Date.now());
    return id;
  }

  // Список всех схем для панели "ФАЙЛ". Для активной схемы имя читается
  // напрямую из Model (in-memory) — там оно гарантированно актуально, даже
  // если автосохранение (debounce) ещё не долетело до localStorage; для
  // остальных схем — из их сохранённого payload'а (getSchemeName).
  function listSchemes() {
    var idx = readIndex();
    if (!idx) {
      return [];
    }
    var activeId = idx.activeId;
    var result = [];
    for (var i = 0; i < idx.schemes.length; i++) {
      var entry = idx.schemes[i];
      var isActive = entry.id === activeId;
      var name;
      if (isActive) {
        var root = Model.getRoot();
        name = (root && root.text) || 'Без названия';
      } else {
        name = getSchemeName(entry.id);
      }
      result.push({
        id: entry.id,
        name: name,
        modifiedAt: entry.modifiedAt,
        savedAt: entry.savedAt,
        isActive: isActive
      });
    }
    return result;
  }

  /**
   * Удаляет схему id целиком (payload + запись в индексе). НЕ трогает
   * Model/активную схему напрямую (как и importAsNewScheme — Storage
   * остаётся чистым слоем хранения, см. комментарий в шапке файла про эту
   * асимметрию) — вызывающий код (ActionHandlers.file_delete в app.js)
   * сам решает, что делать дальше, по возвращаемому значению:
   *   { deleted: boolean, wasActive: boolean, newActiveId: string|null }
   * Если wasActive=true и newActiveId задан — вызывающий должен
   * Storage.loadScheme(newActiveId) + Undo.reset() + Render.renderAll().
   * Если wasActive=true и newActiveId=null — схем больше не осталось,
   * вызывающий должен создать новую (Model.initEmpty() + Storage.createScheme()),
   * как при полностью пустом хранилище (см. load()).
   */
  function deleteScheme(id) {
    var idx = readIndex();
    if (!idx) {
      return { deleted: false, wasActive: false, newActiveId: null };
    }
    var entryIndex = -1;
    for (var i = 0; i < idx.schemes.length; i++) {
      if (idx.schemes[i].id === id) { entryIndex = i; break; }
    }
    if (entryIndex === -1) {
      return { deleted: false, wasActive: false, newActiveId: null };
    }

    var wasActive = idx.activeId === id;
    idx.schemes.splice(entryIndex, 1);

    var newActiveId = null;
    if (wasActive) {
      newActiveId = idx.schemes.length > 0 ? idx.schemes[0].id : null;
      idx.activeId = newActiveId;
    }
    writeIndex(idx);

    try {
      localStorage.removeItem(schemeKey(id));
    } catch (e) {
      console.error('Не удалось удалить схему из localStorage', e);
    }

    return { deleted: true, wasActive: wasActive, newActiveId: newActiveId };
  }

  /**
   * Импорт JSON из файла В СУЩЕСТВУЮЩУЮ схему id (перезаписывает именно
   * ЕЁ payload, НЕ обязательно активную — в отличие от importJSON, который
   * всегда перезаписывает активную). Используется меню "ещё действия" у
   * карточки схемы (см. ActionHandlers.file_import_json в app.js) — там
   * можно выбрать импорт в ЛЮБУЮ карточку, не только в открытую сейчас.
   * НЕ трогает Model напрямую (та же асимметрия, что и у importAsNewScheme/
   * deleteScheme) — если id совпадает с активной схемой, вызывающий код сам
   * обязан Storage.loadScheme(id) + Undo.reset() + Render.renderAll(), иначе
   * canvas будет показывать устаревшее содержимое. При ошибке — alert,
   * ничего не меняется. onSuccess() вызывается после успешного применения.
   */
  function importIntoScheme(id, file, onSuccess) {
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

      writeSchemePayload(id, payload);
      touchModified(id);

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
    importJSON: importJSON,
    importAsNewScheme: importAsNewScheme,
    importIntoScheme: importIntoScheme,
    loadScheme: loadScheme,
    switchScheme: switchScheme,
    createScheme: createScheme,
    deleteScheme: deleteScheme,
    getActiveId: getActiveId,
    getSchemeName: getSchemeName,
    listSchemes: listSchemes
  };
})();
