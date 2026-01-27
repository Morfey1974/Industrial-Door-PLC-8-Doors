/**
 * Login страница - страница входа
 */

import { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import Button from '../components/common/Button';

const Login = () => {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await login(username, password);
      if (result.success) {
        navigate('/');
      } else {
        setError(result.error || 'Ошибка входа');
      }
    } catch (err) {
      setError(err.message || 'Ошибка подключения к серверу');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <div className="logo">
            <span className="logo-text">DCM</span>
            <span className="logo-subtitle">DOORS CONTROL MAKING</span>
          </div>
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          {error && (
            <div className="error" style={{ 
              padding: '10px', 
              marginBottom: '15px', 
              backgroundColor: '#ffebee', 
              border: '1px solid #f44336',
              borderRadius: '4px',
              color: '#c62828'
            }}>
              {error}
            </div>
          )}
          <div className="form-group">
            <label>Логин</label>
            <input
              type="text"
              className="form-control"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              required
              disabled={loading}
            />
          </div>
          <div className="form-group">
            <label>Пароль</label>
            <input
              type="password"
              className="form-control"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="admin"
              required
              disabled={loading}
            />
          </div>
          <Button 
            type="submit" 
            variant="primary" 
            disabled={loading}
            style={{ width: '100%', marginTop: '10px' }}
          >
            {loading ? 'Вход...' : 'Вход'}
          </Button>
          <div style={{ marginTop: '15px', fontSize: '12px', color: '#666', textAlign: 'center' }}>
            Для отладки: admin / admin
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
