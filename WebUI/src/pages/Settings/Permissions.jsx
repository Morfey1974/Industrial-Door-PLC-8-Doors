/**
 * Permissions страница — права доступа по ролям с редактированием
 */

import { useContext, useState, useCallback } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { PermissionsContext } from '../../context/PermissionsContext';
import { useLanguage } from '../../context/LanguageContext';
import { PERMISSION_SECTIONS, PERMISSION_OPTIONS, DEFAULT_PERMISSIONS } from '../../utils/permissionsConfig';
import './Permissions.css';

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

  const getOptionLabel = useCallback(
    (value) => {
      const opt = PERMISSION_OPTIONS.find((o) => o.value === value);
      return opt ? t(opt.labelKey) : value;
    },
    [t]
  );

  const handleApply = () => {
    savePermissions();
    setAppliedMessage(t('pages.permissions.applied'));
    setTimeout(() => setAppliedMessage(null), 3000);
  };

  const currentRole = user?.role;
  const roleColumns = [
    { key: 'super_admin', label: t('pages.permissions.roleColSuper') },
    { key: 'admin', label: t('pages.permissions.roleColAdmin') },
    { key: 'operator', label: t('pages.permissions.roleColOperator') },
  ];

  return (
    <div className="settings-permissions">
      <h1>{t('pages.permissions.title')}</h1>

      <div className="permissions-info">
        <p>{t('pages.permissions.intro')}</p>
      </div>

      <div className="permissions-main">
        <div className="permissions-table-container">
          <table className="permissions-table">
            <thead>
              <tr>
                <th>{t('pages.permissions.colSection')}</th>
                {roleColumns.map((col) => (
                  <th
                    key={col.key}
                    className={col.key === 'super_admin' ? 'permission-col-super-admin' : undefined}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_SECTIONS.map(({ id: sectionId, titleKey }) => (
                <tr key={sectionId}>
                  <td className="permission-section">{t(titleKey)}</td>
                  {roleColumns.map((col) => {
                    const roleKey = col.key;
                    const isEditable = canEditCell(sectionId, roleKey, currentRole);
                    const value =
                      roleKey === 'super_admin'
                        ? getSuperAdminDisplayValue(sectionId)
                        : getPermission(sectionId, roleKey);
                    const displayValue =
                      value ||
                      (DEFAULT_PERMISSIONS[sectionId] && DEFAULT_PERMISSIONS[sectionId][roleKey]) ||
                      'none';
                    const label = getOptionLabel(displayValue);
                    const isAllowed = displayValue !== 'none';
                    const sectionTitle = t(titleKey);

                    return (
                      <td
                        key={roleKey}
                        className={[
                          isAllowed ? 'permission-allowed' : 'permission-denied',
                          roleKey === 'super_admin' ? 'permission-col-super-admin' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        {isEditable ? (
                          <select
                            className="permission-select"
                            value={displayValue}
                            onChange={(e) => updatePermission(sectionId, roleKey, e.target.value)}
                            aria-label={t('pages.permissions.selectAria', {
                              role: col.label,
                              section: sectionTitle,
                            })}
                          >
                            {PERMISSION_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {t(opt.labelKey)}
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

        {(currentRole === 'super_admin' || currentRole === 'admin') && (
          <div className="permissions-levels-info">
            <h2>{t('pages.permissions.dropdownValues')}</h2>
            <ul className="permission-levels-list">
              <li>
                <strong>{t('pages.permissions.levelNone')}</strong> — {t('pages.permissions.levelDescNone')}
              </li>
              <li>
                <strong>{t('pages.permissions.levelView')}</strong> — {t('pages.permissions.levelDescView')}
              </li>
              <li>
                <strong>{t('pages.permissions.levelChangePassword')}</strong> —{' '}
                {t('pages.permissions.levelDescChangePassword')}
              </li>
              <li>
                <strong>{t('pages.permissions.levelEdit')}</strong> — {t('pages.permissions.levelDescEdit')}
              </li>
              <li>
                <strong>{t('pages.permissions.levelManage')}</strong> — {t('pages.permissions.levelDescManage')}
              </li>
            </ul>
          </div>
        )}
      </div>

      {(currentRole === 'super_admin' || currentRole === 'admin') && (
        <div className="permissions-actions">
          <button type="button" className="permission-apply-btn" onClick={handleApply}>
            {t('pages.permissions.applyButton')}
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
            <p>{t('pages.permissions.roleSuperAdminDesc')}</p>
          </div>
          <div className="role-description">
            <h3>{t('pages.permissions.admin')}</h3>
            <p>{t('pages.permissions.roleAdminDesc')}</p>
          </div>
          <div className="role-description">
            <h3>{t('pages.permissions.operator')}</h3>
            <p>{t('pages.permissions.roleOperatorDesc')}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Permissions;
