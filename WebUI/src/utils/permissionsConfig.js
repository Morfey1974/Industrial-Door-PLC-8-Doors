/**
 * Конфигурация прав доступа по ролям
 * Секции, уровни доступа и маппинг путей для проверки доступа
 */

/** Уровни доступа (порядок для сравнения: больше = выше право) */
export const PERMISSION_LEVELS = ['none', 'view', 'change_password', 'edit', 'manage'];

/** Секции: titleKey — ключ локализации (pages.permissions.sections.*) */
export const PERMISSION_SECTIONS = [
  { id: 'monitoring_doors', titleKey: 'pages.permissions.sections.monitoring_doors' },
  { id: 'monitoring_events', titleKey: 'pages.permissions.sections.monitoring_events' },
  { id: 'monitoring_statistics', titleKey: 'pages.permissions.sections.monitoring_statistics' },
  { id: 'config_doors', titleKey: 'pages.permissions.sections.config_doors' },
  { id: 'settings_system', titleKey: 'pages.permissions.sections.settings_system' },
  { id: 'settings_users', titleKey: 'pages.permissions.sections.settings_users' },
  { id: 'settings_profile', titleKey: 'pages.permissions.sections.settings_profile' },
  { id: 'settings_permissions', titleKey: 'pages.permissions.sections.settings_permissions' },
  { id: 'settings_about', titleKey: 'pages.permissions.sections.settings_about' },
  { id: 'settings_help', titleKey: 'pages.permissions.sections.settings_help' },
];

/** Варианты выпадающего списка: labelKey — pages.permissions.level* */
export const PERMISSION_OPTIONS = [
  { value: 'none', labelKey: 'pages.permissions.levelNone' },
  { value: 'view', labelKey: 'pages.permissions.levelView' },
  { value: 'change_password', labelKey: 'pages.permissions.levelChangePassword' },
  { value: 'edit', labelKey: 'pages.permissions.levelEdit' },
  { value: 'manage', labelKey: 'pages.permissions.levelManage' },
];

/** Роли (ключи в матрице) */
export const ROLES = ['super_admin', 'admin', 'operator'];

/** Матрица прав по умолчанию: sectionId -> { super_admin, admin, operator } */
export const DEFAULT_PERMISSIONS = {
  monitoring_doors: { super_admin: 'view', admin: 'view', operator: 'view' },
  monitoring_events: { super_admin: 'view', admin: 'view', operator: 'view' },
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
