/*
 * storageSelfTest.js — самодиагностика хранилища IndexedDB без внешнего
 * фреймворка тестирования (в проекте его нет).
 *
 * Проверка выполняется во ВРЕМЕННОЙ базе ('mindmap__selftest'), чтобы не
 * трогать рабочие данные. Запуск:
 *   1) из консоли браузера:            runStorageSelfTest()
 *   2) из headless-проверки (CI/агент):  page.evaluate(() => runStorageSelfTest())
 *
 * Возвращает Promise<{ ok, checks: [{ name, ok, detail }] }>. Ничего не
 * рендерит и ни от чего, кроме window.indexedDB, не зависит — можно грузить
 * скрипт без разметки приложения.
 */
var StorageSelfTest = (function () {
  var TEST_DB = 'mindmap__selftest';

  function openTestDb() {
    return new Promise(function (resolve, reject) {
      var request = indexedDB.open(TEST_DB, 1);
      request.onupgradeneeded = function (event) {
        var db = event.target.result;
        db.createObjectStore('meta', { keyPath: 'key' });
        db.createObjectStore('schemes', { keyPath: 'id' });
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }

  function runTx(db, stores, mode, fn) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(stores, mode);
      var result;
      tx.oncomplete = function () { resolve(result); };
      tx.onerror = function () { reject(tx.error); };
      tx.onabort = function () { reject(tx.error || new Error('aborted')); };
      result = fn(tx);
    });
  }

  function getScheme(db, id) {
    return new Promise(function (resolve, reject) {
      var request = db.transaction(['schemes'], 'readonly').objectStore('schemes').get(id);
      request.onsuccess = function () { resolve(request.result || null); };
      request.onerror = function () { reject(request.error); };
    });
  }

  // Проверяет, что payload схемы реально сохраняется и читается БЕЗ искажений
  // (включая кириллицу, вложенные объекты, markdown-заметки и escape-символы):
  // localStorage хранил только строки и требовал JSON.parse/stringify, здесь
  // объект кладётся в объектное хранилище напрямую (structured clone).
  function makePayload() {
    return {
      version: 9,
      rootId: 'n1',
      nodes: {
        n1: {
          text: 'Корень «тест»\nвторая строка',
          type: 'main',
          parentId: null,
          data: {
            note: '**жирный** <tag> & "кавычки" \u00a0 неразрывный',
            offset: { dx: 12.5, dy: -3 },
            marked: true,
            color: 'yellow'
          }
        },
        n2: {
          text: 'Узел 2',
          type: 'test',
          parentId: 'n1',
          data: {
            test: {
              title: 'Тест',
              passThreshold: 70,
              questions: [{
                id: 'q1',
                text: 'Вопрос?',
                type: 'freeform',
                expectedAnswer: 'Ответ'
              }]
            }
          }
        }
      },
      pan: { x: 120, y: -40 }
    };
  }

  function run() {
    var checks = [];
    function check(name, ok, detail) {
      checks.push({ name: name, ok: !!ok, detail: detail });
      return !!ok;
    }

    if (!window.indexedDB) {
      return Promise.resolve({
        ok: false,
        checks: [{ name: 'IndexedDB доступен', ok: false, detail: 'window.indexedDB отсутствует' }]
      });
    }

    var db;
    var payload = makePayload();

    return openTestDb().then(function (opened) {
      db = opened;
      check('База открывается', true, 'stores: ' + Array.prototype.join.call(db.objectStoreNames, ', '));

      return runTx(db, ['schemes'], 'readwrite', function (tx) {
        tx.objectStore('schemes').put({ id: 's1', payload: payload });
      }).then(function () {
        check('Запись схемы', true);
        return getScheme(db, 's1');
      });
    }).then(function (record) {
      var stored = record && record.payload;
      check('Чтение схемы', !!stored);
      // Сравнение по сериализованному виду: IndexedDB сохраняет типы, но
      // порядок ключей у structured clone может отличаться.
      check('Payload не искажён (кириллица, вложенность, pan)',
        JSON.stringify(stored) === JSON.stringify(payload),
        stored ? 'rootId=' + stored.rootId + ', узлов=' + Object.keys(stored.nodes).length : 'нет данных');
      check('Вложенный markdown-текст сохранён', !!stored && stored.nodes.n1.data.note === payload.nodes.n1.data.note);

      // Транзакция — единица атомарности: ошибка внутри не должна оставить
      // частичных изменений (это то, чего не было у двух записей localStorage).
      return runTx(db, ['schemes'], 'readwrite', function (tx) {
        tx.objectStore('schemes').put({ id: 's2', payload: payload });
        tx.objectStore('schemes').put({ id: 's3', payload: payload });
        tx.abort();
      }).then(function () {
        check('Прерванная транзакция откатывается', false, 'транзакция неожиданно завершилась');
      }).catch(function () {
        return getScheme(db, 's2').then(function (r) {
          check('Прерванная транзакция откатывается', r === null, 's2 после abort: ' + (r ? 'есть' : 'нет'));
        });
      });
    }).then(function () {
      return getScheme(db, 'missing-id').then(function (r) {
        check('Отсутствующая схема → null', r === null);
      });
    }).then(function () {
      // Очистка временной базы.
      var closeResult = new Promise(function (resolve) {
        db.close();
        var del = indexedDB.deleteDatabase(TEST_DB);
        del.onsuccess = function () { resolve(); };
        del.onerror = function () { resolve(); };
        del.onblocked = function () { resolve(); };
      });
      return closeResult.then(function () {
        return {
          ok: checks.every(function (c) { return c.ok; }),
          checks: checks
        };
      });
    }).catch(function (e) {
      checks.push({ name: 'Исключение при проверке', ok: false, detail: String(e && (e.message || e.name || e)) });
      return { ok: false, checks: checks };
    });
  }

  return { run: run };
})();
