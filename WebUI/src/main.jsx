import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/main.css'

// Обработка ошибок рендеринга
try {
  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (error) {
  console.error('Ошибка рендеринга приложения:', error);
  document.getElementById('root').innerHTML = `
    <div style="padding: 20px; font-family: Arial;">
      <h1>Ошибка загрузки приложения</h1>
      <p>${error.message}</p>
      <p>Проверьте консоль браузера (F12) для подробностей</p>
    </div>
  `;
}
