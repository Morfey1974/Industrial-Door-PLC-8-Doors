# Отладка пустого экрана в браузере

## Шаг 1: Проверьте консоль браузера

1. Откройте DevTools (F12 или Ctrl+Shift+I)
2. Перейдите на вкладку **Console**
3. Посмотрите на ошибки (они будут красным цветом)

## Шаг 2: Проверьте терминал

В терминале, где запущен `npm run dev`, должны быть сообщения об ошибках компиляции.

## Шаг 3: Типичные ошибки и решения

### Ошибка: "Cannot find module"
**Решение:** Выполните `npm install` в папке WebUI

### Ошибка: "Failed to resolve import"
**Решение:** Проверьте пути импортов в файлах

### Ошибка: "useNavigate must be used within a Router"
**Решение:** Убедитесь, что компонент обернут в `<Router>`

### Ошибка: "Cannot read property of undefined"
**Решение:** Проверьте, что данные загружены перед использованием

## Шаг 4: Временное решение - упрощенная версия

Если ничего не помогает, можно временно упростить App.jsx:

```jsx
function App() {
  return (
    <div>
      <h1>Test</h1>
      <p>Если это видно - React работает</p>
    </div>
  );
}
```

Если это работает, значит проблема в компонентах или роутинге.

## Шаг 5: Проверьте файлы

Убедитесь, что все файлы созданы:
- `src/App.jsx`
- `src/main.jsx`
- `src/components/layout/Header.jsx`
- `src/components/layout/Sidebar.jsx`
- `src/components/layout/Tabs.jsx`
- `src/components/layout/Layout.jsx`

## Шаг 6: Перезапустите сервер

1. Остановите сервер (Ctrl+C)
2. Удалите папку `node_modules` и `package-lock.json`
3. Выполните `npm install`
4. Запустите `npm run dev` снова
