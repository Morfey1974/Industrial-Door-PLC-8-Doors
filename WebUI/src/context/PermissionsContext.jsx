/**
 * PermissionsContext — загрузка/сохранение матрицы прав, проверка доступа по пути и роли
 */

import { createContext, useState, useCallback, useMemo } from 'react';
import {
  DEFAULT_PERMISSIONS,
  PATH_TO_PERMISSION,
  PERMISSIONS_STORAGE_KEY,
  levelSufficient,
} from '../utils/permissionsConfig';

export const PermissionsContext = createContext(null);

function loadStoredPermissions() {
  try {
    const raw = localStorage.getItem(PERMISSIONS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch (e) {
    console.warn('Ошибка чтения прав из localStorage:', e);
  }
  return null;
}

function mergeWithDefaults(stored) {
  const result = {};
  for (const [sectionId, defaults] of Object.entries(DEFAULT_PERMISSIONS)) {
    let merged = { ...defaults, ...(stored && stored[sectionId] ? stored[sectionId] : {}) };
    // settings_system: полный удалённый доступ только у Super Admin
    if (sectionId === 'settings_system') {
      merged = { ...merged, admin: 'none', operator: 'none' };
    }
    result[sectionId] = merged;
  }
  return result;
}

export function PermissionsProvider({ children }) {
  const [permissions, setPermissions] = useState(() => {
    const stored = loadStoredPermissions();
    return mergeWithDefaults(stored);
  });

  const updatePermission = useCallback((sectionId, role, value) => {
    // settings_system: Admin и Operator не могут получить доступ
    if (sectionId === 'settings_system' && (role === 'admin' || role === 'operator')) {
      return;
    }
    setPermissions((prev) => {
      const next = { ...prev };
      if (!next[sectionId]) next[sectionId] = { ...DEFAULT_PERMISSIONS[sectionId] };
      next[sectionId] = { ...next[sectionId], [role]: value };
      return next;
    });
  }, []);

  const savePermissions = useCallback(() => {
    setPermissions((current) => {
      const toStore = {};
      for (const [sectionId, roles] of Object.entries(current)) {
        let toSave = { ...roles };
        // settings_system: всегда сохраняем admin и operator как 'none'
        if (sectionId === 'settings_system') {
          toSave = { ...toSave, admin: 'none', operator: 'none' };
        }
        toStore[sectionId] = toSave;
      }
      try {
        localStorage.setItem(PERMISSIONS_STORAGE_KEY, JSON.stringify(toStore));
      } catch (e) {
        console.warn('Ошибка сохранения прав в localStorage:', e);
      }
      return current;
    });
  }, []);

  const getPermission = useCallback(
    (sectionId, role) => {
      const section = permissions[sectionId];
      if (!section) return 'none';
      return section[role] ?? 'none';
    },
    [permissions]
  );

  const canAccess = useCallback(
    (path, role) => {
      const mapping = PATH_TO_PERMISSION[path];
      if (!mapping) return true;
      const userLevel = getPermission(mapping.sectionId, role);
      return levelSufficient(userLevel, mapping.minLevel, mapping.sectionId);
    },
    [getPermission]
  );

  /**
   * Можно ли текущему пользователю редактировать ячейку (sectionId, roleColumn).
   * Super Admin: может редактировать только колонки Admin и Operator (не себя).
   * Admin: может редактировать только колонку Operator (не себя и не Super Admin).
   * Исключение: settings_system (Параметры системы) — полный удалённый доступ только у Super Admin,
   * колонки Admin и Operator не редактируются (всегда «Нет доступа»).
   */
  const canEditCell = useCallback((sectionId, roleColumn, currentUserRole) => {
    if (sectionId === 'settings_system' && (roleColumn === 'admin' || roleColumn === 'operator')) {
      return false; // Полный удалённый доступ — только Супер-администратор
    }
    if (currentUserRole === 'super_admin') {
      return roleColumn === 'admin' || roleColumn === 'operator';
    }
    if (currentUserRole === 'admin') {
      return roleColumn === 'operator';
    }
    return false;
  }, []);

  /**
   * Для колонки Super Admin: всегда полные права, ячейка только для отображения (не редактируется).
   * Возвращает отображаемое значение: максимальный уровень для секции или "Управление".
   */
  const getSuperAdminDisplayValue = useCallback((sectionId) => {
    const section = DEFAULT_PERMISSIONS[sectionId];
    if (!section) return 'manage';
    const sa = section.super_admin;
    if (sa === 'manage' || sa === 'edit' || sa === 'view' || sa === 'change_password') return sa;
    return 'manage';
  }, []);

  const value = useMemo(
    () => ({
      permissions,
      updatePermission,
      savePermissions,
      getPermission,
      canAccess,
      canEditCell,
      getSuperAdminDisplayValue,
    }),
    [
      permissions,
      updatePermission,
      savePermissions,
      getPermission,
      canAccess,
      canEditCell,
      getSuperAdminDisplayValue,
    ]
  );

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}
