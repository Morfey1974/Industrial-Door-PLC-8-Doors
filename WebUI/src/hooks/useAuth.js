/**
 * useAuth — доступ к AuthContext (user, isAuthenticated, loading). Отдельной формы входа в приложении нет.
 */

import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';

const useAuth = () => {
  const context = useContext(AuthContext);
  
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  
  return context;
};

export default useAuth;
