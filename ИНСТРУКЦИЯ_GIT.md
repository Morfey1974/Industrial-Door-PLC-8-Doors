# Инструкция по настройке Git и выгрузке на GitHub

## Проблема

Проект не является git репозиторием. Есть файл `.gitignore`, но репозиторий не инициализирован.

## Решение

### Шаг 1: Инициализация git репозитория

```bash
cd "C:\Users\morfe\STM32CubeIDE\workspace_1.17.0\Industrial Door PLC"
git init
```

### Шаг 2: Настройка git (если еще не настроено)

```bash
git config --global user.name "Ваше Имя"
git config --global user.email "ваш.email@example.com"
```

### Шаг 3: Добавление файлов в репозиторий

```bash
git add .
git commit -m "Initial commit: Industrial Door PLC project"
```

### Шаг 4: Создание репозитория на GitHub

1. Зайдите на https://github.com
2. Нажмите "New repository" (или "+" → "New repository")
3. Назовите репозиторий (например, `Industrial-Door-PLC`)
4. **НЕ** добавляйте README, .gitignore или лицензию (они уже есть в проекте)
5. Выберите Public или Private
6. Нажмите "Create repository"

### Шаг 5: Добавление remote и выгрузка

После создания репозитория GitHub покажет инструкции. Выполните:

```bash
# Замените YOUR_USERNAME на ваш GitHub username и REPO_NAME на имя репозитория
git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git

# Переименуйте ветку в main (если нужно)
git branch -M main

# Выгрузите код на GitHub
git push -u origin main
```

**Если используете SSH:**
```bash
git remote add origin git@github.com:YOUR_USERNAME/REPO_NAME.git
git branch -M main
git push -u origin main
```

**Если используете Personal Access Token (рекомендуется для HTTPS):**
1. Создайте токен: GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. При запросе пароля введите токен вместо пароля

## Важные файлы для коммита

Убедитесь, что в `.gitignore` правильно настроены исключения для:
- `Debug/` - папка с объектными файлами
- `*.o`, `*.d` - объектные файлы и зависимости
- `.settings/` - настройки IDE
- Другие временные файлы

## Проблемы и решения

### Ошибка: "fatal: not a git repository"
**Решение**: Выполните `git init` в корневой папке проекта

### Ошибка: "remote origin already exists"
**Решение**: 
```bash
git remote remove origin
git remote add origin https://github.com/YOUR_USERNAME/Industrial-Door-PLC.git
```

### Ошибка: "Authentication failed"
**Решение**: 
- Для HTTPS: используйте Personal Access Token вместо пароля
- Для SSH: настройте SSH ключи

### Ошибка: "refusing to merge unrelated histories"
**Решение**:
```bash
git pull origin main --allow-unrelated-histories
```

## Рекомендации

1. **Делайте коммиты регулярно** после значительных изменений
2. **Используйте понятные сообщения коммитов**:
   - `git commit -m "Fix: исправлена проблема с долгим ответом /api/doors"`
   - `git commit -m "Add: добавлена команда mem stat для мониторинга памяти"`
3. **Не коммитьте**:
   - Временные файлы
   - Файлы сборки (Debug/)
   - Персональные настройки IDE

## Полезные команды

```bash
# Проверить статус
git status

# Посмотреть изменения
git diff

# Добавить все изменения
git add .

# Сделать коммит
git commit -m "Описание изменений"

# Выгрузить на GitHub
git push

# Получить изменения с GitHub
git pull
```
