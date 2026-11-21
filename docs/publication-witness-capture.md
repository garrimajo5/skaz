# Захват публичных источников без потери частичных квитанций

Утилита `scripts/capture-publication-witnesses.py` исправляет обнаруженный в #77 сбой пакетной загрузки. Каждый ресурс получает атомарные started/header/final sidecar-квитанции. Timeout или IncompleteRead соседа не отменяет уже сохранённые тела и итоговый частичный capture.json. Ошибочный HTTP-ответ закрывается;403 сохраняется без повторной попытки и без копирования error-body.

План — JSON-массив объектов с `file` и `url`. Разрешены только перечисленные публичные publisher HTTPS-хосты на443, без credentials и токенов; редиректы проверяются той же границей. Файлы имеют безопасные уникальные имена, папка новая/пустая и вне репозитория. Auth/cookies/микрофон/новые порты не поддерживаются. Ограничены число ресурсов, workers, байты и timeout; бюджет общего чтения проверяется между read1-chunks, это не обещание прервать любой системный вызов строго по таймеру.

```sh
python scripts/capture-publication-witnesses.py <explicit-plan.json> <new-external-folder>
```

Код возврата0 — все тела получены;2 — частичный результат. Только outcome=complete содержит bodyFile/bytes/SHA. Сохранённый200 в headers-received/capture-error не означает наличие полного тела. started/header receipts остаются полезными и при обрыве. Утилита не читает профиль, не выполняет claim, не считает права/канонизацию установленными и не создаёт очередь обхода сайта.

8тестов на вымышленных ответах проверили timeout, IncompleteRead,403, сохранение успешного соседа, byte/deadline budgets, запрет перезаписи/неверных путей и targets. IncompleteRead сначала воспроизвёл отмену итогового манифеста; обработчик исправлен, тест прошёл. Живого сетевого прогона новой утилиты в этом блоке не было. Старые Stormwreck HTTP-квитанции не реконструированы.

Решение planner: испытать эту утилиту на следующем разрешённом новом источнике, без повторного скачивания уже принятого. Критерий — при частичном сбое сохраняется каждый успешный receipt, неизвестные поля не выдумываются. Общие разрешения и инструкции не меняются.

Reviewer regressions: reserved `capture.json` fails before network/files; a declared Content-Length must match the body at EOF before any body/SHA is accepted. The regression uses a real stdlib HTTPResponse with a truncated body, without network.
