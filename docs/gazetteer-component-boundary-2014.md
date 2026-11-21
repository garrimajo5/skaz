# Baldur’s Gate Gazetteer: отдельная выдача раздела — #77

[Отчёт](../catalog/gazetteer-component-boundary-2014.json): provider122 связан с отдельным Gazetteer-разделом в [оглавлении Descent into Avernus](https://www.dndbeyond.com/sources/dnd/bgdia), provider48. Уже существующий исторический parentsource126 только процитирован; ни122, ни совпавшее число126 из provider namespace не становятся историческим child ID.

Оглавление содержит отдельную Gazetteer-ссылку и её подраздел Character Backgrounds. Анонимный source122 перенаправил на [claim](https://www.dndbeyond.com/claim/source/baldurs-gate-gazetteer): в claim-main описаны город/персонажи и фоновые возможности, раздача завершена. Соседняя реклама всей книги с37монстрами/12предметами исключена из Gazetteer-данных. Это не поэлементный список новых фонов/правил и не полный текст раздела.

Повторно использован67-страничный AL Adaptation Guide v2.4: прочитана/отрендерена только новая применимая страница25. Узкая заметка относится к background features персонажей исторического Season9. Она не даёт всем персонажам автоматическую способность, не устанавливает сегодняшнюю глобальную AL-допустимость и не блокирует ручной выбор игрока. Связанная Sword of Zariel заметка не перенесена в фоновые правила.

```sh
python scripts/audit-gazetteer-component-2014.py <capture-folder> <retained-guide-folder> --output <report.json>
python -m unittest discover -s tests -p test_gazetteer_component_2014.py
```

10 тестов: own heading/fragment, чужой chapter/parent/advertisement, дубли, ended notice, граница AL/footer, различие namespace и SHA. HTML/SHA/redirect сохранены; вход/claim/настоящий профиль не использованы. Fulltext/version/rights/canonical units и независимая игровая приёмка открыты; accepted/complete=false/denominator=null. Приложение/VPS не менялись, выпуск неприменим. Следующий126 Lightning Keep.

Рефлексия content: отдельный claim-main предотвратил наследование счётчиков полной книги; переиспользование PDF исключило повторную загрузку. Предложениеplanner — сохранять различие generic offer versus checked record list, без расширения объёма принятого результата.
