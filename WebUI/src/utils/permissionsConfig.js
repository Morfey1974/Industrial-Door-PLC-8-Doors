/**
 * Конфигурация прав доступа по ролям
 * Секции, уровни доступа и маппинг путей для проверки доступа
 */

/** Уровни доступа (порядок для сравнения: больше = выше право) */
export const PERMISSION_LEVELS = ['none', 'view', 'change_password', 'edit', 'manage'];

/** Секции системы с человекочитаемыми названиями */
export const PERMISSION_SECTIONS = [
  { id: 'monitoring_doors', section: 'Мониторинг → Двери' },
  { id: 'monitoring_events', section: 'Мониторинг → События' },
  { id: 'monitoring_alarms', section: 'Мониторинг → Алармы' },
  { id: 'monitoring_statistics', section: 'Мониторинг → Статистика' },
  { id: 'config_doors', section: 'Конфигурация → Двери' },
  { id: 'settings_system', section: 'Настройки → Параметры системы (только Super Admin)' },
  { id: 'settings_users', section: 'Настройки → Пользователи' },
  { id: 'settings_profile', section: 'Настройки → Профиль' },
  { id: 'settings_permissions', section: 'Настройки → Права доступа' },
  { id: 'settings_about', section: 'Настройки → О нас' },
  { id: 'settings_help', section: 'Настройки → Помощь' },
];

/** Варианты для выпадающего списка (не все применимы к каждой секции) */
export const PERMISSION_OPTIONS = [
  { value: 'none', label: 'Нет доступа' },
  { value: 'view', label: 'Просмотр' },
  { value: 'change_password', label: 'Изменение пароля' },
  { value: 'edit', label: 'Изменение' },
  { value: 'manage', label: 'Управление' },
];

/** Роли (ключи в матрице) */
export const ROLES = ['super_admin', 'admin', 'operator'];

/** Матрица прав по умолчанию: sectionId -> { super_admin, admin, operator } */
export const DEFAULT_PERMISSIONS = {
  monitoring_doors: { super_admin: 'view', admin: 'view', operator: 'view' },
  monitoring_events: { super_admin: 'view', admin: 'view', operator: 'view' },
  monitoring_alarms: { super_admin: 'view', admin: 'view', operator: 'view' },
  monitoring_statistics: { super_admin: 'view', admin: 'view', operator: 'view' },
  config_doors: { super_admin: 'edit', admin: 'edit', operator: 'none' },
  settings_system: { super_admin: 'edit', admin: 'none', operator: 'none' }, // Полный удалённый доступ — только Супер-администратор
  settings_users: { super_admin: 'manage', admin: 'none', operator: 'none' },
  settings_profile: { super_admin: 'edit', admin: 'edit', operator: 'change_password' },
  settings_permissions: { super_admin: 'edit', admin: 'edit', operator: 'none' },
  settings_about: { super_admin: 'view', admin: 'view', operator: 'view' },
  settings_help: { super_admin: 'view', admin: 'view', operator: 'view' },
};

/** Путь -> { sectionId, minLevel }. minLevel — минимальный уровень для доступа к маршруту */
export const PATH_TO_PERMISSION = {
  '/': { sectionId: 'monitoring_doors', minLevel: 'view' },
  '/dashboard': { sectionId: 'monitoring_doors', minLevel: 'view' },
  '/monitoring/doors': { sectionId: 'monitoring_doors', minLevel: 'view' },
  '/monitoring/events': { sectionId: 'monitoring_events', minLevel: 'view' },
  '/monitoring/alarms': { sectionId: 'monitoring_alarms', minLevel: 'view' },
  '/monitoring/statistics': { sectionId: 'monitoring_statistics', minLevel: 'view' },
  '/configuration/doors': { sectionId: 'config_doors', minLevel: 'edit' },
  '/configuration/mapping': { sectionId: 'config_doors', minLevel: 'edit' },
  '/settings/system': { sectionId: 'settings_system', minLevel: 'edit' }, // Только super_admin (admin: none по умолчанию)
  '/settings/users': { sectionId: 'settings_users', minLevel: 'manage' },
  '/settings/profile': { sectionId: 'settings_profile', minLevel: 'view' }, // view или change_password — проверка отдельно
  '/settings/permissions': { sectionId: 'settings_permissions', minLevel: 'edit' },
  '/settings/about': { sectionId: 'settings_about', minLevel: 'view' },
  '/settings/help': { sectionId: 'settings_help', minLevel: 'view' },
};

/** Ключ localStorage для сохранения матрицы прав */
export const PERMISSIONS_STORAGE_KEY = 'app_role_permissions';

/**
 * Проверяет, что уровень доступа пользователя достаточен для minLevel
 * @param {string} userLevel - уровень из матрицы (none, view, change_password, edit, manage)
 * @param {string} minLevel - требуемый минимальный уровень
 * @param {string} sectionId - для settings_profile: доступ при change_password тоже разрешён
 */
export function levelSufficient(userLevel, minLevel, sectionId) {
  if (sectionId === 'settings_profile' && minLevel === 'view') {
    return userLevel === 'view' || userLevel === 'edit' || userLevel === 'change_password' || userLevel === 'manage';
  }
  const userIdx = PERMISSION_LEVELS.indexOf(userLevel);
  const minIdx = PERMISSION_LEVELS.indexOf(minLevel);
  if (userIdx === -1 || minIdx === -1) return false;
  return userIdx >= minIdx;
}
