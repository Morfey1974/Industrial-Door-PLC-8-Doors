# Быстрый старт

## Шаг 1: Проверка Node.js

Откройте терминал (PowerShell или Command Prompt) и выполните:

```bash
node --version
npm --version
```

Должны отобразиться версии. Если нет — установите Node.js с https://nodejs.org/

## Шаг 2: Установка зависимостей

В терминале перейдите в папку проекта:

```bash
cd "c:\Users\morfe\STM32CubeIDE\workspace_1.17.0\Industrial Door PLC\WebUI"
```

Установите зависимости:

```bash
npm install
```

Это займет 2-5 минут.

## Шаг 3: Запуск проекта

```bash
npm run dev
```

Браузер откроется автоматически на `http://localhost:3000`

## Шаг 4: Открытие в Visual Studio

### Visual Studio 2022:
1. **Файл → Открыть → Папка**
2. Выберите папку `WebUI`
3. Готово!

### Visual Studio Code:
1. **Файл → Открыть папку**
2. Выберите папку `WebUI`
3. Готово!

## Что дальше?

1. Изучите структуру проекта в `src/`
2. Следуйте плану разработки в `../План_UI.md`
3. Начните с создания компонентов layout (Header, Sidebar, Tabs)

## Полезные команды

```bash
npm run dev      # Запуск dev-сервера
npm run build    # Сборка для продакшена
npm run preview  # Предпросмотр собранной версии
```

## Проблемы?

См. подробную инструкцию в `INSTALL_VS.md`
