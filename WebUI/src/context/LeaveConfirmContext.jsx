/**
 * Контекст подтверждения ухода со страницы при несохранённых изменениях (например, редактор маппинга).
 * Страница регистрирует проверку getIsDirty; при попытке перейти на другой маршрут через tryNavigate
 * показывается модальное окно.
 */

import { createContext, useContext, useRef, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Modal from '../components/common/Modal';

const LeaveConfirmContext = createContext(null);

export function LeaveConfirmProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const checkersRef = useRef(new Map()); // path -> getIsDirty
  const [modal, setModal] = useState({ show: false, pendingPath: null });

  const register = useCallback((path, getIsDirty) => {
    checkersRef.current.set(path, getIsDirty);
  }, []);

  const unregister = useCallback((path) => {
    checkersRef.current.delete(path);
  }, []);

  const tryNavigate = useCallback((nextPath) => {
    const currentPath = location.pathname;
    if (currentPath === nextPath) return;
    const getIsDirty = checkersRef.current.get(currentPath);
    if (getIsDirty?.()) {
      setModal({ show: true, pendingPath: nextPath });
      return;
    }
    navigate(nextPath);
  }, [location.pathname, navigate]);

  const proceed = useCallback(() => {
    const path = modal.pendingPath;
    setModal({ show: false, pendingPath: null });
    if (path) navigate(path);
  }, [modal.pendingPath, navigate]);

  const cancel = useCallback(() => {
    setModal({ show: false, pendingPath: null });
  }, []);

  const value = { tryNavigate, register, unregister };

  return (
    <LeaveConfirmContext.Provider value={value}>
      {children}
      <Modal
        isOpen={modal.show}
        type="confirm"
        title="Несохранённые изменения"
        message="В карте маппинга есть несохранённые изменения. Выйти без сохранения?"
        confirmText="Выйти"
        cancelText="Остаться"
        onConfirm={proceed}
        onCancel={cancel}
      />
    </LeaveConfirmContext.Provider>
  );
}

export function useLeaveConfirm() {
  const ctx = useContext(LeaveConfirmContext);
  if (!ctx) return { tryNavigate: null, register: () => {}, unregister: () => {} };
  return ctx;
}
