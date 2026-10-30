/*
 * ribbonConfig.js — декларативное описание содержимого ribbon-тулбара:
 * вкладки, группы, кнопки. ЧИСТЫЕ ДАННЫЕ, без логики отображения (см.
 * ribbonRenderer.js — он рендерит DOM по этой структуре; десктопный
 * рендерер сейчас единственный, но формат данных не завязан на конкретный
 * способ отображения — в будущем по тому же RibbonConfig можно построить и
 * мобильный рендерер).
 *
 * Имя/иконка кнопок здесь не хранятся — content-элементы ссылаются на
 * действие по id (поле action), а имя/иконку резолвит ribbonRenderer.js
 * через общий реестр действий (см. getAction() в actions.js). Определения
 * всплывающих меню (панель ФАЙЛ) вынесены в отдельный файл popups.js — он
 * читает тот же реестр действий, но не зависит от RibbonConfig и наоборот.
 *
 * Обычный <script> (НЕ fetch отдельного .json) — при открытии приложения
 * через file:// локальные JSON-файлы недоступны через сетевые запросы
 * (каждый file://-URL браузер трактует как отдельный origin).
 *
 * Поля элемента content:
 *   type   — 'button' (обычная ribbon-кнопка, 100x98px) или
 *            'smallbutton' (компактная кнопка 30px высотой; идущие подряд
 *            smallbutton внутри одной группы автоматически группируются
 *            рендерером в колонки максимум по 3 штуки).
 *   id     — DOM id создаваемой кнопки; ДОЛЖЕН совпадать с id, которые
 *            ожидает app.js (document.getElementById(id).addEventListener(...)) —
 *            это ключевой приём интеграции: вся существующая логика
 *            обработчиков продолжает работать без изменений, т.к. не знает,
 *            что кнопки теперь создаются динамически. Это ОТДЕЛЬНЫЙ от
 *            action id идентификатор: одно действие (например
 *            theme_toggle) может стоять за НЕСКОЛЬКИМИ кнопками в разных
 *            вкладках, и у каждой — свой уникальный DOM id (см. btn-theme/
 *            btn-theme-tools ниже — раньше у них был ОДИН И ТОТ ЖЕ id
 *            'btn-theme', что было ошибкой: document.getElementById
 *            находит только первый элемент, поэтому кнопка "Тема" во
 *            вкладке ИНСТРУМЕНТЫ была нерабочей "мёртвой кнопкой").
 *   action — id действия из реестра Actions (actions.js) — имя и иконка
 *            кнопки берутся оттуда (см. getAction() в ribbonRenderer.js).
 *
 * Поле вкладки (элемента tabs):
 *   nonSwitching — (опционально, true) вкладка НЕ переключает контент
 *            ribbon'а по клику (ribbonRenderer.js не вызывает activateTab
 *            для неё и не делает её вкладкой по умолчанию при инициализации)
 *            — вместо этого клик по ней просто получает собственный
 *            обработчик снаружи (см. app.js: панель "ФАЙЛ", filesPanel.js).
 *            groups при этом может быть пустым массивом — контент-панель
 *            такой вкладки никогда не показывается.
 */
var RibbonConfig = {
  tabs: [
    {
      name: 'ФАЙЛ',
      nonSwitching: true,
      groups: []
    },
    {
      name: 'РЕДАКТИРОВАНИЕ',
      groups: [
        {
          name: 'Добавить',
          content: [
            { type: 'button', id: 'btn-add-node', action: 'node_add_text' },
            { type: 'button', id: 'btn-add-test', action: 'node_add_test' },
            { type: 'button', id: 'btn-add-link', action: 'node_add_link' }
          ]
        },
         {
          name: 'Действия',
          content: [
            { type: 'button', id: 'btn-remove-node', action: 'node_remove' }
          ]
        },
        {
          // 6 smallbutton подряд -> ribbonRenderer.js группирует их в 2
          // колонки по 3 (см. SMALL_GROUP_SIZE в ribbonRenderer.js).
          name: 'Цвета',
          content: [
            { type: 'button', id: 'btn-mark-node', action: 'node_mark' },
            { type: 'smallbutton', id: 'btn-color-yellow', action: 'node_color_yellow' },
            { type: 'smallbutton', id: 'btn-color-gray', action: 'node_color_gray' },
            { type: 'smallbutton', id: 'btn-color-green', action: 'node_color_green' },
            { type: 'smallbutton', id: 'btn-color-pink', action: 'node_color_pink' },
            { type: 'smallbutton', id: 'btn-color-blue', action: 'node_color_blue' },
            { type: 'smallbutton', id: 'btn-color-reset', action: 'node_color_reset' }
          ]
        },
		{
            name: 'Вид',
            content: [
               { type: 'button', id: 'btn-notes', action: 'notes_panel' }
            ]
        }
      ]
    },
    {
       name: 'СХЕМА',
       groups: [
         {
           name: 'Схема',
           content: [
             { type: 'button', id: 'btn-import', action: 'scheme_import' },
             { type: 'button', id: 'btn-export', action: 'scheme_export' },
             { type: 'button', id: 'btn-clear-scheme', action: 'scheme_clear' }
           ]
         }
       ]
     },
    {
      name: 'ВИД',
      groups: [
        {
          name: 'Показать',
          content: [
            { type: 'button', id: 'btn-help-docs', action: 'help_docs' },
            { type: 'button', id: 'btn-notes', action: 'notes_panel' },
          ]
        },
        {
          name: 'Инструменты',
          content: [
            { type: 'button', id: 'btn-theme', action: 'theme_toggle' }
          ]
        }
      ]
    }
  ]
};
