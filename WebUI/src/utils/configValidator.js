/**
 * Валидация конфигурации на клиенте
 *
 * Проверяет корректность данных перед отправкой на сервер.
 * Опции: { t, ignoreEmptyProjectName } — функция перевода и мягкая проверка пустого имени при загрузке с контроллера.
 */

/**
 * Подстановка {key} в строку (если t не передан).
 */
function applyParams(str, params) {
  if (!params || !str) return str;
  let out = str;
  for (const [k, v] of Object.entries(params)) {
    out = out.split(`{${k}}`).join(String(v));
  }
  return out;
}

/**
 * Текст ошибки: из словаря через t(...) или русский fallback.
 */
function tr(t, key, params, ruFallback) {
  const fullKey = `pages.config.validation.${key}`;
  if (typeof t === 'function') {
    const s = t(fullKey, params);
    if (s === fullKey) return applyParams(ruFallback, params);
    return s;
  }
  return applyParams(ruFallback, params);
}

/**
 * Валидация общей конфигурации
 * @param {Object} config
 * @param {Object} [options]
 * @param {function(string, Object=): string} [options.t]
 * @param {boolean} [options.ignoreEmptyProjectName] Не требовать projectName (загрузка с контроллера)
 * @returns {{valid: boolean, errors: string[]}}
 */
export const validateConfig = (config, options = {}) => {
  const { t, ignoreEmptyProjectName = false } = options;
  const errors = [];

  if (!ignoreEmptyProjectName && (!config.projectName || config.projectName.trim().length === 0)) {
    errors.push(tr(t, 'projectNameEmpty', null, 'Название проекта не может быть пустым'));
  }
  if (config.projectName && config.projectName.length > 100) {
    errors.push(tr(t, 'projectNameTooLong', null, 'Название проекта не может быть длиннее 100 символов'));
  }

  if (config.openTimeoutMs === undefined || config.openTimeoutMs === null) {
    errors.push(tr(t, 'openTimeoutRequired', null, 'Глобальный таймаут открытия должен быть указан'));
  } else if (config.openTimeoutMs !== 0 && (config.openTimeoutMs < 1000 || config.openTimeoutMs > 3600000)) {
    errors.push(tr(t, 'openTimeoutRange', null, 'Глобальный таймаут открытия должен быть 0 (нет сигнализации) или от 1000 до 3600000 мс (1 час)'));
  }

  if (!config.doors || !Array.isArray(config.doors)) {
    errors.push(tr(t, 'doorsMustBeArray', null, 'Список дверей должен быть массивом'));
  } else {
    if (config.doors.length > 40) {
      errors.push(tr(t, 'doorsTooMany', null, 'Количество дверей не может превышать 40'));
    }

    const techIds = new Set();
    const globalDoorIds = new Set();
    const nodeDoorPairs = new Set();

    config.doors.forEach((door, index) => {
      const doorPrefix = tr(t, 'doorPrefix', { n: index + 1 }, 'Дверь #{n}: ');

      if (door.techId === undefined || door.techId === null) {
        errors.push(`${doorPrefix}${tr(t, 'doorTechIdMissing', null, 'TechId должен быть указан')}`);
      } else if (techIds.has(door.techId)) {
        errors.push(`${doorPrefix}${tr(t, 'doorTechIdDuplicate', { techId: door.techId }, 'TechId {techId} уже используется')}`);
      } else {
        techIds.add(door.techId);
      }

      if (!door.nodeId || door.nodeId < 1 || door.nodeId > 10) {
        errors.push(`${doorPrefix}${tr(t, 'doorNodeIdRange', null, 'NodeId должен быть от 1 до 10')}`);
      }

      if (!door.localDoor || door.localDoor < 1 || door.localDoor > 8) {
        errors.push(`${doorPrefix}${tr(t, 'doorLocalDoorRange', null, 'LocalDoor должен быть от 1 до 8')}`);
      }

      if (door.nodeId && door.localDoor) {
        const pairKey = `${door.nodeId}-${door.localDoor}`;
        if (nodeDoorPairs.has(pairKey)) {
          errors.push(`${doorPrefix}${tr(t, 'doorPairDuplicate', { nodeId: door.nodeId, localDoor: door.localDoor }, 'Дверь на плате {nodeId}, позиция {localDoor} уже существует')}`);
        } else {
          nodeDoorPairs.add(pairKey);
        }
      }

      if (door.globalDoorId) {
        /* Совпадает с глобальным масштабом прошивки (1..80). */
        if (door.globalDoorId < 1 || door.globalDoorId > 80) {
          errors.push(`${doorPrefix}${tr(t, 'doorGlobalIdRange', null, 'GlobalDoorId должен быть от 1 до 80')}`);
        }
        if (globalDoorIds.has(door.globalDoorId)) {
          errors.push(`${doorPrefix}${tr(t, 'doorGlobalIdDuplicate', { id: door.globalDoorId }, 'GlobalDoorId {id} уже используется')}`);
        } else {
          globalDoorIds.add(door.globalDoorId);
        }
      }

      if (!door.type || !['NC', 'NO'].includes(door.type)) {
        errors.push(`${doorPrefix}${tr(t, 'doorTypeInvalid', null, 'Тип двери должен быть NC или NO')}`);
      }

      if (door.comment && door.comment.length > 32) {
        errors.push(`${doorPrefix}${tr(t, 'doorCommentTooLong', null, 'Комментарий не может быть длиннее 32 символов')}`);
      }
    });
  }

  if (config.edges && Array.isArray(config.edges)) {
    if (config.edges.length > 256) {
      errors.push(tr(t, 'edgesTooMany', null, 'Количество зависимостей не может превышать 256'));
    }

    config.edges.forEach((edge, index) => {
      const edgePrefix = tr(t, 'edgePrefix', { n: index + 1 }, 'Зависимость #{n}: ');

      if (!edge.srcGlobalDoorId || edge.srcGlobalDoorId < 1 || edge.srcGlobalDoorId > 80) {
        errors.push(`${edgePrefix}${tr(t, 'edgeSrcRange', null, 'srcGlobalDoorId должен быть от 1 до 80')}`);
      }

      if (!edge.dstGlobalDoorId || edge.dstGlobalDoorId < 1 || edge.dstGlobalDoorId > 80) {
        errors.push(`${edgePrefix}${tr(t, 'edgeDstRange', null, 'dstGlobalDoorId должен быть от 1 до 80')}`);
      }

      if (edge.srcGlobalDoorId === edge.dstGlobalDoorId) {
        errors.push(`${edgePrefix}${tr(t, 'edgeSelfBlock', null, 'Дверь не может блокировать сама себя')}`);
      }

      if (config.doors) {
        const srcExists = config.doors.some((d) => d.globalDoorId === edge.srcGlobalDoorId);
        const dstExists = config.doors.some((d) => d.globalDoorId === edge.dstGlobalDoorId);

        if (!srcExists) {
          errors.push(`${edgePrefix}${tr(t, 'edgeSrcMissing', { id: edge.srcGlobalDoorId }, 'Дверь с globalDoorId {id} не существует')}`);
        }
        if (!dstExists) {
          errors.push(`${edgePrefix}${tr(t, 'edgeDstMissing', { id: edge.dstGlobalDoorId }, 'Дверь с globalDoorId {id} не существует')}`);
        }
      }
    });
  }

  if (config.postCloseTimeouts && Array.isArray(config.postCloseTimeouts)) {
    config.postCloseTimeouts.forEach((timeout) => {
      if (timeout.timeoutMs !== undefined && timeout.timeoutMs !== null) {
        if (timeout.timeoutMs < 0 || timeout.timeoutMs > 3600000) {
          errors.push(tr(t, 'postCloseTimeoutRange', { globalDoorId: timeout.globalDoorId }, 'Таймаут post-close для двери {globalDoorId} должен быть от 0 до 3600000 мс'));
        }
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Валидация отдельной двери
 * @param {Object} door
 * @param {Array} [existingDoors]
 * @param {Object} [options]
 * @param {function(string, Object=): string} [options.t]
 */
export const validateDoor = (door, existingDoors = [], options = {}) => {
  const { t } = options;
  const errors = [];

  if (!door.techId || door.techId < 1) {
    errors.push(tr(t, 'singleTechIdPositive', null, 'TechId должен быть положительным числом'));
  } else {
    const duplicate = existingDoors.find((d) => d.techId === door.techId);
    if (duplicate) {
      errors.push(tr(t, 'singleTechIdInUse', { techId: door.techId }, 'TechId {techId} уже используется'));
    }
  }

  if (!door.nodeId || door.nodeId < 1 || door.nodeId > 10) {
    errors.push(tr(t, 'doorNodeIdRange', null, 'NodeId должен быть от 1 до 10'));
  }

  if (!door.localDoor || door.localDoor < 1 || door.localDoor > 8) {
    errors.push(tr(t, 'doorLocalDoorRange', null, 'LocalDoor должен быть от 1 до 8'));
  }

  if (door.nodeId && door.localDoor) {
    const duplicate = existingDoors.find(
      (d) => d.nodeId === door.nodeId && d.localDoor === door.localDoor
    );
    if (duplicate) {
      errors.push(tr(t, 'doorPairDuplicate', { nodeId: door.nodeId, localDoor: door.localDoor }, 'Дверь на плате {nodeId}, позиция {localDoor} уже существует'));
    }
  }

  if (!door.type || !['NC', 'NO'].includes(door.type)) {
    errors.push(tr(t, 'doorTypeInvalid', null, 'Тип двери должен быть NC или NO'));
  }

  if (door.comment && door.comment.length > 32) {
    errors.push(tr(t, 'doorCommentTooLong', null, 'Комментарий не может быть длиннее 32 символов'));
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Вычислить globalDoorId из nodeId и localDoor
 */
export const calculateGlobalDoorId = (nodeId, localDoor) => {
  if (nodeId < 1 || nodeId > 10 || localDoor < 1 || localDoor > 8) {
    return 0;
  }
  return (nodeId - 1) * 8 + localDoor;
};
