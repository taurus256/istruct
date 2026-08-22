/*
 * test.js — прохождение тестов в боковой панели (вью #test-view внутри #side-panel).
 *
 * Показывается координатором (app.js), когда открыта боковая панель и выделен
 * узел типа 'test'. Отвечает за 4 экрана и логику попытки:
 *   - «нет теста»      — у узла нет data.test;
 *   - «результат»      — есть data.test и сохранённый data.testResult (последняя попытка);
 *   - «старт/intro»    — есть data.test, результата нет;
 *   - «вопрос»         — во время активной попытки.
 *
 * Определение теста (data.test) и результат (data.testResult) — см. model.js / storage.js.
 * Промежуточное состояние попытки НЕ сохраняется в модель: результат пишется
 * ТОЛЬКО при завершении (finish) или прерывании (abort).
 *
 * Не использует ES-модули — открывается через file:// обычным <script>.
 */

var TestPanel = (function () {
  var viewEl = null;         // #test-view

  // Текущий показываемый узел (не обязательно с активной попыткой).
  var currentNodeId = null;

  // Состояние активной попытки (в памяти). startTime != null → попытка идёт.
  var attempt = null; // { nodeId, test, questions, answers:{qid:Set}, index, startTime }

  // Координатор просит закрыть панель (кнопка ✕ в шапке вью).
  var onCloseRequest = null;
  function setOnCloseRequest(fn) {
    onCloseRequest = (typeof fn === 'function') ? fn : null;
  }

  /* ============================ Инициализация ============================ */

  function init() {
    viewEl = document.getElementById('test-view');
    // Делегирование кликов внутри вью — единый обработчик по data-action.
    if (viewEl) {
      viewEl.addEventListener('click', onViewClick);
    }
  }

  /* ============================ Показ вью ================================ */

  // Вызывается координатором при показе тест-вью для узла id.
  function show(nodeId) {
    // Если переключились на другой узел во время активной попытки — прерывание.
    if (attempt && attempt.nodeId !== nodeId) {
      abortIfActive();
    }
    currentNodeId = nodeId;

    if (nodeId == null || !Model.getNode(nodeId)) {
      renderEmpty(null);
      return;
    }

    // Если для этого узла уже идёт попытка — продолжаем показывать вопрос.
    if (attempt && attempt.nodeId === nodeId) {
      renderQuestion();
      return;
    }

    if (!Model.hasTest(nodeId)) {
      renderEmpty(nodeId);
      return;
    }

    var result = Model.getTestResult(nodeId);
    if (result) {
      renderResult(nodeId, result);
    } else {
      renderIntro(nodeId);
    }
  }

  // Прерывание активной попытки: посчитать промежуточный результат, сохранить
  // со status='aborted'. Вызывается координатором перед закрытием панели или
  // сменой узла. Безопасно вызывать всегда — no-op, если попытки нет.
  function abortIfActive() {
    if (!attempt || attempt.startTime == null) {
      return;
    }
    finalize('aborted');
  }

  /* ======================= Заголовок узла / утилиты ===================== */

  function nodeTitle(nodeId) {
    var test = Model.getTest(nodeId);
    if (test && test.title) {
      return test.title;
    }
    var node = Model.getNode(nodeId);
    return node ? node.text : '';
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function md(s) {
    return (typeof Markdown !== 'undefined') ? Markdown.toHtml(s) : esc(s);
  }

  function mdInline(s) {
    // Для вариантов/коротких строк: рендерим Markdown, но убираем внешний <p>,
    // чтобы текст оставался инлайновым внутри карточки варианта.
    var html = md(s);
    return html.replace(/^<p>/, '').replace(/<\/p>$/, '');
  }

  // Русское склонение слова «вопрос» по числу: 1 вопрос, 2 вопроса, 5 вопросов.
  function pluralQuestions(n) {
    var d = n % 10;
    var dd = n % 100;
    var word = (d === 1 && dd !== 11) ? 'вопрос'
      : (d >= 2 && d <= 4 && (dd < 10 || dd >= 20)) ? 'вопроса'
      : 'вопросов';
    return n + ' ' + word;
  }

  // Общая шапка вью: зелёный глиф >?, заголовок, кнопка закрытия.
  function headerHtml(title) {
    return '' +
      '<div class="side-view__header">' +
        '<span class="side-view__glyph">&gt;?</span>' +
        '<span class="side-view__title">' + esc(title) + '</span>' +
        '<button type="button" class="side-view__close" data-action="close" title="Закрыть панель">✕</button>' +
      '</div>';
  }

  /* ============================ Экран «нет теста» ======================= */

  function renderEmpty(nodeId) {
    var title = (nodeId != null) ? nodeTitle(nodeId) : '';
    viewEl.innerHTML =
      headerHtml('Тест') +
      '<div class="test-body">' +
        '<div class="test-node-title">' + esc(title) + '</div>' +
        '<div class="test-divider"></div>' +
        '<div class="test-empty">Тест отсутствует</div>' +
      '</div>';
  }

  /* ============================ Экран «старт» =========================== */

  function estimatedMinutes(test) {
    if (test.estimatedMinutes != null && !isNaN(test.estimatedMinutes)) {
      return test.estimatedMinutes;
    }
    return Math.max(1, Math.round(test.questions.length * 1.5));
  }

  function renderIntro(nodeId) {
    var test = Model.getTest(nodeId);
    var n = test.questions.length;
    var mins = estimatedMinutes(test);
    var threshold = test.passThreshold;

    viewEl.innerHTML =
      headerHtml('Тест') +
      '<div class="test-body">' +
        '<div class="test-node-title">' + esc(nodeTitle(nodeId)) + '</div>' +
        '<div class="test-divider"></div>' +
        (test.description
          ? '<div class="test-desc">' + md(test.description) + '</div>'
          : '') +
        '<div class="test-info-cards">' +
          infoCard('list', pluralQuestions(n)) +
          infoCard('clock', '~' + mins + ' минут') +
          infoCard('check', threshold + '% нужно набрать') +
        '</div>' +
      '</div>' +
      '<div class="test-footer">' +
        '<button type="button" class="test-btn test-btn--primary" data-action="start">Начать тест</button>' +
      '</div>';
  }

  function infoCard(icon, text) {
    var glyph = icon === 'list' ? '<span class="test-info-card__glyph">1.<br>2.</span>'
      : icon === 'clock' ? '<span class="test-info-card__glyph">◷</span>'
      : '<span class="test-info-card__glyph">✓</span>';
    return '<div class="test-info-card">' + glyph +
      '<span class="test-info-card__text">' + esc(text) + '</span></div>';
  }

  /* ============================ Экран «вопрос» ========================== */

  function startAttempt(nodeId) {
    var test = Model.getTest(nodeId);
    var answers = {};
    test.questions.forEach(function (q) {
      answers[q.id] = {};
    });
    attempt = {
      nodeId: nodeId,
      test: test,
      questions: test.questions,
      answers: answers,     // qid -> map(optionId -> true)
      index: 0,
      startTime: Date.now()
    };
    renderQuestion();
  }

  function renderQuestion() {
    var q = attempt.questions[attempt.index];
    var total = attempt.questions.length;
    var num = attempt.index + 1;
    var progress = Math.round((num / total) * 100);
    var selected = attempt.answers[q.id] || {};

    var optionsHtml = q.options.map(function (opt) {
      var isSel = !!selected[opt.id];
      var boxClass = q.multiple ? 'test-choice__box--check' : 'test-choice__box--radio';
      return '' +
        '<label class="test-choice' + (isSel ? ' test-choice--selected' : '') + '" data-opt="' + esc(opt.id) + '">' +
          '<span class="test-choice__box ' + boxClass + (isSel ? ' test-choice__box--on' : '') + '"></span>' +
          '<span class="test-choice__text">' + mdInline(opt.text) + '</span>' +
        '</label>';
    }).join('');

    viewEl.innerHTML =
      headerHtml('Тест') +
      '<div class="test-body">' +
        '<div class="test-node-title test-node-title--upper">' + esc(nodeTitle(attempt.nodeId)) + '</div>' +
        '<div class="test-nav">' +
          '<button type="button" class="test-nav__btn" data-action="prev"' + (num === 1 ? ' disabled' : '') + '>‹</button>' +
          '<span class="test-nav__label">Вопрос ' + num + ' из ' + total + '</span>' +
          '<button type="button" class="test-nav__btn" data-action="next"' + (num === total ? ' disabled' : '') + '>›</button>' +
        '</div>' +
        '<div class="test-progress"><div class="test-progress__bar" style="width:' + progress + '%"></div></div>' +
        '<div class="test-question-card">' + md(q.text) + '</div>' +
        '<div class="test-choices">' + optionsHtml + '</div>' +
      '</div>' +
      '<div class="test-footer">' +
        '<button type="button" class="test-btn test-btn--primary" data-action="submit">Ответить</button>' +
        '<button type="button" class="test-link" data-action="finish">Завершить тест</button>' +
      '</div>';
  }

  // Переключение выбора варианта. Для single-выбора — заменяем; для multiple — тогл.
  function toggleOption(optId) {
    var q = attempt.questions[attempt.index];
    var sel = attempt.answers[q.id];
    if (q.multiple) {
      if (sel[optId]) { delete sel[optId]; } else { sel[optId] = true; }
    } else {
      var was = !!sel[optId];
      // radio: очищаем и ставим один (повторный клик снимает выбор).
      attempt.answers[q.id] = {};
      if (!was) { attempt.answers[q.id][optId] = true; }
    }
    renderQuestion();
  }

  /* =========================== Подсчёт / финал ========================== */

  // Верно ли отвечен вопрос: множество выбранных == множество correct-вариантов.
  function isQuestionCorrect(q, selMap) {
    var selected = Object.keys(selMap || {});
    var correct = q.options.filter(function (o) { return o.correct; })
      .map(function (o) { return o.id; });
    if (selected.length !== correct.length) {
      return false;
    }
    for (var i = 0; i < correct.length; i++) {
      if (!selMap[correct[i]]) {
        return false;
      }
    }
    return true;
  }

  function optionTextsByIds(q, ids) {
    var texts = q.options
      .filter(function (o) { return ids.indexOf(o.id) !== -1; })
      .map(function (o) {
        return (typeof Markdown !== 'undefined') ? Markdown.toPlainText(o.text) : String(o.text);
      });
    return texts;
  }

  // Финализация попытки: посчитать результат, сохранить в модель, показать экран.
  function finalize(status) {
    var test = attempt.test;
    var questions = attempt.questions;
    var total = questions.length;
    var correctCount = 0;
    var answeredCount = 0;
    var wrong = [];

    questions.forEach(function (q, i) {
      var selMap = attempt.answers[q.id] || {};
      var selectedIds = Object.keys(selMap);
      if (selectedIds.length > 0) {
        answeredCount += 1;
      }
      if (isQuestionCorrect(q, selMap)) {
        correctCount += 1;
      } else {
        var yourTexts = optionTextsByIds(q, selectedIds);
        var correctIds = q.options.filter(function (o) { return o.correct; })
          .map(function (o) { return o.id; });
        wrong.push({
          num: i + 1, // 1-based номер вопроса — для подписи «Вопрос N:» в карточке
          questionText: (typeof Markdown !== 'undefined') ? Markdown.toPlainText(q.text) : String(q.text),
          yourText: yourTexts.length ? yourTexts.join(', ') : '—',
          correctText: optionTextsByIds(q, correctIds).join(', ')
        });
      }
    });

    var scorePercent = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    var passed = scorePercent >= test.passThreshold;
    var elapsedMs = Date.now() - attempt.startTime;

    var result = {
      completedAt: Date.now(),
      status: (status === 'aborted') ? 'aborted' : (passed ? 'passed' : 'failed'),
      correctCount: correctCount,
      answeredCount: answeredCount,
      totalCount: total,
      scorePercent: scorePercent,
      passed: passed,
      elapsedMs: elapsedMs,
      wrong: wrong
    };

    var nodeId = attempt.nodeId;
    Model.setTestResult(nodeId, result);
    Storage.save();

    // Попытка завершена.
    attempt = null;

    // Если прервали (abort) при закрытии/смене узла — вью не перерисовываем
    // насильно (панель уже уходит); отрисуем результат только если этот узел
    // всё ещё показывается.
    if (status !== 'aborted' && currentNodeId === nodeId) {
      renderResult(nodeId, result);
    }
  }

  /* ============================ Экран «результат» ======================= */

  function renderResult(nodeId, result) {
    var passed = result.passed;
    var test = Model.getTest(nodeId);
    var threshold = test ? test.passThreshold : 0;
    var mins = Math.max(1, Math.round(result.elapsedMs / 60000));

    var wrong = result.wrong || [];
    var wrongHtml = '';
    if (wrong.length > 0) {
      wrongHtml =
        '<div class="test-wrong-head">' +
          '<span class="test-wrong-head__title">Неправильные ответы</span>' +
          '<span class="test-wrong-head__count">' + pluralQuestions(wrong.length) + '</span>' +
        '</div>' +
        '<div class="test-wrong-list">' +
          wrong.map(function (w) {
            var qLabel = (w.num != null) ? ('Вопрос ' + w.num + ': ') : '';
            return '<div class="test-wrong-card">' +
              '<div class="test-wrong-card__q">' + esc(qLabel + w.questionText) + '</div>' +
              '<div class="test-wrong-card__your"><span class="test-mark test-mark--x">✕</span>' +
                'Ваш ответ: ' + esc(w.yourText) + '</div>' +
              '<div class="test-wrong-card__correct"><span class="test-mark test-mark--v">✓</span>' +
                'Правильно: ' + esc(w.correctText) + '</div>' +
            '</div>';
          }).join('') +
        '</div>';
    }

    viewEl.innerHTML =
      headerHtml('Результаты теста') +
      '<div class="test-body">' +
        '<div class="test-node-title">' + esc(nodeTitle(nodeId)) + '</div>' +
        '<div class="test-result-card ' + (passed ? 'test-result-card--pass' : 'test-result-card--fail') + '">' +
          '<div class="test-result-status">' + (passed ? 'Пройден' : 'Не пройден') + '</div>' +
          '<div class="test-result-req">Для прохождения необходимо ' + threshold + '%</div>' +
        '</div>' +
        '<div class="test-stats">' +
          statCard('Время', '~' + mins + ' мин', false) +
          statCard('Балл', result.scorePercent + '%', passed) +
          statCard('Отвечено', result.answeredCount + '/' + result.totalCount, false) +
        '</div>' +
        wrongHtml +
      '</div>' +
      '<div class="test-footer">' +
        '<button type="button" class="test-btn test-btn--primary" data-action="return">Назад</button>' +
        '<button type="button" class="test-link" data-action="retry">Пройти ещё раз</button>' +
      '</div>';
  }

  function statCard(label, value, highlight) {
    return '<div class="test-stat">' +
      '<span class="test-stat__label">' + esc(label) + '</span>' +
      '<span class="test-stat__value' + (highlight ? ' test-stat__value--pass' : '') + '">' +
        esc(value) + '</span>' +
    '</div>';
  }

  /* ============================ Обработка кликов ======================== */

  function onViewClick(e) {
    var choice = e.target.closest ? e.target.closest('.test-choice') : null;
    if (choice && attempt) {
      e.preventDefault();
      toggleOption(choice.getAttribute('data-opt'));
      return;
    }

    var actionEl = e.target.closest ? e.target.closest('[data-action]') : null;
    if (!actionEl) {
      return;
    }
    var action = actionEl.getAttribute('data-action');

    switch (action) {
      case 'close':
        if (onCloseRequest) { onCloseRequest(); }
        break;
      case 'start':
        startAttempt(currentNodeId);
        break;
      case 'prev':
        if (attempt && attempt.index > 0) { attempt.index -= 1; renderQuestion(); }
        break;
      case 'next':
        if (attempt && attempt.index < attempt.questions.length - 1) {
          attempt.index += 1; renderQuestion();
        }
        break;
      case 'submit':
        if (attempt) {
          if (attempt.index < attempt.questions.length - 1) {
            attempt.index += 1;
            renderQuestion();
          } else {
            finalize('finished'); // последний вопрос → завершение
          }
        }
        break;
      case 'finish':
        if (attempt) { finalize('finished'); } // ранний конец: неотвеченные = неверные
        break;
      case 'return':
        // Результат остаётся сохранённым; показываем стартовый экран.
        renderIntro(currentNodeId);
        break;
      case 'retry':
        startAttempt(currentNodeId);
        break;
      default:
        break;
    }
  }

  return {
    init: init,
    show: show,
    abortIfActive: abortIfActive,
    setOnCloseRequest: setOnCloseRequest
  };
})();
