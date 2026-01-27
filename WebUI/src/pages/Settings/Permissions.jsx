/**
 * Permissions страница - отображение прав доступа по ролям
 * 
 * Доступна для Admin и Super Admin
 */

import './Permissions.css';

const Permissions = () => {
  const permissions = [
    {
      section: 'Мониторинг → Двери',
      superAdmin: '✅ Просмотр',
      admin: '✅ Просмотр',
      operator: '✅ Просмотр'
    },
    {
      section: 'Мониторинг → События',
      superAdmin: '✅ Просмотр',
      admin: '✅ Просмотр',
      operator: '✅ Просмотр'
    },
    {
      section: 'Мониторинг → Алармы',
      superAdmin: '✅ Просмотр',
      admin: '✅ Просмотр',
      operator: '✅ Просмотр'
    },
    {
      section: 'Мониторинг → Статистика',
      superAdmin: '✅ Просмотр',
      admin: '✅ Просмотр',
      operator: '✅ Просмотр'
    },
    {
      section: 'Конфигурация → Двери',
      superAdmin: '✅ Изменение',
      admin: '✅ Изменение',
      operator: '❌ Нет доступа'
    },
    {
      section: 'Конфигурация → Сеть',
      superAdmin: '✅ Изменение',
      admin: '✅ Изменение',
      operator: '❌ Нет доступа'
    },
    {
      section: 'Конфигурация → Система',
      superAdmin: '✅ Изменение',
      admin: '✅ Изменение',
      operator: '❌ Нет доступа'
    },
    {
      section: 'Настройки → Пользователи',
      superAdmin: '✅ Управление',
      admin: '❌ Нет доступа',
      operator: '❌ Нет доступа'
    },
    {
      section: 'Настройки → Профиль',
      superAdmin: '✅ Изменение',
      admin: '✅ Изменение',
      operator: '✅ Изменение пароля'
    }
  ];

  return (
    <div className="settings-permissions">
      <h1>Права доступа по ролям</h1>
      
      <div className="permissions-info">
        <p>
          В системе определены три роли пользователей с различными уровнями доступа. 
          Ниже представлена таблица прав доступа для каждой роли.
        </p>
      </div>

      <div className="permissions-table-container">
        <table className="permissions-table">
          <thead>
            <tr>
              <th>Раздел</th>
              <th>Super Admin</th>
              <th>Admin</th>
              <th>Operator</th>
            </tr>
          </thead>
          <tbody>
            {permissions.map((perm, index) => (
              <tr key={index}>
                <td className="permission-section">{perm.section}</td>
                <td className={perm.superAdmin.includes('✅') ? 'permission-allowed' : 'permission-denied'}>
                  {perm.superAdmin}
                </td>
                <td className={perm.admin.includes('✅') ? 'permission-allowed' : 'permission-denied'}>
                  {perm.admin}
                </td>
                <td className={perm.operator.includes('✅') ? 'permission-allowed' : 'permission-denied'}>
                  {perm.operator}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="permissions-roles-info">
        <h2>Описание ролей</h2>
        <div className="role-descriptions">
          <div className="role-description">
            <h3>Super Admin (Супер-администратор)</h3>
            <p>Полные права, включая управление пользователями. Может создавать, редактировать и удалять пользователей всех ролей.</p>
          </div>
          <div className="role-description">
            <h3>Admin (Администратор)</h3>
            <p>Полные права, кроме управления пользователями. Может изменять конфигурацию дверей, сетевые настройки и параметры системы.</p>
          </div>
          <div className="role-description">
            <h3>Operator (Оператор)</h3>
            <p>Только просмотр данных мониторинга. Не может изменять конфигурацию, настройки сети и параметры системы. Может изменять свой пароль в профиле.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Permissions;
