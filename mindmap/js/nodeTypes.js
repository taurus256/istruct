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

/* ---------- Типы узлов по умолчанию ---------- */

NodeTypeRegistry.register({
  type: 'main',
  label: 'Узел',
  cssClass: 'node--main',
  defaultText: 'Новый узел',
  canHaveChildren: true
});

NodeTypeRegistry.register({
  type: 'comment',
  label: 'Комментарий',
  cssClass: 'node--comment',
  defaultText: 'Комментарий',
  canHaveChildren: true,
  // У узла может быть не более одного комментария
  singletonPerParent: true
});
