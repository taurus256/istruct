/*
 * lockPack.js — обфускация файла «Экспортировать курс» (см. Storage.exportLocked).
 * Цель — затруднить учащемуся ручную правку схемы и правильных ответов тестов,
 * а НЕ криптостойкая защита: приложение разворачивает файл без участия
 * пользователя, поэтому весь алгоритм лежит в открытом JS. Изменить файл
 * можно, но только написав код, а не поправив пару символов в редакторе.
 *
 * Файл — конверт { "format": "istruct-locked", "v": 1, "salt": "...", "data": "<base64>" }.
 * В нём нет полей version/rootId/nodes, поэтому Storage.isValidPayload его
 * не принимает, и импорт отдельно разворачивает его через unpack().
 *
 * data = base64( контрольная сумма (8 hex) + байты UTF-8 JSON, перемешанные
 * XOR'ом с потоком из ключа и кольцевым сдвигом ). Ключ выводится из случайной
 * соли конверта: файл не зависит ни от браузера, ни от id схемы, ни от имени
 * файла, а одинаковые схемы дают разные файлы. Контрольная сумма считается
 * по исходному JSON с тем же ключом: правка любого байта — «файл повреждён».
 */
var LockPack = (function () {
  var FORMAT = 'istruct-locked';
  var VERSION = 1;
  var SECRET = 'istruct:course:v1';
  var SUM_LENGTH = 8;

  // FNV-1a (32 бита); умножение на 16777619 разложено на сдвиги, чтобы не
  // терять точность за пределами 2^53.
  function fnv1a(str, seed) {
    var h = seed >>> 0;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
    }
    return h >>> 0;
  }

  function keyFromSalt(salt) {
    return fnv1a(SECRET + '|' + salt, 0x811c9dc5);
  }

  function checksum(json, key) {
    return ('0000000' + fnv1a(json, (key ^ 0x27d4eb2f) >>> 0).toString(16)).slice(-SUM_LENGTH);
  }

  function randomSalt() {
    var bytes = new Uint8Array(8);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
    } else {
      for (var i = 0; i < bytes.length; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
    var out = '';
    for (var j = 0; j < bytes.length; j++) {
      out += ('0' + bytes[j].toString(16)).slice(-2);
    }
    return out;
  }

  // Перемешивание байтовой строки: XOR с потоком из ключа + кольцевой сдвиг байта.
  // inverse=true снимает преобразование.
  function mix(str, key, inverse) {
    var out = '';
    var k = key >>> 0;
    for (var i = 0; i < str.length; i++) {
      k = (k + 0x9e3779b1) >>> 0;
      var mask = (k ^ (k >>> 15)) & 0xff;
      var rot = (k >>> 8) & 7;
      var b = str.charCodeAt(i) & 0xff;
      var v;
      if (inverse) {
        v = (((b >> rot) | (b << (8 - rot))) & 0xff) ^ mask;
      } else {
        b ^= mask;
        v = ((b << rot) | (b >> (8 - rot))) & 0xff;
      }
      out += String.fromCharCode(v);
    }
    return out;
  }

  /** Упаковывает payload схемы в объект-конверт для записи в файл. */
  function pack(payload) {
    var json = JSON.stringify(payload);
    var salt = randomSalt();
    var key = keyFromSalt(salt);
    var utf8 = unescape(encodeURIComponent(json));
    return {
      format: FORMAT,
      v: VERSION,
      salt: salt,
      data: btoa(checksum(json, key) + mix(utf8, key, false))
    };
  }

  /**
   * Разворачивает конверт: { ok: true, payload } или { ok: false, reason },
   * где reason годится для alert(). Структуру payload'а проверяет вызывающий
   * (Storage.isValidPayload).
   */
  function unpack(container) {
    if (!isPacked(container) || typeof container.data !== 'string' || typeof container.salt !== 'string') {
      return { ok: false, reason: 'Файл не является схемой курса.' };
    }
    if (container.v !== VERSION) {
      return { ok: false, reason: 'Версия формата схемы курса не поддерживается: ' + container.v + '.' };
    }
    var raw;
    try {
      raw = atob(container.data);
    } catch (e) {
      return { ok: false, reason: 'Файл повреждён.' };
    }
    if (raw.length <= SUM_LENGTH) {
      return { ok: false, reason: 'Файл повреждён.' };
    }
    var key = keyFromSalt(container.salt);
    var json;
    try {
      json = decodeURIComponent(escape(mix(raw.slice(SUM_LENGTH), key, true)));
    } catch (e) {
      return { ok: false, reason: 'Файл повреждён или был изменён.' };
    }
    if (checksum(json, key) !== raw.slice(0, SUM_LENGTH)) {
      return { ok: false, reason: 'Файл повреждён или был изменён.' };
    }
    try {
      return { ok: true, payload: JSON.parse(json) };
    } catch (e) {
      return { ok: false, reason: 'Файл повреждён.' };
    }
  }

  // true, если распарсенный JSON — конверт схемы курса.
  function isPacked(obj) {
    return !!obj && typeof obj === 'object' && obj.format === FORMAT;
  }

  return {
    pack: pack,
    unpack: unpack,
    isPacked: isPacked
  };
})();
