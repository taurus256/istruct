/*
 * storage.js — сохранение/загрузка модели в IndexedDB,
 * экспорт и импорт в формате JSON.
 * Формат файла: { "version": 9, "rootId": "n1", "nodes": { ... }, "pan"?: {"x":0,"y":0} }
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
 * version 10 (текущая): у пайлоада СХЕМЫ ЦЕЛИКОМ (рядом с "version"/"rootId"/
 * "nodes"/"pan", НЕ внутри узла) может появиться необязательное поле
 * "locked": true — схема только для чтения (экспорт «Экспортировать курс»,
 * см. exportLocked). Флаг относится ко ВСЕЙ схеме, а не к узлу: при загрузке
 * такого файла приложение прячет инструменты редактирования и блокирует
 * правку содержимого (см. ActionManager/lockedAvailable, model.js:isLocked); тесты
 * проходить можно. Хранится ВНЕ Model.state — как и "pan" — в кэше
 * currentLocked, поэтому автосохранение locked-схемы не снимает флаг.
 * Отсутствие поля — обычная схема.
 *
 * version 9: у пайлоада СХЕМЫ ЦЕЛИКОМ (рядом с "version"/"rootId"/
 * "nodes", НЕ внутри узла) может появиться необязательное поле "pan":
 * { "x": number, "y": number } — последняя сохранённая позиция панорамирования
 * (scrollLeft/scrollTop контейнера #mindmap-root) ЭТОЙ схемы, в НАТУРАЛЬНЫХ
 * координатах (при zoom=1, НЕ зависит от текущего масштаба на момент
 * сохранения — при восстановлении домножается на актуальный Render.getZoom(),
 * см. pan.js/app.js). Это СВОЙСТВО ВСЕЙ СХЕМЫ (как rootId), НЕ атрибут узла —
 * хранится ВНЕ Model.state (см. Storage.setPan/getPan ниже), ЧТОБЫ НЕ участвовать в
 * снапшотах undo/redo (undo.js берёт полный Model.getState() — панорамирование, как
 * зум/тема, является UI-состоянием "где сейчас смотрит пользователь", а НЕ
 * данными схемы в смысле undo — см. память проекта про undo.js). Отсутствие
 * поля (или старый файл version ≤8) означает «позиция не сохранена» — при
 * открытии такой схемы просто ничего не восстанавливается (остаётся стандартное
 * scrollLeft=0/scrollTop=0, как сейчас). См. Storage.setPan/getPan, pan.js (точка
 * сохранения — конец drag-панорамирования), app.js/filesPanel.js (точки
 * восстановления — после первой загрузки/переключения схемы).
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
 * СКОЛЬКО таких payload'ов хранится:
 *
 *   база IndexedDB 'mindmap' (версия схемы хранилища 1):
 *     store 'meta'   — запись { key: 'index', version, activeId, schemes: [
 *                        { id, modifiedAt, savedAt }, ... ] } — ИНДЕКС схем.
 *                      Имя схемы НЕ хранится в индексе — это всегда text
 *                      корневого узла самой схемы (см. getSchemeName),
 *                      поэтому переименование корня никогда не требует
 *                      синхронизации индекса.
 *     store 'schemes'— записи { id, payload } — payload ОДНОЙ схемы,
 *                      формат как раньше у 'mindmap.model.v1'
 *                      ({version, rootId, nodes}).
 *
 * modifiedAt обновляется при каждом автосохранении (saveImmediate) —
 * отражает момент последнего изменения. savedAt обновляется ТОЛЬКО при
 * exportJSON() (экспорт в файл сейчас — единственное действие, которое
 * считается «сохранением»; в будущем сюда добавится онлайн-синхронизация).
 *
 * АСИНХРОННОСТЬ (важно для вызывающего кода): IndexedDB асинхронен, поэтому
 * публичное API делится на три группы:
 *   • init() — ЕДИНСТВЕННЫЙ способ загрузить данные при старте: мигрирует
 *     старые данные, открывает базу, наполняет кэш индекса. Возвращает
 *     Promise. app.js ждёт его перед Render.init()/renderAll().
 *   • Чтение из КЭША В ПАМЯТИ (getActiveId/getSchemeName/listSchemes/
 *     getPan) — остались СИНХРОННЫМИ. Кэш индекса (indexCache) и кэш имён
 *     (nameCache — корневой текст каждой схемы) наполняются в init()/load()/
 *     loadScheme() и обновляются при сохранении, поэтому панель ФАЙЛ рисуется
 *     без ожидания базы. Имя АКТИВНОЙ схемы, как и раньше, берётся прямо из
 *     Model — кэш для неё не используется.
 *   • Запись и смена схемы (save/saveImmediate/setPan/createScheme/
 *     loadScheme/switchScheme/deleteScheme/import*) — асинхронны. Вызов
 *     save()/saveImmediate() можно делать fire-and-forget (все точки
 *     автосохранения в render.js/notes.js/test.js/undo.js так и делают), но
 *     перед сменой схемы исходящую схему нужно дождаться (см. switchScheme —
 *     он сам это делает), иначе последние ~400 мс правок из-за debounce
 *     потерялись бы.
 *
 * АТОМАРНОСТЬ: payload схемы и индекс пишутся ОДНОЙ транзакцией
 * (writeScheme + touchEntry внутри tx) — раньше это были две независимые
 * записи localStorage, и обрыв между ними оставлял рассогласование.
 *
 * persist: requestPersistence() просит браузер не вытеснять данные под
 * давлением квоты (navigator.storage.persist). Квоту IndexedDB (~доля
 * свободного диска) и статус persistence можно посмотреть в
 * getStorageInfo() — мини-панель хранилища в панели ФАЙЛ (filesPanel.js).
 *
 * Миграция: при первом запуске после перехода на IndexedDB, если в базе ещё
 * нет индекса, а в localStorage остались данные (актуальный
 * 'mindmap.schemes.v1' + 'mindmap.scheme.<id>' либо старый единственный ключ
 * 'mindmap.model.v1'), они переносятся в базу. Ключи localStorage после
 * успешной миграции НЕ удаляются: они остаются резервной копией на случай
 * отката, а повторной миграции не будет — база уже содержит индекс
 * (см. migrateFromLocalStorage).
 */

var Storage = (function () {
  var LEGACY_KEY = 'mindmap.model.v1';
  var INDEX_KEY = 'mindmap.schemes.v1';
  var SCHEME_KEY_PREFIX = 'mindmap.scheme.';
  var DB_NAME = 'mindmap';
  var DB_VERSION = 1;
  var META_STORE = 'meta';
  var SCHEMES_STORE = 'schemes';
  var INDEX_RECORD_KEY = 'index';
  var DEBOUNCE_MS = 400;
  var debounceTimer = null;
  var idCounter = 0;

  var dbPromise = null;
  // Кэш индекса схем (тот же объект, что запись 'index' в store 'meta'):
  // { version, activeId, schemes: [{ id, modifiedAt, savedAt }] }. Наполняется
  // в init(), дальше читающие методы работают с ним синхронно.
  var indexCache = null;
  // Кэш имён схем: { id: корневой текст } — чтобы listSchemes()/getSchemeName()
  // не ходили в базу за каждой НЕактивной схемой.
  var nameCache = {};
  // Кэш флага locked КАЖДОЙ схемы (true — схема курса, только для чтения) —
  // по тем же причинам, что и nameCache: панель ФАЙЛ рисуется синхронно по
  // индексу, а флаг лежит в payload'е, который читается только при загрузке
  // схемы. Нужен для иконки карточки (icon_locked.svg), см. listSchemes.
  var lockedCache = {};
  // Кэш текущего pan АКТИВНОЙ схемы в памяти — { x, y } или null. Устанавливается
  // при load()/loadScheme()/createScheme() (из payload'а, который загружается в
  // Model) и обновляется в setPan(). НУЖЕН именно как кэш в памяти, а НЕ
  // просто чтение из базы при каждой сериализации: saveImmediate()/exportJSON()
  // полностью перестраивают payload из Model.getState() при ЛЮБОЙ мутации узла
  // (вкл. частые автосохранения при вводе текста) — без этого кэша каждое
  // такое сохранение стирало бы ранее сохранённый pan (payload формируется заново
  // с нуля, без поля "pan").
  var currentPan = null;
  // Кэш флага locked АКТИВНОЙ схемы — по тем же причинам, что и currentPan:
  // buildPayload() собирается заново при каждом автосохранении, и без этого
  // кэша поле "locked" пропадало бы из payload'а при первой же правке.
  var currentLocked = false;

  /* ============================ IndexedDB ================================= */

  function openDb() {
    if (dbPromise) {
      return dbPromise;
    }
    dbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB недоступен в этом браузере'));
        return;
      }
      var request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function (event) {
        var db = event.target.result;
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(SCHEMES_STORE)) {
          db.createObjectStore(SCHEMES_STORE, { keyPath: 'id' });
        }
      };
      request.onsuccess = function () {
        resolve(request.result);
      };
      request.onerror = function () {
        reject(request.error || new Error('Не удалось открыть базу mindmap'));
      };
      request.onblocked = function () {
        // Другая вкладка держит старую версию базы — не виснем молча.
        console.warn('Открытие базы mindmap заблокировано другой вкладкой');
      };
    });
    return dbPromise;
  }

  // Оборачивает одну транзакцию в Promise. fn(tx) выполняет запросы; промис
  // резолвится событием oncomplete — то есть после РЕАЛЬНОЙ фиксации всех
  // запросов транзакции (это и даёт атомарность «payload + индекс»).
  function runTx(db, storeNames, mode, fn) {
    return new Promise(function (resolve, reject) {
      var tx;
      try {
        tx = db.transaction(storeNames, mode);
      } catch (e) {
        reject(e);
        return;
      }
      var result;
      tx.oncomplete = function () {
        resolve(result);
      };
      tx.onerror = function () {
        reject(tx.error || new Error('Ошибка транзакции IndexedDB'));
      };
      tx.onabort = function () {
        reject(tx.error || new Error('Транзакция IndexedDB прервана'));
      };
      try {
        result = fn(tx);
      } catch (e) {
        try { tx.abort(); } catch (ignored) {}
        reject(e);
      }
    });
  }

  function readIndexRecord(db) {
    return runTx(db, [META_STORE], 'readonly', function (tx) {
      var request = tx.objectStore(META_STORE).get(INDEX_RECORD_KEY);
      return new Promise(function (resolve) {
        request.onsuccess = function () {
          var record = request.result;
          if (record && Array.isArray(record.schemes)) {
            var idx = { version: record.version, activeId: record.activeId, schemes: record.schemes };
            // Мутируем объект кэша НА МЕСТЕ — на него могут ссылаться уже
            // построенные списки карточек.
            indexCache = idx;
            resolve(idx);
          } else {
            indexCache = null;
            resolve(null);
          }
        };
      });
    });
  }

  // Единственная точка записи индекса: гарантирует, что в памяти и в базе
  // лежит один и тот же объект (вызывающий код мутирует indexCache).
  function writeIndexRecord(db, idx) {
    return runTx(db, [META_STORE], 'readwrite', function (tx) {
      tx.objectStore(META_STORE).put({
        key: INDEX_RECORD_KEY,
        version: idx.version,
        activeId: idx.activeId,
        schemes: idx.schemes
      });
    });
  }

  // Заполняет nameCache именами ВСЕХ схем — иначе после перезапуска панель
  // ФАЙЛ показывала бы «Без названия» для всех неактивных схем.
  function cacheAllNames(db) {
    return runTx(db, [SCHEMES_STORE], 'readonly', function (tx) {
      var request = tx.objectStore(SCHEMES_STORE).getAll();
      request.onsuccess = function () {
        (request.result || []).forEach(function (record) {
          if (record && isValidPayload(record.payload)) {
            cacheName(record.id, record.payload);
          }
        });
      };
    });
  }

  function readSchemeRecord(db, id) {
    return runTx(db, [SCHEMES_STORE], 'readonly', function (tx) {
      var request = tx.objectStore(SCHEMES_STORE).get(id);
      return new Promise(function (resolve) {
        request.onsuccess = function () {
          var record = request.result;
          resolve(record && isValidPayload(record.payload) ? record.payload : null);
        };
      });
    });
  }

  function writeSchemeRecord(db, id, payload) {
    return runTx(db, [SCHEMES_STORE], 'readwrite', function (tx) {
      tx.objectStore(SCHEMES_STORE).put({ id: id, payload: payload });
    });
  }

  // Запись payload СХЕМЫ + обновление её записи в индексе ОДНОЙ транзакцией.
  // touchEntry(entry) правит timestamps записи индекса (modifiedAt/savedAt)
  // прямо в indexCache; если entry нет — индекс тоже не пишется.
  function persistScheme(db, id, payload, touchEntry) {
    return runTx(db, [SCHEMES_STORE, META_STORE], 'readwrite', function (tx) {
      tx.objectStore(SCHEMES_STORE).put({ id: id, payload: payload });
      var idx = indexCache;
      if (!idx) {
        return;
      }
      if (typeof touchEntry === 'function') {
        touchEntry(idx);
      }
      tx.objectStore(META_STORE).put({
        key: INDEX_RECORD_KEY,
        version: idx.version,
        activeId: idx.activeId,
        schemes: idx.schemes
      });
    });
  }

  // Ошибка записи — прежде всего переполнение квоты (QuotaExceededError).
  // Раньше это молча уходило в console.error, то есть пользователь терял
  // данные, ничего не узнав; теперь сообщаем один раз на сессию, чтобы
  // автосохранение при каждом нажатии клавиши не завалило экран алертами.
  var quotaWarned = false;
  function handleWriteError(e, what) {
    console.error('Не удалось сохранить ' + what + ' в IndexedDB', e);
    if (quotaWarned) {
      return;
    }
    var isQuota = e && (e.name === 'QuotaExceededError' ||
      e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      (e.inner && e.inner.name === 'QuotaExceededError'));
    if (isQuota) {
      quotaWarned = true;
      alert('Не удалось сохранить изменения: закончилось место в хранилище браузера.\n' +
        'Экспортируйте схему в JSON (Схема → Экспорт JSON) и освободите место.');
    }
  }

  /* ============================ Утилиты =================================== */

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
  // доверять данным (используется и для базы, и для импорта файлов).
  function isValidPayload(payload) {
    return !!payload &&
      typeof payload === 'object' &&
      'version' in payload &&
      typeof payload.rootId === 'string' &&
      !!payload.nodes && typeof payload.nodes === 'object' &&
      !!payload.nodes[payload.rootId];
  }

  function findSchemeEntry(idx, id) {
    if (!idx) {
      return null;
    }
    for (var i = 0; i < idx.schemes.length; i++) {
      if (idx.schemes[i].id === id) {
        return idx.schemes[i];
      }
    }
    return null;
  }

  // Имя схемы = text корневого узла её payload'а.
  function payloadName(payload) {
    if (payload && payload.nodes && payload.nodes[payload.rootId]) {
      return payload.nodes[payload.rootId].text || 'Без названия';
    }
    return 'Без названия';
  }

  function cacheName(id, payload) {
    nameCache[id] = payloadName(payload);
    lockedCache[id] = extractLocked(payload);
  }

  // Строит payload схемы из ТЕКУЩЕГО Model.getState() + текущего currentPan кэша
  // (если он задан) — общий хелпер для saveImmediate/exportJSON/createScheme, чтобы
  // ни одно из них не затирало ранее сохранённый pan при перезаписи payload'а.
  function buildPayload() {
    var state = Model.getState();
    var payload = { version: 10, rootId: state.rootId, nodes: serializeNodes(state.nodes) };
    if (currentPan) {
      payload.pan = { x: currentPan.x, y: currentPan.y };
    }
    if (currentLocked) {
      payload.locked = true;
    }
    return payload;
  }

  function extractLocked(payload) {
    return !!(payload && payload.locked === true);
  }

  // Извлекает поле "pan" из payload'а с валидацией ({x,y} числа или null) —
  // общий хелпер для load()/loadScheme() при установке currentPan.
  function extractPan(payload) {
    if (!payload || !payload.pan ||
        typeof payload.pan.x !== 'number' || typeof payload.pan.y !== 'number' ||
        !isFinite(payload.pan.x) || !isFinite(payload.pan.y)) {
      return null;
    }
    return { x: payload.pan.x, y: payload.pan.y };
  }

  /* ============================ Миграция ================================== */

  // Переносит схемы из localStorage в базу. Вызывается из init() только
  // когда в базе ещё нет индекса (чистая установка IndexedDB). Поддерживает
  // оба исторических формата:
  //   • многосхемный: 'mindmap.schemes.v1' + 'mindmap.scheme.<id>';
  //   • старый единственный: 'mindmap.model.v1'.
  // Ключи localStorage НЕ удаляются — остаются резервной копией.
  // Возвращает true, если что-то перенесено.
  function migrateFromLocalStorage(db) {
    var idxRaw = null;
    try {
      idxRaw = localStorage.getItem(INDEX_KEY);
    } catch (e) {
      return Promise.resolve(false);
    }

    var entries = [];
    var payloads = {};
    var now = Date.now();

    if (idxRaw) {
      var legacyIndex = null;
      try {
        legacyIndex = JSON.parse(idxRaw);
      } catch (e) {
        legacyIndex = null;
      }
      if (legacyIndex && Array.isArray(legacyIndex.schemes)) {
        for (var i = 0; i < legacyIndex.schemes.length; i++) {
          var entry = legacyIndex.schemes[i];
          var raw = null;
          try {
            raw = localStorage.getItem(SCHEME_KEY_PREFIX + entry.id);
          } catch (e) {
            raw = null;
          }
          if (!raw) {
            continue;
          }
          var payload = null;
          try {
            payload = JSON.parse(raw);
          } catch (e) {
            continue;
          }
          if (!isValidPayload(payload)) {
            continue;
          }
          entries.push({
            id: entry.id,
            modifiedAt: entry.modifiedAt || now,
            savedAt: entry.savedAt || entry.modifiedAt || now
          });
          payloads[entry.id] = payload;
        }
        var activeId = legacyIndex.activeId;
        if (activeId && !payloads[activeId]) {
          activeId = entries.length > 0 ? entries[0].id : null;
        }
        return migrateBatch(db, entries, payloads, activeId);
      }
    }

    // Старый единственный ключ (до появления нескольких схем).
    var legacyRaw = null;
    try {
      legacyRaw = localStorage.getItem(LEGACY_KEY);
    } catch (e) {
      return Promise.resolve(false);
    }
    if (!legacyRaw) {
      return Promise.resolve(false);
    }
    var single = null;
    try {
      single = JSON.parse(legacyRaw);
    } catch (e) {
      return Promise.resolve(false);
    }
    if (!isValidPayload(single)) {
      return Promise.resolve(false);
    }
    var singleId = generateSchemeId();
    entries.push({ id: singleId, modifiedAt: now, savedAt: now });
    payloads[singleId] = single;
    return migrateBatch(db, entries, payloads, singleId);
  }

  function migrateBatch(db, entries, payloads, activeId) {
    if (!entries.length) {
      return Promise.resolve(false);
    }
    var idx = { version: 1, activeId: activeId || entries[0].id, schemes: entries };
    return runTx(db, [SCHEMES_STORE, META_STORE], 'readwrite', function (tx) {
      var schemeStore = tx.objectStore(SCHEMES_STORE);
      for (var i = 0; i < entries.length; i++) {
        var id = entries[i].id;
        schemeStore.put({ id: id, payload: payloads[id] });
        nameCache[id] = payloadName(payloads[id]);
        lockedCache[id] = extractLocked(payloads[id]);
      }
      tx.objectStore(META_STORE).put({
        key: INDEX_RECORD_KEY,
        version: idx.version,
        activeId: idx.activeId,
        schemes: idx.schemes
      });
    }).then(function () {
      indexCache = idx;
      console.info('Схемы перенесены из localStorage в IndexedDB: ' + entries.length);
      return true;
    });
  }

  /* ============================ Запись ==================================== */

  // Сохраняет ТЕКУЩУЮ модель (Model.getState()) в payload АКТИВНОЙ схемы.
  // Возвращает Promise; вызывать можно без ожидания (fire-and-forget) — см.
  // комментарий про асинхронность в шапке файла.
  function saveImmediate() {
    var idx = indexCache;
    if (!idx || !idx.activeId) {
      return Promise.resolve(); // активной схемы нет — сохранять некуда
    }
    var id = idx.activeId;
    var payload = buildPayload();
    return openDb().then(function (db) {
      return persistScheme(db, id, payload, function (cache) {
        var entry = findSchemeEntry(cache, id);
        if (entry) {
          entry.modifiedAt = Date.now();
        }
      }).then(function () {
        cacheName(id, payload);
      });
    }).catch(function (e) {
      handleWriteError(e, 'схему');
    });
  }

  /**
   * Отложенное сохранение (debounce): если мутации происходят часто
   * (например, ввод текста), реальная запись в IndexedDB выполняется
   * только один раз после паузы в DEBOUNCE_MS миллисекунд.
   */
  function save() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(saveImmediate, DEBOUNCE_MS);
  }

  // Гасит отложенное сохранение (если оно ждёт) и сразу сохраняет. Нужен там,
  // где важна актуальность данных ПЕРЕД сменой схемы (switchScheme,
  // importAsNewScheme).
  function flush() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    return saveImmediate();
  }

  /**
   * Сохраняет позицию панорамирования (x,y в НАТУРАЛЬНЫХ координатах,
   * см. шапку файла про version 9) в payload АКТИВНОЙ схемы. Строит payload ИЗ
   * ТЕКУЩЕГО Model.getState() (точно так же, как saveImmediate) — НЕ читает
   * payload из базы напрямую (он может быть устаревшим из-за debounce в
   * save() — иначе запись pan могла бы затереть недавние несохранённые
   * правки дерева устаревшим снимком nodes). Панорамирование само по себе НЕ
   * хранится в Model/Model.getState() (UI-состояние, не данные дерева, см. шапку
   * файла) — поэтому оно НЕ попадает в undo-снапшоты (undo.js снимает только
   * Model.getState()). Вызывается из pan.js после окончания drag-панорамирования
   * (с реальным перемещением). Ничего не делает, если активной схемы нет.
   */
  function setPan(x, y) {
    currentPan = { x: x, y: y };
    return saveImmediate().catch(function (e) {
      console.error('Не удалось сохранить позицию панорамирования', e);
    });
  }

  /**
   * Читает текущий (в памяти, не из базы напрямую) currentPan — { x, y }
   * (натуральные координаты при zoom=1) или null, если не сохранялась (включая
   * старые схемы version ≤8, у которых этого поля никогда не было). Обновляется
   * при load()/loadScheme() и сбрасывается в createScheme() — всегда синхронен с
   * тем, что реально загружено в Model на данный момент.
   */
  function getPan() {
    return currentPan ? { x: currentPan.x, y: currentPan.y } : null;
  }

  /**
   * true, если АКТИВНАЯ схема загружена из файла схемы курса ("locked": true
   * в payload'е) — т.е. сейчас приложение должно работать в режиме только для
   * чтения (см. ActionManager). Читается из кэша в памяти, синхронно,
   * как и getPan(): обновляется при init/loadScheme/importJSON/switchScheme.
   */
  function getLocked() {
    return currentLocked;
  }

  /* ============================ Чтение ==================================== */

  // Загружает активную схему при старте приложения: открывает базу, при
  // необходимости мигрирует данные из localStorage, затем читает индекс и
  // payload активной схемы. Если схем ещё нет вообще (первый запуск) или
  // активная схема повреждена — создаёт пустое дерево и сразу регистрирует
  // его как первую схему. Возвращает Promise — app.js ждёт его перед отрисовкой.
  function init() {
    return openDb().then(function (db) {
      // Миграция — только если в базе ещё нет индекса: ключи localStorage остаются
      // резервной копией, и повторный перенос при каждом старте перезаписывал бы
      // индекс старым списком схем, теряя созданные после переноса.
      return readIndexRecord(db).then(function (idx) {
        if (idx) {
          return idx;
        }
        return migrateFromLocalStorage(db).then(function () {
          return readIndexRecord(db);
        });
      }).then(function (idx) {
        return cacheAllNames(db).then(function () {
          return idx;
        });
      }).then(function (idx) {
        if (idx && idx.activeId) {
          return readSchemeRecord(db, idx.activeId).then(function (payload) {
            if (payload) {
              Model.setState({ rootId: payload.rootId, nodes: payload.nodes });
              currentPan = extractPan(payload);
              currentLocked = extractLocked(payload);
              cacheName(idx.activeId, payload);
              return;
            }
            console.warn('Активная схема повреждена или отсутствует, создаём новую');
            Model.initEmpty();
            currentPan = null;
            currentLocked = false;
            return createScheme();
          });
        }
        Model.initEmpty();
        currentPan = null;
        currentLocked = false;
        return createScheme();
      });
    }).catch(function (e) {
      console.error('Не удалось инициализировать хранилище IndexedDB', e);
      // Без базы приложение всё равно должно открыться — работаем на пустой
      // модели, дальнейшие сохранения будут падать в handleWriteError.
      Model.initEmpty();
      currentPan = null;
      currentLocked = false;
    });
  }

  // Имя файла для exportJSON: имя схемы (text корневого узла) без символов,
  // запрещённых в именах файлов на Windows/POSIX (/ \ : * ? " < > |,
  // управляющие символы), с обрезанными пробелами/точками по краям (Windows не
  // допускает точку в конце имени). Переводим строки/табуляцию в пробелы и
  // схлопываем повторы. Пустое/служебное имя («Без названия») → прежний
  // mindmap.json, чтобы не получить файл с пустым именем.
  function exportFileName(payload) {
    var raw = payloadName(payload);
    if (!raw || raw === 'Без названия') {
      return 'mindmap.json';
    }
    var safe = raw
      .replace(/[\u0000-\u001f\u007f]+/g, ' ')
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[\s.]+|[\s.]+$/g, '');
    if (!safe) {
      return 'mindmap.json';
    }
    // Лимит длины: 255 байт — ограничение большинства файловых систем; режем
    // по символам с запасом под расширение (кириллица в UTF-8 занимает 2 байта).
    if (safe.length > 80) {
      safe = safe.slice(0, 80).replace(/[\s.]+$/g, '');
    }
    return safe + '.json';
  }

  // Имя файла «Экспортировать курс»: то же имя схемы, но с суффиксом
  // «-course» — чтобы файл курса не перезатирал обычный экспорт той же схемы.
  function exportLockedFileName(payload) {
    var name = exportFileName(payload);
    return name.replace(/\.json$/i, '') + '-course.json';
  }

  // Скачивание текста как файла — общий код exportJSON/exportLocked.
  function downloadText(text, fileName) {
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob);

    var a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Отметка «схема сохранена в файл» (savedAt) — общая для exportJSON/exportLocked.
  function markExported(payload) {
    var idx = indexCache;
    if (!idx || !idx.activeId) {
      return;
    }
    var id = idx.activeId;
    var entry = findSchemeEntry(idx, id);
    if (!entry) {
      return;
    }
    var now = Date.now();
    entry.savedAt = now;
    entry.modifiedAt = now;
    cacheName(id, payload);
    openDb().then(function (db) {
      return writeIndexRecord(db, idx);
    }).catch(function (e) {
      handleWriteError(e, 'отметку об экспорте');
    });
  }

  // Экспорт текущей модели в файл, имя которого совпадает с именем схемы
  // (text корневого узла), см. exportFileName. Экспорт — это единственное
  // сегодня действие, которое считается «сохранением» (см. шапку файла) —
  // помечаем savedAt активной схемы.
  function exportJSON() {
    var payload = buildPayload();
    downloadText(JSON.stringify(payload, null, 2), exportFileName(payload));
    markExported(payload);
  }

  /**
   * «Экспортировать курс»: в файл пишется обфусцированный конверт (lockPack.js)
   * с "locked": true. Активная схема при этом остаётся редактируемой — режим только
   * для чтения включается при загрузке этого файла.
   */
  function exportLocked() {
    var payload = buildPayload();
    payload.locked = true;
    downloadText(JSON.stringify(LockPack.pack(payload)), exportLockedFileName(payload));
    markExported(payload);
  }

  /**
   * Разбирает текст файла в payload схемы — общая точка для всех путей импорта
   * (importJSON/importAsNewScheme/importIntoScheme). Понимает обычный JSON
   * схемы и конверт «Экспортировать курс» (lockPack.js); payload из конверта
   * всегда получает locked: true. При ошибке показывает alert и возвращает null.
   */
  function parseSchemeFile(text) {
    var parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      alert('Не удалось прочитать файл: некорректный JSON.');
      return null;
    }

    var payload = parsed;
    if (LockPack.isPacked(parsed)) {
      var unpacked = LockPack.unpack(parsed);
      if (!unpacked.ok) {
        alert(unpacked.reason);
        return null;
      }
      payload = unpacked.payload;
    }

    if (!isValidPayload(payload)) {
      alert('Файл повреждён или имеет неверный формат: ожидаются поля version, rootId, nodes.');
      return null;
    }
    if (payload !== parsed) {
      payload.locked = true;
    }
    return payload;
  }

  /**
   * Решает, что делать с файлом, загружаемым поверх существующей схемы:
   * заменить её (только при совпадающем уровне доступа — locked в locked или
   * обычная в обычную — и после подтверждения) или создать копию (уровни
   * разные). Так схема курса никогда не затирает редактируемую схему.
   * Возвращает 'replace' | 'copy' | 'cancel'.
   */
  function chooseImportMode(payload, targetLocked, targetName) {
    if (extractLocked(payload) !== targetLocked) {
      return 'copy';
    }
    var confirmed = window.confirm('Заменить схему «' + targetName + '» содержимым файла?');
    return confirmed ? 'replace' : 'cancel';
  }

  // Регистрирует payload как новую схему и делает её активной, предварительно
  // сохранив исходящую схему. Возвращает Promise<id новой схемы>.
  function addAsNewScheme(payload) {
    return flush().then(function () {
      return createSchemeRecord(generateSchemeId(), payload);
    });
  }

  /**
   * Загрузка файла кнопкой "Загрузить из файла" (вкладка СХЕМА) поверх
   * АКТИВНОЙ схемы — по правилу chooseImportMode: замена на месте либо копия,
   * которая становится активной и загружается в Model. При ошибке
   * структуры/парсинга показывает alert и НЕ трогает текущее состояние.
   * onSuccess() вызывается после того, как Model содержит загруженную схему.
   */
  function importJSON(file, onSuccess) {
    if (!file) {
      return;
    }

    var reader = new FileReader();
    reader.onload = function (event) {
      var payload = parseSchemeFile(event.target.result);
      if (!payload) {
        return;
      }

      var activeId = getActiveId();
      var mode = chooseImportMode(payload, currentLocked, getSchemeName(activeId));
      if (mode === 'cancel') {
        return;
      }
      var done = function () {
        if (typeof onSuccess === 'function') {
          onSuccess();
        }
      };
      if (mode === 'copy') {
        addAsNewScheme(payload).then(loadScheme).then(done);
        return;
      }
      Model.setState({ rootId: payload.rootId, nodes: payload.nodes });
      currentPan = extractPan(payload);
      currentLocked = extractLocked(payload);
      saveImmediate().then(done);
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
      var payload = parseSchemeFile(event.target.result);
      if (!payload) {
        return;
      }

      addAsNewScheme(payload).then(function (id) {
        if (typeof onSuccess === 'function') {
          onSuccess(id);
        }
      });
    };
    reader.onerror = function () {
      alert('Ошибка чтения файла.');
    };
    reader.readAsText(file);
  }

  // Регистрирует payload как новую схему и делает её активной (одна транзакция).
  function createSchemeRecord(id, payload) {
    var now = Date.now();
    return openDb().then(function (db) {
      var idx = indexCache || { version: 1, activeId: null, schemes: [] };
      idx.schemes.push({ id: id, modifiedAt: now, savedAt: now });
      idx.activeId = id;
      return runTx(db, [SCHEMES_STORE, META_STORE], 'readwrite', function (tx) {
        tx.objectStore(SCHEMES_STORE).put({ id: id, payload: payload });
        tx.objectStore(META_STORE).put({
          key: INDEX_RECORD_KEY,
          version: idx.version,
          activeId: idx.activeId,
          schemes: idx.schemes
        });
      }).then(function () {
        indexCache = idx;
        cacheName(id, payload);
        return id;
      });
    }).catch(function (e) {
      handleWriteError(e, 'новую схему');
      throw e;
    });
  }

  /**
   * Создаёт новую схему ИЗ ТЕКУЩЕГО состояния Model — вызывающий код сам
   * готовит нужное состояние (обычно Model.initEmpty() непосредственно перед
   * вызовом). Регистрирует её в индексе, делает активной. Возвращает Promise
   * с id схемы.
   */
  function createScheme() {
    currentPan = null; // новая схема всегда без сохранённой позиции панорамирования
    currentLocked = false; // и без флага «только для чтения»
    return createSchemeRecord(generateSchemeId(), buildPayload());
  }

  // Загружает payload схемы id в Model и обновляет кэши (pan и имя). НЕ трогает
  // активную схему — это забота вызывающего (см. switchScheme/loadScheme).
  function applyScheme(db, id) {
    return readSchemeRecord(db, id).then(function (payload) {
      if (!payload) {
        return false;
      }
      Model.setState({ rootId: payload.rootId, nodes: payload.nodes });
      currentPan = extractPan(payload);
      currentLocked = extractLocked(payload);
      cacheName(id, payload);
      return true;
    });
  }

  // Загружает схему id в Model. Возвращает Promise<boolean>.
  function loadScheme(id) {
    return openDb().then(function (db) {
      return applyScheme(db, id);
    });
  }

  // Переключение на другую схему: сначала flush'ит исходящую схему (иначе
  // последние ~400мс несохранённых правок из-за debounce потерялись бы),
  // затем загружает выбранную схему и делает её активной. Возвращает
  // Promise<boolean>.
  function switchScheme(id) {
    return flush().then(function () {
      return openDb();
    }).then(function (db) {
      return applyScheme(db, id).then(function (ok) {
        if (!ok) {
          return false;
        }
        var idx = indexCache;
        if (idx) {
          idx.activeId = id;
        }
        return writeIndexRecord(db, idx).then(function () {
          return true;
        });
      });
    }).catch(function (e) {
      handleWriteError(e, 'переключение схемы');
      return false;
    });
  }

  function getActiveId() {
    return (indexCache && indexCache.activeId) || null;
  }

  // Имя схемы = live text её корневого узла. Для НЕактивных схем берётся из
  // кэша имён (nameCache, наполняется при загрузке/сохранении схемы).
  function getSchemeName(id) {
    if (nameCache[id]) {
      return nameCache[id];
    }
    var idx = indexCache;
    if (idx && idx.activeId === id) {
      var root = Model.getRoot();
      return (root && root.text) || 'Без названия';
    }
    return 'Без названия';
  }

  // Список всех схем для панели "ФАЙЛ". Для активной схемы имя читается
  // напрямую из Model (in-memory) — там оно гарантированно актуально, даже
  // если автосохранение (debounce) ещё не долетело до базы; для остальных
  // схем — из кэша имён (getSchemeName). locked — из кэша флагов, для активной
  // схемы точнее currentLocked.
  function listSchemes() {
    var idx = indexCache;
    if (!idx) {
      return [];
    }
    var activeId = idx.activeId;
    var result = [];
    for (var i = 0; i < idx.schemes.length; i++) {
      var entry = idx.schemes[i];
      var isActive = entry.id === activeId;
      result.push({
        id: entry.id,
        name: getSchemeName(entry.id),
        modifiedAt: entry.modifiedAt,
        savedAt: entry.savedAt,
        isActive: isActive,
        locked: isActive ? currentLocked : !!lockedCache[entry.id]
      });
    }
    return result;
  }

  /**
   * Удаляет схему id целиком (payload + запись в индексе). НЕ трогает
   * Model/активную схему напрямую (как и importAsNewScheme — Storage
   * остаётся чистым слоем хранения) — вызывающий код (действие file_delete
   * в filesPanel.js) сам решает, что делать дальше, по возвращаемому значению
   * (Promise):
   *   { deleted: boolean, wasActive: boolean, newActiveId: string|null }
   * Если wasActive=true и newActiveId задан — вызывающий должен
   * Storage.loadScheme(newActiveId) + Undo.reset() + Render.renderAll().
   * Если wasActive=true и newActiveId=null — схем больше не осталось,
   * вызывающий должен создать новую (Model.initEmpty() + Storage.createScheme()),
   * как при полностью пустом хранилище (см. init()).
   */
  function deleteScheme(id) {
    var idx = indexCache;
    if (!idx) {
      return Promise.resolve({ deleted: false, wasActive: false, newActiveId: null });
    }
    var entryIndex = -1;
    for (var i = 0; i < idx.schemes.length; i++) {
      if (idx.schemes[i].id === id) { entryIndex = i; break; }
    }
    if (entryIndex === -1) {
      return Promise.resolve({ deleted: false, wasActive: false, newActiveId: null });
    }

    var wasActive = idx.activeId === id;
    idx.schemes.splice(entryIndex, 1);
    var newActiveId = idx.activeId;
    if (wasActive) {
      newActiveId = idx.schemes.length > 0 ? idx.schemes[0].id : null;
      idx.activeId = newActiveId;
    }
    delete nameCache[id];
    delete lockedCache[id];

    // Удаление payload и записи индекса — одной транзакцией, чтобы не
    // оставить «схему-призрак» в индексе при сбое.
    return openDb().then(function (db) {
      return runTx(db, [SCHEMES_STORE, META_STORE], 'readwrite', function (tx) {
        tx.objectStore(SCHEMES_STORE).delete(id);
        tx.objectStore(META_STORE).put({
          key: INDEX_RECORD_KEY,
          version: idx.version,
          activeId: idx.activeId,
          schemes: idx.schemes
        });
      });
    }).then(function () {
      return { deleted: true, wasActive: wasActive, newActiveId: newActiveId };
    }).catch(function (e) {
      handleWriteError(e, 'удаление схемы');
      return { deleted: false, wasActive: false, newActiveId: null };
    });
  }

  /**
   * Импорт JSON из файла В СУЩЕСТВУЮЩУЮ схему id (перезаписывает именно
   * ЕЁ payload, НЕ обязательно активную — в отличие от importJSON, который
   * всегда перезаписывает активную). Используется меню "ещё действия" у
   * карточки схемы (см. действие file_import_json в filesPanel.js) — там
   * можно выбрать импорт в ЛЮБУЮ карточку, не только в открытую сейчас.
   * НЕ трогает Model напрямую (та же асимметрия, что и у importAsNewScheme/
   * deleteScheme) — если id совпадает с активной схемой, вызывающий код сам
   * обязан Storage.loadScheme(id) + Undo.reset() + Render.renderAll(), иначе
   * canvas будет показывать устаревшее содержимое. Замена или копия — по
   * правилу chooseImportMode; копия становится активной схемой. При ошибке —
   * alert, ничего не меняется. onSuccess(resultId) получает id схемы, куда
   * записан файл: id (замена) или id новой копии.
   */
  function importIntoScheme(id, file, onSuccess) {
    if (!file) {
      return;
    }

    var reader = new FileReader();
    reader.onload = function (event) {
      var payload = parseSchemeFile(event.target.result);
      if (!payload) {
        return;
      }

      openDb().then(function (db) {
        return readSchemeRecord(db, id).then(function (target) {
          var mode = chooseImportMode(payload, extractLocked(target), getSchemeName(id));
          if (mode === 'cancel') {
            return;
          }
          if (mode === 'copy') {
            return addAsNewScheme(payload).then(function (newId) {
              if (typeof onSuccess === 'function') {
                onSuccess(newId);
              }
            });
          }
          return persistScheme(db, id, payload, function (cache) {
            var entry = findSchemeEntry(cache, id);
            if (entry) {
              entry.modifiedAt = Date.now();
            }
          }).then(function () {
            cacheName(id, payload);
            if (typeof onSuccess === 'function') {
              onSuccess(id);
            }
          });
        });
      }).catch(function (e) {
        handleWriteError(e, 'схему');
      });
    };
    reader.onerror = function () {
      alert('Ошибка чтения файла.');
    };
    reader.readAsText(file);
  }

  /* ======================== Квота и persistence =========================== */

  /**
   * Просит браузер не вытеснять данные при нехватке места
   * (navigator.storage.persist). Для установленного PWA браузер даёт
   * «постоянное» хранилище без запроса к пользователю; на обычной странице
   * решение принимает эвристика браузера. Ошибки игнорируются — отсутствие
   * persistence не мешает работе. Возвращает Promise<boolean>.
   */
  function requestPersistence() {
    if (!navigator.storage || typeof navigator.storage.persist !== 'function') {
      return Promise.resolve(false);
    }
    return navigator.storage.persisted().then(function (already) {
      if (already) {
        return true;
      }
      return navigator.storage.persist();
    }).catch(function () {
      return false;
    });
  }

  /**
   * Сведения о хранилище для индикатора в панели ФАЙЛ: занятое место,
   * квота (доля свободного диска, которую браузер отдаёт origin'у) и флаг
   * «постоянного» хранилища. navigator.storage недоступен на file:// —
   * тогда вернёт hasApi:false, и вызывающий покажет заглушку.
   * Возвращает Promise<{hasApi, usage, quota, persisted, supported}>.
   */
  function getStorageInfo() {
    var info = { hasApi: false, usage: 0, quota: 0, persisted: false, supported: !!window.indexedDB };
    if (!navigator.storage || typeof navigator.storage.estimate !== 'function') {
      return Promise.resolve(info);
    }
    info.hasApi = true;
    var estimatePromise = navigator.storage.estimate().catch(function () {
      return {};
    });
    var persistedPromise = typeof navigator.storage.persisted === 'function'
      ? navigator.storage.persisted().catch(function () { return false; })
      : Promise.resolve(false);
    return Promise.all([estimatePromise, persistedPromise]).then(function (results) {
      var estimate = results[0] || {};
      info.usage = estimate.usage || 0;
      info.quota = estimate.quota || 0;
      info.persisted = !!results[1];
      return info;
    });
  }

  return {
    init: init,
    save: save,
    saveImmediate: saveImmediate,
    flush: flush,
    exportJSON: exportJSON,
    exportLocked: exportLocked,
    getLocked: getLocked,
    importJSON: importJSON,
    importAsNewScheme: importAsNewScheme,
    importIntoScheme: importIntoScheme,
    loadScheme: loadScheme,
    switchScheme: switchScheme,
    createScheme: createScheme,
    deleteScheme: deleteScheme,
    getActiveId: getActiveId,
    getSchemeName: getSchemeName,
    listSchemes: listSchemes,
    setPan: setPan,
    getPan: getPan,
    requestPersistence: requestPersistence,
    getStorageInfo: getStorageInfo
  };
})();
