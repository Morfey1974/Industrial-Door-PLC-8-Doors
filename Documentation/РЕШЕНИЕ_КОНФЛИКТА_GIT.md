# Решение конфликта при push на GitHub

## Проблема

При попытке `git push` возникла ошибка:
```
main → main [rejected - non-fast-forward]
```

## Причина

Локальная ветка и удаленная ветка разошлись:
- **Локально**: 4 новых коммита (включая исправления api/doors, мониторинг памяти)
- **На GitHub**: 2 старых коммита (увеличение буфера, проверка Ethernet)

## Решение

### Вариант 1: Force push (если локальные изменения важнее) ⚠️

**ВНИМАНИЕ:** Это перезапишет удаленный репозиторий. Используйте только если уверены, что локальные изменения важнее.

```bash
git push origin main --force
```

или более безопасный вариант:
```bash
git push origin main --force-with-lease
```

### Вариант 2: Разрешить конфликты вручную (рекомендуется)

1. **Сделать pull с merge:**
   ```bash
   git pull origin main --no-rebase
   ```

2. **Разрешить конфликты в файлах:**
   - `App/system/http_api.c`
   - `App/system/http_server.c`
   - `App/system/http_server.h`
   - `Core/Src/freertos.c`
   - `Industrial Door PLC.ioc`
   - `LWIP/Target/ethernetif.c`

3. **После разрешения конфликтов:**
   ```bash
   git add .
   git commit -m "Merge: объединение локальных и удаленных изменений"
   git push origin main
   ```

### Вариант 3: Создать новую ветку для локальных изменений

```bash
git checkout -b local-changes
git push origin local-changes
# Затем на GitHub создать Pull Request для слияния
```

## Рекомендация

Если локальные изменения включают все исправления (исправление api/doors, мониторинг памяти, увеличение стека httpTask), то **Вариант 1 (force push)** будет самым простым решением.

## Текущий статус

Merge отменен. Готов к выбору варианта решения.
