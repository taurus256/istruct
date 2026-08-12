/*
 * nodeTypes.js — реестр типов узлов mind map.
 * Остальной код (model.js, render.js, dragdrop.js) НЕ хардкодит if/else по
 * типам узлов, а всегда обращается к NodeTypeRegistry, чтобы можно было
 * зарегистрировать новый тип узла без правки логики дерева/рендера.
 */

var NodeTypeRegistry = (function () {
  var types = {};

  /**
   * Регистрирует тип узла.
   * config: { type, label, cssClass, defaultText, canHaveChildren, singletonPerParent }
   * singletonPerParent: true — у одного родителя может быть не более одного
   * ребёнка этого типа (используется, например, для комментариев).
   */
  function register(config) {
    if (!config || !config.type) {
      throw new Error('NodeTypeRegistry.register: не указан обязательный параметр "type"');
    }
    types[config.type] = {
      type: config.type,
      label: config.label || config.type,
      cssClass: config.cssClass || '',
      defaultText: config.defaultText || 'Новый узел',
      // По умолчанию узел может иметь детей, если явно не указано иное
      canHaveChildren: config.canHaveChildren !== false,
      // По умолчанию ограничение "один на родителя" не действует
      singletonPerParent: config.singletonPerParent === true
    };
  }

  function get(type) {
    return types[type] || null;
  }

  function getAll() {
    return Object.keys(types).map(function (key) {
      return types[key];
    });
  }

  return {
    register: register,
    get: get,
    getAll: getAll
  };
})();

/* ---------- Типы узлов по умолчанию ----------
 * ВАЖНО: "комментарий" — это НЕ отдельный тип узла, а необязательный
 * атрибут (node.data.comment), который может быть у любого узла любого
 * типа (текстового, теста, ссылки). См. Model.setComment()/clearComment()
 * и render.js (.node__comment). Здесь регистрируются только настоящие
 * типы узлов, различающиеся структурно (могут быть выделены, перемещены,
 * иметь собственных детей и т.д.).
 */

NodeTypeRegistry.register({
  type: 'main',
  label: 'Узел',
  cssClass: 'node--main',
  defaultText: 'Новый узел',
  canHaveChildren: true
});

NodeTypeRegistry.register({
  type: 'test',
  label: 'Тест',
  cssClass: 'node--test',
  defaultText: 'Новый тест',
  canHaveChildren: true
});

NodeTypeRegistry.register({
  type: 'link',
  label: 'Ссылка',
  cssClass: 'node--link',
  defaultText: 'Новая ссылка',
  canHaveChildren: true
});
