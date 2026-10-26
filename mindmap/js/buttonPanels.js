/*
 * buttonPanels.js — декларативные описания панелей кнопок-действий (как
 * popups.js для всплывающих меню, но без вложенности submenu). ЧИСТЫЕ
 * ДАННЫЕ, без логики отображения — см. buttonPanel.js, он рендерит DOM по
 * этой структуре и резолвит action-ссылки через getAction() (actions.js).
 *
 * Элементы items:
 *   { type: 'primarybutton', action: <id действия из actions.js> }
 *     — главная кнопка экрана (синяя, акцентная).
 *   { type: 'button', action: <id> }
 *     — второстепенная кнопка. Конкретный визуальный вид (бордер+иконка,
 *       как в панели ФАЙЛ, или текстовая "ссылка" без фона, как внизу
 *       теста) задаётся CSS контейнера-панели (.files-panel__actions/
 *       .test-footer — см. layout.css), не самим типом пункта.
 *
 * Иконка пункта берётся из действия (action.icon) — если действие без
 * иконки (test_* ниже), кнопка рендерится текстом без иконки (см.
 * buttonPanel.js: иконка добавляется, только если она задана).
 */
var ButtonPanels = {
  // Панель ФАЙЛ (#files-panel) — см. filesPanel.js.
  files: {
    items: [
      { type: 'primarybutton', action: 'file_create_new' },
      { type: 'button', action: 'file_import_new' }
    ]
  },

  // Нижняя панель вью теста (#test-view, .test-footer) — три экрана, у
  // каждого свой набор кнопок, см. test.js.
  testIntro: {
    items: [
      { type: 'primarybutton', action: 'test_start' }
    ]
  },
  testQuestion: {
    items: [
      { type: 'primarybutton', action: 'test_submit' },
      { type: 'button', action: 'test_finish' }
    ]
  },
  testResult: {
    items: [
      { type: 'primarybutton', action: 'test_return' },
      { type: 'button', action: 'test_retry' }
    ]
  }
};
