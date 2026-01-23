/**
 * useAuth хук - для работы с аутентификацией
 * Будет реализован после этапа 9.5
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
