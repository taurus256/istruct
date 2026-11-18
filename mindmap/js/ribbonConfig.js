/*
 * ribbonConfig.js — декларативное описание содержимого ribbon-тулбара:
 * вкладки, группы, кнопки. ЧИСТЫЕ ДАННЫЕ, без логики отображения (см.
 * ribbonRenderer.js — он рендерит DOM по этой структуре; десктопный
 * рендерер сейчас единственный, но формат данных не завязан на конкретный
 * способ отображения — в будущем по тому же RibbonConfig можно построить и
 * мобильный рендерер).
 *
 * Имя/иконка кнопок здесь не хранятся — каждый элемент ссылается на действие
 * (поле action), а имя/иконку резолвит ribbonRenderer.js через общий реестр
 * действий (см. getAction() в actions.js). Поведение по клику — тоже по
 * действию, а не по DOM id: кнопка получает data-action = item.action, а
 * клик уходит в ActionManager.run(action) (тот же принцип, что у меню и панелей).
 *
 * Видимость в режиме «только для чтения» здесь не задаётся: кнопка
 * скрывается, если у её действия нет lockedAvailable (actions.js), а группа и
 * вкладка — если в них не осталось видимых кнопок (ribbonRenderer.js).
 * Поэтому здесь НЕТ поля id — как и в popups.js/buttonPanels.js: раскладку
 * тулбара можно менять (переносить/дублировать кнопки, добавлять новые с уже
 * существующим действием) без правок JS.
 *
 * Определения всплывающих меню (панель ФАЙЛ) вынесены в отдельный файл
 * popups.js — он читает тот же реестр действий, но не зависит от
 * RibbonConfig и наоборот.
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
 *   action — id действия из реестра Actions (actions.js) — ЕДИНСТВЕННОЕ
 *            обязательное поле, кроме type: оттуда берутся имя, иконка и
 *            обработчик. Одно и то же действие может стоять за НЕСКОЛЬКИМИ
 *            кнопками в разных вкладках (например notes_panel — в
 *            РЕДАКТИРОВАНИЕ/Вид и в ВИД/Показать): это нормально, каждая
 *            кнопка получит свой data-action, а состояние подсветки и клик
 *            обрабатываются по действию сразу для всех кнопок.
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
            { type: 'button', action: 'node_add_text' },
            { type: 'button', action: 'node_add_test' },
            { type: 'button', action: 'node_add_link' }
          ]
        },
        {
          name: 'Действия',
          content: [
            { type: 'button', action: 'node_remove' }
          ]
        },
        {
          // 6 smallbutton подряд -> ribbonRenderer.js группирует их в 2
          // колонки по 3 (см. SMALL_GROUP_SIZE в ribbonRenderer.js).
          name: 'Цвета',
          content: [
            { type: 'button', action: 'node_mark' },
            { type: 'smallbutton', action: 'node_color_yellow' },
            { type: 'smallbutton', action: 'node_color_gray' },
            { type: 'smallbutton', action: 'node_color_green' },
            { type: 'smallbutton', action: 'node_color_pink' },
            { type: 'smallbutton', action: 'node_color_blue' },
            { type: 'smallbutton', action: 'node_color_reset' }
          ]
        },
        {
          name: 'Вид',
          content: [
            { type: 'button', action: 'notes_panel' },
            { type: 'smallbutton', action: 'help_docs' },
            { type: 'smallbutton', action: 'scheme_zoom_in' },
            { type: 'smallbutton', action: 'scheme_zoom_out' }

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
            { type: 'button', action: 'help_docs' },
            { type: 'button', action: 'notes_panel' }
          ]
        },
        {
          name: 'Инструменты',
          content: [
            { type: 'button', action: 'theme_toggle' }
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
            { type: 'button', action: 'scheme_import' },
            { type: 'button', action: 'scheme_export' },
            { type: 'button', action: 'scheme_export_locked' },
            { type: 'button', action: 'scheme_clear' }
          ]
        }
      ]
    }
  ]
};
