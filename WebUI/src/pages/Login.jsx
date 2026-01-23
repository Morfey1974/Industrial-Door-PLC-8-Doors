/**
 * Login страница - страница входа
 */

const Login = () => {
  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <div className="logo">
            <span className="logo-text">DCM</span>
            <span className="logo-subtitle">DOORS CONTROL MAKING</span>
          </div>
        </div>
        <form className="login-form">
          <div className="form-group">
            <label>Логин</label>
            <select className="form-control">
              <option>Администратор</option>
              <option>Клиент</option>
            </select>
          </div>
          <div className="form-group">
            <label>Пароль</label>
            <input type="password" className="form-control" />
          </div>
          <button type="submit" className="btn btn-primary">
            Вход
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
