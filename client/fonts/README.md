# Локальные шрифты

Inter (variable 400–800) и PT Serif (400, 700), латиница и кириллица.
Получены 08.11.2026 через официальный Google Fonts CSS API. Исходные URL,
версии в URL и SHA-256 каждого неизменённого WOFF2 записаны в manifest.json.
Лицензии SIL OFL 1.1 приложены отдельно; авторство сохранено. Шрифты не
переименовывались и не модифицировались. Inter: https://github.com/rsms/inter,
PT Serif: https://github.com/google/fonts/tree/main/ofl/ptserif.

Приложение запрашивает только локальные /fonts/*.woff2. Автономная сборка
skaz.html встраивает те же байты как data URLs. Для других алфавитов остаётся
системный fallback. Сеть для получения шрифтов во время игры не нужна.
