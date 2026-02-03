/**
 * Валидация конфигурации на клиенте
 * 
 * Проверяет корректность данных перед отправкой на сервер
 */

/**
 * Валидация общей конфигурации
 * @param {Object} config - Объект конфигурации
 * @returns {Object} {valid: boolean, errors: Array<string>}
 */
export const validateConfig = (config) => {
  const errors = [];
  
  // Проверка projectName
  if (!config.projectName || config.projectName.trim().length === 0) {
    errors.push('Название проекта не может быть пустым');
  }
  if (config.projectName && config.projectName.length > 100) {
    errors.push('Название проекта не может быть длиннее 100 символов');
  }
  
  // Проверка openTimeoutMs (0 = нет автосигнализации, только кнопка Alarm)
  if (config.openTimeoutMs === undefined || config.openTimeoutMs === null) {
    errors.push('Глобальный таймаут открытия должен быть указан');
  } else if (config.openTimeoutMs !== 0 && (config.openTimeoutMs < 1000 || config.openTimeoutMs > 3600000)) {
    errors.push('Глобальный таймаут открытия должен быть 0 (нет сигнализации) или от 1000 до 3600000 мс (1 час)');
  }
  
  // Проверка дверей
  if (!config.doors || !Array.isArray(config.doors)) {
    errors.push('Список дверей должен быть массивом');
  } else {
    if (config.doors.length > 80) {
      errors.push('Количество дверей не может превышать 80');
    }
    
    // Проверка каждой двери
    const techIds = new Set();
    const globalDoorIds = new Set();
    const nodeDoorPairs = new Set();
    
    config.doors.forEach((door, index) => {
      const doorPrefix = `Дверь #${index + 1}: `;
      
      // Проверка techId
      if (door.techId === undefined || door.techId === null) {
        errors.push(`${doorPrefix}TechId должен быть указан`);
      } else if (techIds.has(door.techId)) {
        errors.push(`${doorPrefix}TechId ${door.techId} уже используется`);
      } else {
        techIds.add(door.techId);
      }
      
      // Проверка nodeId
      if (!door.nodeId || door.nodeId < 1 || door.nodeId > 10) {
        errors.push(`${doorPrefix}NodeId должен быть от 1 до 10`);
      }
      
      // Проверка localDoor
      if (!door.localDoor || door.localDoor < 1 || door.localDoor > 8) {
        errors.push(`${doorPrefix}LocalDoor должен быть от 1 до 8`);
      }
      
      // Проверка уникальности пары nodeId+localDoor
      if (door.nodeId && door.localDoor) {
        const pairKey = `${door.nodeId}-${door.localDoor}`;
        if (nodeDoorPairs.has(pairKey)) {
          errors.push(`${doorPrefix}Дверь на плате ${door.nodeId}, позиция ${door.localDoor} уже существует`);
        } else {
          nodeDoorPairs.add(pairKey);
        }
      }
      
      // Проверка globalDoorId (вычисляется автоматически, но проверим)
      if (door.globalDoorId) {
        if (door.globalDoorId < 1 || door.globalDoorId > 80) {
          errors.push(`${doorPrefix}GlobalDoorId должен быть от 1 до 80`);
        }
        if (globalDoorIds.has(door.globalDoorId)) {
          errors.push(`${doorPrefix}GlobalDoorId ${door.globalDoorId} уже используется`);
        } else {
          globalDoorIds.add(door.globalDoorId);
        }
      }
      
      // Проверка type
      if (!door.type || !['NC', 'NO'].includes(door.type)) {
        errors.push(`${doorPrefix}Тип двери должен быть NC или NO`);
      }
      
      // Проверка comment (опционально, но если есть - проверим длину)
      if (door.comment && door.comment.length > 32) {
        errors.push(`${doorPrefix}Комментарий не может быть длиннее 32 символов`);
      }
    });
  }
  
  // Проверка зависимостей (edges)
  if (config.edges && Array.isArray(config.edges)) {
    if (config.edges.length > 256) {
      errors.push('Количество зависимостей не может превышать 256');
    }
    
    config.edges.forEach((edge, index) => {
      const edgePrefix = `Зависимость #${index + 1}: `;
      
      if (!edge.srcGlobalDoorId || edge.srcGlobalDoorId < 1 || edge.srcGlobalDoorId > 80) {
        errors.push(`${edgePrefix}srcGlobalDoorId должен быть от 1 до 80`);
      }
      
      if (!edge.dstGlobalDoorId || edge.dstGlobalDoorId < 1 || edge.dstGlobalDoorId > 80) {
        errors.push(`${edgePrefix}dstGlobalDoorId должен быть от 1 до 80`);
      }
      
      if (edge.srcGlobalDoorId === edge.dstGlobalDoorId) {
        errors.push(`${edgePrefix}Дверь не может блокировать сама себя`);
      }
      
      // Проверка существования дверей
      if (config.doors) {
        const srcExists = config.doors.some(d => d.globalDoorId === edge.srcGlobalDoorId);
        const dstExists = config.doors.some(d => d.globalDoorId === edge.dstGlobalDoorId);
        
        if (!srcExists) {
          errors.push(`${edgePrefix}Дверь с globalDoorId ${edge.srcGlobalDoorId} не существует`);
        }
        if (!dstExists) {
          errors.push(`${edgePrefix}Дверь с globalDoorId ${edge.dstGlobalDoorId} не существует`);
        }
      }
    });
  }
  
  // Проверка таймаутов post-close
  if (config.postCloseTimeouts && Array.isArray(config.postCloseTimeouts)) {
    config.postCloseTimeouts.forEach((timeout, index) => {
      if (timeout.timeoutMs !== undefined && timeout.timeoutMs !== null) {
        if (timeout.timeoutMs < 0 || timeout.timeoutMs > 3600000) {
          errors.push(`Таймаут post-close для двери ${timeout.globalDoorId} должен быть от 0 до 3600000 мс`);
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
 * @param {Object} door - Объект двери
 * @param {Array} existingDoors - Массив существующих дверей (для проверки уникальности)
 * @returns {Object} {valid: boolean, errors: Array<string>}
 */
export const validateDoor = (door, existingDoors = []) => {
  const errors = [];
  
  if (!door.techId || door.techId < 1) {
    errors.push('TechId должен быть положительным числом');
  } else {
    // existingDoors уже должен быть отфильтрован и не содержать редактируемую дверь
    const duplicate = existingDoors.find(d => d.techId === door.techId);
    if (duplicate) {
      errors.push(`TechId ${door.techId} уже используется`);
    }
  }
  
  if (!door.nodeId || door.nodeId < 1 || door.nodeId > 10) {
    errors.push('NodeId должен быть от 1 до 10');
  }
  
  if (!door.localDoor || door.localDoor < 1 || door.localDoor > 8) {
    errors.push('LocalDoor должен быть от 1 до 8');
  }
  
  if (door.nodeId && door.localDoor) {
    // existingDoors уже должен быть отфильтрован и не содержать редактируемую дверь
    const duplicate = existingDoors.find(
      d => d.nodeId === door.nodeId && d.localDoor === door.localDoor
    );
    if (duplicate) {
      errors.push(`Дверь на плате ${door.nodeId}, позиция ${door.localDoor} уже существует`);
    }
  }
  
  if (!door.type || !['NC', 'NO'].includes(door.type)) {
    errors.push('Тип двери должен быть NC или NO');
  }
  
  if (door.comment && door.comment.length > 32) {
    errors.push('Комментарий не может быть длиннее 32 символов');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Вычислить globalDoorId из nodeId и localDoor
 * @param {number} nodeId - ID платы (1-10)
 * @param {number} localDoor - Локальный номер двери (1-8)
 * @returns {number} globalDoorId (1-80)
 */
export const calculateGlobalDoorId = (nodeId, localDoor) => {
  if (nodeId < 1 || nodeId > 10 || localDoor < 1 || localDoor > 8) {
    return 0;
  }
  return (nodeId - 1) * 8 + localDoor;
};
