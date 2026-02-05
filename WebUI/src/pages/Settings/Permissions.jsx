/**
 * Permissions страница — права доступа по ролям с редактированием
 *
 * - Super Admin: себе права не выбирает (всегда полные), может менять права для Admin и Operator
 * - Admin: может менять права только для Operator; права Admin задаёт Super Admin
 * Доступна для Admin и Super Admin
 */

import { useContext, useState } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { PermissionsContext } from '../../context/PermissionsContext';
import { useLanguage } from '../../context/LanguageContext';
import { PERMISSION_SECTIONS, PERMISSION_OPTIONS, DEFAULT_PERMISSIONS } from '../../utils/permissionsConfig';
import './Permissions.css';

function getOptionLabel(value) {
  const opt = PERMISSION_OPTIONS.find((o) => o.value === value);
  return opt ? opt.label : value;
}

const Permissions = () => {
  const { t } = useLanguage();
  const { user } = useContext(AuthContext);
  const {
    permissions,
    updatePermission,
    savePermissions,
    getPermission,
    canEditCell,
    getSuperAdminDisplayValue,
  } = useContext(PermissionsContext);

  const [appliedMessage, setAppliedMessage] = useState(null);

  const handleApply = () => {
    savePermissions();
    setAppliedMessage('Права доступа применены.');
    setTimeout(() => setAppliedMessage(null), 3000);
  };

  const currentRole = user?.role;
  const roleColumns = [
    { key: 'super_admin', label: 'Super Admin' },
    { key: 'admin', label: 'Admin' },
    { key: 'operator', label: 'Operator' },
  ];

  return (
    <div className="settings-permissions">
      <h1>{t('pages.permissions.title')}</h1>

      <div className="permissions-info">
        <p>
          В системе определены три роли пользователей с различными уровнями доступа.
          Ниже представлена таблица прав доступа для каждой роли. Изменять можно только права
          других ролей (не своей): Super Admin настраивает Admin и Operator, Admin — только Operator.
        </p>
      </div>

      <div className="permissions-main">
        <div className="permissions-table-container">
          <table className="permissions-table">
          <thead>
            <tr>
              <th>Раздел</th>
              {roleColumns.map((col) => (
                <th key={col.key}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_SECTIONS.map(({ id: sectionId, section }) => (
              <tr key={sectionId}>
                <td className="permission-section">{section}</td>
                {roleColumns.map((col) => {
                  const roleKey = col.key;
                  const isEditable = canEditCell(sectionId, roleKey, currentRole);
                  const value =
                    roleKey === 'super_admin'
                      ? getSuperAdminDisplayValue(sectionId)
                      : getPermission(sectionId, roleKey);
                  const displayValue = value || (DEFAULT_PERMISSIONS[sectionId] && DEFAULT_PERMISSIONS[sectionId][roleKey]) || 'none';
                  const label = getOptionLabel(displayValue);
                  const isAllowed = displayValue !== 'none';

                  return (
                    <td
                      key={roleKey}
                      className={isAllowed ? 'permission-allowed' : 'permission-denied'}
                    >
                      {isEditable ? (
                        <select
                          className="permission-select"
                          value={displayValue}
                          onChange={(e) => updatePermission(sectionId, roleKey, e.target.value)}
                          aria-label={`Право для ${col.label}: ${section}`}
                        >
                          {PERMISSION_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span>
                          {roleKey === 'super_admin' ? '✅ ' : displayValue === 'none' ? '❌ ' : '✅ '}
                          {label}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          </table>
        </div>

        {/* Блок с описанием уровней доступа — доступен и для Admin, и для Super Admin */}
        {(currentRole === 'super_admin' || currentRole === 'admin') && (
          <div className="permissions-levels-info">
            <h2>{t('pages.permissions.dropdownValues')}</h2>
            <ul className="permission-levels-list">
              <li>
                <strong>Нет доступа</strong> — раздел для этой роли недоступен: пункт не показывается в меню, при прямом заходе по ссылке отображается «Доступ запрещён».
              </li>
              <li>
                <strong>Просмотр</strong> — можно только открывать раздел и смотреть данные, без изменения настроек (например, мониторинг: двери, события, алармы, статистика).
              </li>
              <li>
                <strong>Изменение пароля</strong> — используется в основном для раздела «Настройки → Профиль»: пользователь может менять только свой пароль, без доступа к остальным настройкам профиля.
              </li>
              <li>
                <strong>Изменение</strong> — можно открывать раздел и менять настройки (конфигурация дверей/сети/системы, профиль, права доступа). Для мониторинга по смыслу совпадает с «Просмотр».
              </li>
              <li>
                <strong>Управление</strong> — максимальный уровень: полный доступ к разделу, включая создание, редактирование и удаление сущностей. Используется для «Настройки → Пользователи».
              </li>
            </ul>
          </div>
        )}
      </div>

      {(currentRole === 'super_admin' || currentRole === 'admin') && (
        <div className="permissions-actions">
          <button type="button" className="permission-apply-btn" onClick={handleApply}>
            Применить права
          </button>
          {appliedMessage && (
            <span className="permissions-applied-msg" role="status">
              {appliedMessage}
            </span>
          )}
        </div>
      )}

      <div className="permissions-roles-info">
        <h2>{t('pages.permissions.rolesDesc')}</h2>
        <div className="role-descriptions">
          <div className="role-description">
            <h3>{t('pages.permissions.superAdmin')}</h3>
            <p>
              Полный удалённый доступ к контроллеру — только Супер-администратор. Может изменять права для ролей Admin и Operator.
              Свои права не настраиваются. Раздел «Параметры системы» доступен только Супер-администратору.
            </p>
          </div>
          <div className="role-description">
            <h3>{t('pages.permissions.admin')}</h3>
            <p>
              Права Admin задаёт Super Admin. Admin может изменять права только для роли Operator.
            </p>
          </div>
          <div className="role-description">
            <h3>{t('pages.permissions.operator')}</h3>
            <p>
              Права настраиваются Super Admin или Admin. Обычно: только просмотр мониторинга
              и изменение пароля в профиле.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Permissions;
