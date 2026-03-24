/**
 * Users страница - управление пользователями
 * 
 * Реализует:
 * - Список всех пользователей
 * - Создание нового пользователя
 * - Редактирование пользователя
 * - Удаление пользователя
 * - Только для Super Admin
 */

import { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { getUsers, createUser, updateUser, deleteUser } from '../../services/users';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import PasswordInput from '../../components/common/PasswordInput';
import './Users.css';

const Users = () => {
  const { t, language } = useLanguage();
  const dateLocale = language === 'en' ? 'en-US' : 'ru-RU';
  const { user } = useContext(AuthContext);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  
  // Форма создания/редактирования
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    role: 'operator',
    enabled: true
  });
  const [formError, setFormError] = useState(null);
  const [formLoading, setFormLoading] = useState(false);

  // Проверка прав доступа
  useEffect(() => {
    if (user && user.role !== 'super_admin') {
      setError(t('pages.users.accessDenied'));
      setLoading(false);
    } else if (user && user.role === 'super_admin') {
      loadUsers();
    }
  }, [user, t]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getUsers();
      if (response.ok && response.users) {
        setUsers(response.users);
      } else {
        setError(response.error || t('pages.users.loadError'));
      }
    } catch (err) {
      setError(err.message || t('pages.users.connectionError'));
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setFormData({ username: '', password: '', role: 'operator', enabled: true });
    setFormError(null);
    setShowCreateModal(true);
  };

  const handleEdit = (userToEdit) => {
    setEditingUser(userToEdit);
    // Супер-администратор всегда включён; при редактировании его не даём менять «Включен»
    const isSuperAdmin = userToEdit.role === 'super_admin';
    setFormData({
      username: userToEdit.username,
      password: '',
      role: userToEdit.role,
      enabled: isSuperAdmin ? true : userToEdit.enabled
    });
    setFormError(null);
    setShowEditModal(true);
  };

  const handleDelete = async (username) => {
    if (!window.confirm(t('pages.users.deleteConfirm', { name: username }))) {
      return;
    }

    try {
      setFormLoading(true);
      const response = await deleteUser(username);
      if (response.ok) {
        await loadUsers();
      } else {
        alert(response.error || t('pages.users.deleteError'));
      }
    } catch (err) {
      alert(err.message || t('pages.users.connectionError'));
    } finally {
      setFormLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);
    setFormLoading(true);

    try {
      if (showCreateModal) {
        // Создание
        if (!formData.username || !formData.password) {
          setFormError(t('pages.users.errUserPassRequired'));
          setFormLoading(false);
          return;
        }
        if (formData.password.length < 8) {
          setFormError(t('pages.users.errPasswordMin'));
          setFormLoading(false);
          return;
        }

        const response = await createUser(formData);

        if (response.ok) {
          setShowCreateModal(false);
          await loadUsers();
        } else {
          setFormError(response.error || t('pages.users.errCreate'));
        }
      } else {
        // Редактирование
        const isSuperAdmin = editingUser.role === 'super_admin';
        const updateData = {
          // Супер-администратор: не меняем роль, всегда включён
          ...(isSuperAdmin
            ? { enabled: 1 }
            : { role: formData.role, enabled: formData.enabled ? 1 : 0 })
        };

        if (formData.password && formData.password.length > 0) {
          if (formData.password.length < 8) {
            setFormError(t('pages.users.errPasswordMin'));
            setFormLoading(false);
            return;
          }
          updateData.password = formData.password;
        }

        const response = await updateUser(editingUser.username, updateData);

        if (response.ok) {
          setShowEditModal(false);
          setEditingUser(null);
          await loadUsers();
        } else {
          setFormError(response.error || t('pages.users.errUpdate'));
        }
      }
    } catch (err) {
      setFormError(err.message || t('pages.users.connectionError'));
    } finally {
      setFormLoading(false);
    }
  };

  const getRoleName = (role) => {
    const map = {
      super_admin: 'pages.users.roleSuperAdmin',
      admin: 'pages.users.roleAdmin',
      operator: 'pages.users.roleOperator',
      monitor: 'pages.users.roleMonitor',
    };
    const key = map[role];
    return key ? t(key) : role;
  };

  // Если не Super Admin, показываем сообщение
  if (user && user.role !== 'super_admin') {
    return (
      <div className="settings-users">
        <h1>{t('pages.users.title')}</h1>
        <div className="error-message" style={{ padding: '20px', backgroundColor: '#ffebee', border: '1px solid #f44336', borderRadius: '4px', color: '#c62828' }}>
          {t('pages.users.accessDenied')}
        </div>
      </div>
    );
  }

  return (
    <div className="settings-users">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1>{t('pages.users.title')}</h1>
        <Button onClick={handleCreate} variant="primary">
          + {t('pages.users.createUser')}
        </Button>
      </div>

      {loading && <div>{t('pages.users.loading')}</div>}
      {error && (
        <div className="error-message" style={{ padding: '10px', marginBottom: '15px', backgroundColor: '#ffebee', border: '1px solid #f44336', borderRadius: '4px', color: '#c62828' }}>
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="users-table-container">
          <table className="users-table">
            <thead>
              <tr>
                <th>{t('pages.users.colUsername')}</th>
                <th>{t('pages.users.colRole')}</th>
                <th>{t('pages.users.colStatus')}</th>
                <th>{t('pages.users.colCreated')}</th>
                <th>{t('pages.users.colLastLogin')}</th>
                <th>{t('pages.users.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '20px' }}>
                    {t('pages.users.noUsers')}
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.username}>
                    <td>{u.username}</td>
                    <td>{getRoleName(u.role)}</td>
                    <td>
                      <span className={`status-badge ${u.enabled ? 'enabled' : 'disabled'}`}>
                        {u.enabled ? t('pages.users.enabled') : t('pages.users.disabled')}
                      </span>
                    </td>
                    <td>{u.createdAt ? new Date(u.createdAt).toLocaleString(dateLocale) : t('pages.profile.dash')}</td>
                    <td>{u.lastLogin ? new Date(u.lastLogin).toLocaleString(dateLocale) : t('pages.users.never')}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <Button onClick={() => handleEdit(u)} variant="secondary" size="small">
                          {t('pages.users.edit')}
                        </Button>
                        {u.username !== user.username && (
                          <Button onClick={() => handleDelete(u.username)} variant="danger" size="small" disabled={formLoading}>
                            {t('pages.users.delete')}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Модальное окно создания */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title={t('pages.users.modalCreateTitle')}>
        <form onSubmit={handleSubmit}>
          {formError && (
            <div className="error-message" style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#ffebee', border: '1px solid #f44336', borderRadius: '4px', color: '#c62828' }}>
              {formError}
            </div>
          )}
          
          <div className="form-group">
            <label style={{ color: '#333' }}>{t('pages.users.usernameLabel')} {t('pages.users.requiredMark')}</label>
            <input
              type="text"
              className="form-control"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              required
              disabled={formLoading}
            />
          </div>

          <PasswordInput
            id="password"
            label={t('pages.users.passwordLabel')}
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            placeholder={t('pages.users.passwordPlaceholder')}
            required
            minLength={8}
            disabled={formLoading}
            showForgotPassword={false}
          />

          <div className="form-group">
            <label style={{ color: '#333' }}>{t('pages.users.roleLabel')} {t('pages.users.requiredMark')}</label>
            <select
              className="form-control"
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              required
              disabled={formLoading}
            >
              <option value="operator">{t('pages.users.roleOperator')}</option>
              <option value="admin">{t('pages.users.roleAdmin')}</option>
              {/* Супер-администратор создаётся по умолчанию, новых с этой ролью создавать нельзя */}
            </select>
          </div>

          <div className="form-group">
            <label style={{ color: '#333', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                checked={formData.enabled}
                onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                disabled={formLoading}
              />
              <span style={{ color: '#333' }}>{t('pages.users.enabledLabel')}</span>
            </label>
          </div>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
            <Button type="button" onClick={() => setShowCreateModal(false)} disabled={formLoading}>
              {t('pages.users.cancel')}
            </Button>
            <Button type="submit" variant="primary" disabled={formLoading}>
              {formLoading ? t('pages.users.creating') : t('pages.users.create')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Модальное окно редактирования */}
      <Modal isOpen={showEditModal} onClose={() => { setShowEditModal(false); setEditingUser(null); }} title={t('pages.users.modalEditTitle')}>
        <form onSubmit={handleSubmit}>
          {formError && (
            <div className="error-message" style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#ffebee', border: '1px solid #f44336', borderRadius: '4px', color: '#c62828' }}>
              {formError}
            </div>
          )}
          
          <div className="form-group">
            <label style={{ color: '#333' }}>{t('pages.users.usernameLabel')}</label>
            <input
              type="text"
              className="form-control"
              value={formData.username}
              disabled
              style={{ backgroundColor: '#f5f5f5' }}
            />
          </div>

          <PasswordInput
            id="edit-password"
            label={t('pages.users.newPasswordOptional')}
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            placeholder={t('pages.users.passwordPlaceholder')}
            minLength={8}
            disabled={formLoading}
            showForgotPassword={false}
          />
          <small className="form-help" style={{ display: 'block', marginTop: '-10px', marginBottom: '15px', color: '#333' }}>
            {t('pages.users.passwordHint')}
          </small>

          {/* Для Супер-администратора показываем только роль текстом; роль и «Включен» не редактируются */}
          {editingUser?.role === 'super_admin' ? (
            <div className="form-group">
              <label style={{ color: '#333' }}>{t('pages.users.roleLabel')}</label>
              <div style={{ padding: '8px 12px', backgroundColor: '#f5f5f5', borderRadius: '4px', color: '#333' }}>
                {t('pages.users.roleSuperLocked')}
              </div>
              <small className="form-help" style={{ display: 'block', marginTop: '6px', color: '#666' }}>
                {t('pages.users.superAdminPasswordOnly')}
              </small>
            </div>
          ) : (
            <>
              <div className="form-group">
                <label style={{ color: '#333' }}>{t('pages.users.roleLabel')} {t('pages.users.requiredMark')}</label>
                <select
                  className="form-control"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  required
                  disabled={formLoading}
                >
                  <option value="operator">{t('pages.users.roleOperator')}</option>
                  <option value="admin">{t('pages.users.roleAdmin')}</option>
                  <option value="super_admin">{t('pages.users.roleSuperAdmin')}</option>
                </select>
              </div>

              <div className="form-group">
                <label style={{ color: '#333', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={formData.enabled}
                    onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                    disabled={formLoading}
                  />
                  <span style={{ color: '#333' }}>{t('pages.users.enabledLabel')}</span>
                </label>
              </div>
            </>
          )}

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
            <Button type="button" onClick={() => { setShowEditModal(false); setEditingUser(null); }} disabled={formLoading}>
              {t('pages.users.cancel')}
            </Button>
            <Button type="submit" variant="primary" disabled={formLoading}>
              {formLoading ? t('pages.users.saving') : t('pages.users.save')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Users;
