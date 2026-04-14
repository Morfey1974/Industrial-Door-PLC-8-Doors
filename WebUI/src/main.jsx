import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { LanguageProvider } from './context/LanguageContext'
import './styles/main.css'

// Обработка ошибок рендеринга
try {
  const root = ReactDOM.createRoot(document.getElementById('root'));
  /*
   * Без StrictMode в dev: при двойном mount/unmount React 18 вызывает cleanup useApi,
   * который делает AbortController.abort() — рвётся исходящий TCP прокси Vite → МК,
   * в логе Node «read ECONNRESET», на МК лишняя нагрузка lwIP. Продакшен-сборка не
   * дублирует эффекты; для однопоточного HTTP на контроллере стабильнее без StrictMode.
   */
  root.render(
    <LanguageProvider>
      <App />
    </LanguageProvider>
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
