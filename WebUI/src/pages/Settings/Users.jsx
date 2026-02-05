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
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { getUsers, createUser, updateUser, deleteUser } from '../../services/users';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import PasswordInput from '../../components/common/PasswordInput';
import './Users.css';

const Users = () => {
  const { t } = useLanguage();
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
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
      setError('Доступ запрещен. Только для Супер-администратора.');
      setLoading(false);
    } else if (user && user.role === 'super_admin') {
      loadUsers();
    }
  }, [user]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getUsers();
      if (response.ok && response.users) {
        setUsers(response.users);
      } else {
        setError(response.error || 'Ошибка загрузки пользователей');
      }
    } catch (err) {
      setError(err.message || 'Ошибка подключения к серверу');
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
    if (!window.confirm(`Вы уверены, что хотите удалить пользователя "${username}"?`)) {
      return;
    }

    try {
      setFormLoading(true);
      const response = await deleteUser(username);
      if (response.ok) {
        await loadUsers();
      } else {
        alert(response.error || 'Ошибка удаления пользователя');
      }
    } catch (err) {
      alert(err.message || 'Ошибка подключения к серверу');
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
          setFormError('Имя пользователя и пароль обязательны');
          setFormLoading(false);
          return;
        }
        if (formData.password.length < 8) {
          setFormError('Пароль должен содержать минимум 8 символов');
          setFormLoading(false);
          return;
        }

        const response = await createUser(formData);

        if (response.ok) {
          setShowCreateModal(false);
          await loadUsers();
        } else {
          setFormError(response.error || 'Ошибка создания пользователя');
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
            setFormError('Пароль должен содержать минимум 8 символов');
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
          setFormError(response.error || 'Ошибка обновления пользователя');
        }
      }
    } catch (err) {
      setFormError(err.message || 'Ошибка подключения к серверу');
    } finally {
      setFormLoading(false);
    }
  };

  const getRoleName = (role) => {
    const roleNames = {
      'super_admin': 'Супер-администратор',
      'admin': 'Администратор',
      'operator': 'Оператор'
    };
    return roleNames[role] || role;
  };

  // Если не Super Admin, показываем сообщение
  if (user && user.role !== 'super_admin') {
    return (
      <div className="settings-users">
        <h1>{t('pages.users.title')}</h1>
        <div className="error-message" style={{ padding: '20px', backgroundColor: '#ffebee', border: '1px solid #f44336', borderRadius: '4px', color: '#c62828' }}>
          Доступ запрещен. Только для Супер-администратора.
        </div>
      </div>
    );
  }

  return (
    <div className="settings-users">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1>{t('pages.users.title')}</h1>
        <Button onClick={handleCreate} variant="primary">
          + Создать пользователя
        </Button>
      </div>

      {loading && <div>Загрузка...</div>}
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
                <th>Имя пользователя</th>
                <th>Роль</th>
                <th>Статус</th>
                <th>Создан</th>
                <th>Последний вход</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '20px' }}>
                    Пользователи не найдены
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.username}>
                    <td>{u.username}</td>
                    <td>{getRoleName(u.role)}</td>
                    <td>
                      <span className={`status-badge ${u.enabled ? 'enabled' : 'disabled'}`}>
                        {u.enabled ? 'Включен' : 'Отключен'}
                      </span>
                    </td>
                    <td>{u.createdAt ? new Date(u.createdAt).toLocaleString('ru-RU') : '—'}</td>
                    <td>{u.lastLogin ? new Date(u.lastLogin).toLocaleString('ru-RU') : 'Никогда'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <Button onClick={() => handleEdit(u)} variant="secondary" size="small">
                          Редактировать
                        </Button>
                        {u.username !== user.username && (
                          <Button onClick={() => handleDelete(u.username)} variant="danger" size="small" disabled={formLoading}>
                            Удалить
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
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Создать пользователя">
        <form onSubmit={handleSubmit}>
          {formError && (
            <div className="error-message" style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#ffebee', border: '1px solid #f44336', borderRadius: '4px', color: '#c62828' }}>
              {formError}
            </div>
          )}
          
          <div className="form-group">
            <label style={{ color: '#333' }}>Имя пользователя *</label>
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
            label="Пароль"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            placeholder="Минимум 8 символов"
            required
            minLength={8}
            disabled={formLoading}
            showForgotPassword={false}
          />

          <div className="form-group">
            <label style={{ color: '#333' }}>Роль *</label>
            <select
              className="form-control"
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              required
              disabled={formLoading}
            >
              <option value="operator">Оператор</option>
              <option value="admin">Администратор</option>
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
              <span style={{ color: '#333' }}>Включен</span>
            </label>
          </div>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
            <Button type="button" onClick={() => setShowCreateModal(false)} disabled={formLoading}>
              Отмена
            </Button>
            <Button type="submit" variant="primary" disabled={formLoading}>
              {formLoading ? 'Создание...' : 'Создать'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Модальное окно редактирования */}
      <Modal isOpen={showEditModal} onClose={() => { setShowEditModal(false); setEditingUser(null); }} title="Редактировать пользователя">
        <form onSubmit={handleSubmit}>
          {formError && (
            <div className="error-message" style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#ffebee', border: '1px solid #f44336', borderRadius: '4px', color: '#c62828' }}>
              {formError}
            </div>
          )}
          
          <div className="form-group">
            <label style={{ color: '#333' }}>Имя пользователя</label>
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
            label="Новый пароль (оставьте пустым, чтобы не менять)"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            placeholder="Минимум 8 символов"
            minLength={8}
            disabled={formLoading}
            showForgotPassword={false}
          />
          <small className="form-help" style={{ display: 'block', marginTop: '-10px', marginBottom: '15px', color: '#333' }}>
            Минимум 8 символов. Оставьте пустым, чтобы не менять пароль.
          </small>

          {/* Для Супер-администратора показываем только роль текстом; роль и «Включен» не редактируются */}
          {editingUser?.role === 'super_admin' ? (
            <div className="form-group">
              <label style={{ color: '#333' }}>Роль</label>
              <div style={{ padding: '8px 12px', backgroundColor: '#f5f5f5', borderRadius: '4px', color: '#333' }}>
                Супер-администратор (всегда включён)
              </div>
              <small className="form-help" style={{ display: 'block', marginTop: '6px', color: '#666' }}>
                У Супер-администратора можно изменить только пароль. Отключить его нельзя.
              </small>
            </div>
          ) : (
            <>
              <div className="form-group">
                <label style={{ color: '#333' }}>Роль *</label>
                <select
                  className="form-control"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  required
                  disabled={formLoading}
                >
                  <option value="operator">Оператор</option>
                  <option value="admin">Администратор</option>
                  <option value="super_admin">Супер-администратор</option>
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
                  <span style={{ color: '#333' }}>Включен</span>
                </label>
              </div>
            </>
          )}

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
            <Button type="button" onClick={() => { setShowEditModal(false); setEditingUser(null); }} disabled={formLoading}>
              Отмена
            </Button>
            <Button type="submit" variant="primary" disabled={formLoading}>
              {formLoading ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Users;
