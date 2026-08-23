// Закрытие опросов, которые уже завершены на старом WordPress, но остались открытыми в приложении.
//
// Откуда взялось расхождение. Первый перенос (12.07.2026) проставил верные ответы всем опросам,
// у которых они на тот момент были. Дальше редакция продолжала закрывать опросы на старом сайте,
// а догрузка (scripts/wp_delta_extract.py → import_wp_delta.js) переносит только НОВЫЕ посты:
// она фильтрует correctAnswers по списку догружаемых id, поэтому ответы, проставленные на WP уже
// после первого переноса для ранее перенесённых постов, в приложение не попадали никогда.
//
// Что делает скрипт: берёт свежий дамп, находит опросы, закрытые на WP и открытые здесь, и
// закрывает их — с начислением баллов по формуле приложения.
//
// Почему по формуле приложения, а не переносом строк points_history из WP. После 12.07 в
// приложении появились собственные голоса (на момент написания — 215 штук). Формула считает баллы
// от доли угадавших, поэтому WP-начисление, посчитанное без этих голосов, было бы неверным именно
// для тех, кто голосовал уже здесь.
//
// Двойного начисления не происходит: строки points_history, которые WP записал после 12.07, в
// приложение не переносились (5347 при переносе против 5367 сейчас — прирост дали собственные
// завершения). На всякий случай перед начислением каждому проверяется, нет ли уже записи об этом
// опросе — идемпотентность важнее скорости.
//
// Соответствие вариантов. В WP вариант опознаётся числом (counter), в приложении — id строки
// poll_options. Перенос вставлял варианты по возрастанию counter, поэтому связь позиционная. Но
// опрос могли править уже в приложении, и тогда позиция ничего не значит — поэтому перед
// закрытием сверяются ВСЕ тексты вариантов и отдельно текст верного ответа. Любое расхождение —
// опрос пропускается и попадает в отчёт: закрыть не тот вариант хуже, чем не закрыть вовсе.
//
// Запуск:
//   node close_polls_from_wp.js <answers.json> [--apply]
// Без --apply это сухой прогон: всё считается и печатается, но транзакция откатывается.
// JSON готовит scripts/extract_wp_answers.py.

const fs = require('fs');
const path = require('path');
const db = require('./database');
const { calculateLevel, DEFAULT_POINTS_SETTINGS } = require('./wordpress_sync');

// Обёртка sqlite.js не отдаёт lastInsertRowid/changes — берём исходный дескриптор
// better-sqlite3 (то же соединение, полный API).
const sqlite = db.db;
const run = (sql, params = []) => sqlite.prepare(sql).run(...params);
const get = (sql, params = []) => sqlite.prepare(sql).get(...params);
const all = (sql, params = []) => sqlite.prepare(sql).all(...params);

// Тексты сравниваются нормализованными: перенос уже прогонял их через sanitizeText (схлопывание
// пробелов), а в дампе попадаются неразрывные пробелы и разные виды кавычек и тире. Считать такие
// пары разными — значит отбросить сотню опросов из-за типографики.
const normalize = (value) => String(value || '')
    .replace(/ /g, ' ')
    .replace(/[«»“”„]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

function getPointsSettings() {
    const row = get('SELECT start_points, wins_points, level_points FROM points_settings WHERE id = 1');
    return {
        wins_points: Number(row?.wins_points) || DEFAULT_POINTS_SETTINGS.wins_points,
    };
}

// Та же формула, что в /api/polls/:id/resolve: чем реже угаданный вариант, тем дороже он стоит.
function calculateAward(settings, winnersCount, totalVotes) {
    if (totalVotes <= 0 || winnersCount <= 0) return 0;
    const rarityCoefficient = (winnersCount / totalVotes) * 100;
    return Math.max(0, Math.floor(settings.wins_points + (100 - rarityCoefficient)));
}

// Дата закрытия с WP. '0000-00-00 00:00:00' там означает «не заполнено», а не начало времён:
// такую дату нельзя писать в resolved_at, иначе опрос окажется завершённым в нулевом году.
function wpFinishDate(value) {
    const raw = String(value || '').trim();
    if (!raw || raw.startsWith('0000-00-00')) return null;
    const parsed = new Date(raw.replace(' ', 'T') + 'Z');
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString().slice(0, 19).replace('T', ' ');
}

function main() {
    const jsonPath = process.argv[2];
    const apply = process.argv.includes('--apply');

    if (!jsonPath) {
        console.error('Usage: node close_polls_from_wp.js <answers.json> [--apply]');
        process.exitCode = 1;
        return;
    }

    const payload = JSON.parse(fs.readFileSync(path.resolve(jsonPath), 'utf8'));
    const wpPolls = payload.polls || {};
    console.log(`Дамп: ${payload.dumpCompletedAt || 'дата не указана'}; постов с вариантами: ${Object.keys(wpPolls).length}`);

    const settings = getPointsSettings();
    console.log(`Ставка за победу (wins_points): ${settings.wins_points}`);

    // Незавершённые опросы вместе с их постом на старом сайте. wp_post_id проставлен догрузкой
    // задним числом; там, где его нет, опираться не на что — такие в отчёт как 'no-wp-id'.
    const pending = all(
        `SELECT p.id, p.news_id, p.question, p.ends_at, n.wp_post_id, n.created_at
           FROM polls p
           LEFT JOIN news n ON n.id = p.news_id
          WHERE p.is_resolved = 0
          ORDER BY p.id`
    );

    console.log(`Незавершённых опросов в базе: ${pending.length}`);

    const plan = [];
    const skipped = [];

    // Граница по дате дампа: всё, что появилось позже, физически не может быть в нём завершено.
    // Дубль к проверке wp_post_id, и намеренный: цена ошибки — закрытый чужими руками живой опрос
    // с начислением баллов, отменить которое нечем.
    const dumpDate = String(payload.dumpCompletedAt || '').slice(0, 10) || null;

    for (const poll of pending) {
        // Опросы, заведённые в самом приложении, не трогаем никогда. wp_post_id проставляют только
        // скрипты переноса (wordpress_sync.js и import_wp_delta.js); эндпоинт создания новости в
        // index.js эту колонку не пишет вовсе, поэтому у всего, что опубликовано с нового сайта,
        // здесь NULL — и такой опрос до сверки с дампом просто не доходит.
        const wpId = Number(poll.wp_post_id) || null;
        if (!wpId) {
            skipped.push({ pollId: poll.id, reason: 'app-created', detail: 'опубликован с нового сайта — не трогаем' });
            continue;
        }

        const createdAt = String(poll.created_at || '').slice(0, 10);
        if (dumpDate && createdAt && createdAt > dumpDate) {
            skipped.push({
                pollId: poll.id, wpId, reason: 'newer-than-dump',
                detail: `создан ${createdAt}, дамп от ${dumpDate}`,
            });
            continue;
        }

        const wp = wpPolls[String(wpId)];
        if (!wp) {
            skipped.push({ pollId: poll.id, wpId, reason: 'no-wp-poll', detail: 'поста нет в дампе' });
            continue;
        }
        if (!wp.correct) {
            skipped.push({ pollId: poll.id, wpId, reason: 'not-resolved-on-wp', detail: 'на старом сайте тоже не завершён' });
            continue;
        }

        const correctCounter = Number(wp.correct.counter);
        const declaredText = String(wp.correct.text || '').trim();

        // counter = 0 встречается у самых старых опросов: поле появилось позже, чем сами опросы.
        // Такой опрос ещё можно спасти, если текст верного ответа заполнен и совпадает ровно с
        // одним вариантом — точное совпадение текста доказывает не меньше, чем номер.
        const counterUsable = Number.isFinite(correctCounter) && correctCounter > 0;
        if (!counterUsable && !declaredText) {
            skipped.push({ pollId: poll.id, wpId, reason: 'bad-counter', detail: `counter=${wp.correct.counter}, текст ответа пуст` });
            continue;
        }

        const dbOptions = all('SELECT id, text FROM poll_options WHERE poll_id = ? ORDER BY id', [poll.id]);
        const wpOptions = wp.options || [];

        if (dbOptions.length === 0) {
            skipped.push({ pollId: poll.id, wpId, reason: 'no-options', detail: 'в базе нет вариантов' });
            continue;
        }

        let correctOption;

        if (counterUsable) {
            // Путь через counter опирается на позицию, поэтому списки вариантов должны совпадать
            // целиком: и по количеству, и по текстам. Иначе номер указывает не на ту строку.
            // Опрос могли править уже в приложении — тогда позиция ничего не значит.
            if (dbOptions.length !== wpOptions.length) {
                skipped.push({
                    pollId: poll.id, wpId, reason: 'option-count-mismatch',
                    detail: `в базе ${dbOptions.length}, в дампе ${wpOptions.length}`,
                });
                continue;
            }

            const mismatch = dbOptions.findIndex((opt, i) => normalize(opt.text) !== normalize(wpOptions[i].text));
            if (mismatch !== -1) {
                skipped.push({
                    pollId: poll.id, wpId, reason: 'option-text-mismatch',
                    detail: `#${mismatch + 1}: база "${dbOptions[mismatch].text}" ≠ дамп "${wpOptions[mismatch].text}"`,
                });
                continue;
            }

            const correctIndex = wpOptions.findIndex((o) => Number(o.counter) === correctCounter);
            if (correctIndex === -1) {
                skipped.push({
                    pollId: poll.id, wpId, reason: 'counter-not-in-options',
                    detail: `counter=${correctCounter}, есть ${wpOptions.map((o) => o.counter).join(',')}`,
                });
                continue;
            }
            correctOption = dbOptions[correctIndex];

            // Вторая, независимая проверка: в wp_poll_correct_answers лежит ещё и текст верного
            // ответа. Там, где он заполнен, он должен совпасть с тем, на что указал counter, —
            // иначе одно из двух полей на старом сайте протухло, и доверять нельзя ни одному.
            if (declaredText && normalize(declaredText) !== normalize(correctOption.text)) {
                skipped.push({
                    pollId: poll.id, wpId, reason: 'correct-text-mismatch',
                    detail: `counter → "${correctOption.text}", в таблице ответов "${declaredText}"`,
                });
                continue;
            }
        } else {
            // Опознание по тексту. Требуется ровно одно совпадение: два одинаковых варианта
            // означают, что выбрать между ними нечем.
            const matches = dbOptions.filter((o) => normalize(o.text) === normalize(declaredText));
            if (matches.length !== 1) {
                skipped.push({
                    pollId: poll.id, wpId, reason: 'text-match-ambiguous',
                    detail: `"${declaredText}" совпал с ${matches.length} вариантами`,
                });
                continue;
            }
            correctOption = matches[0];
        }

        const totalVotes = Number(get('SELECT COUNT(*) AS n FROM votes WHERE poll_id = ?', [poll.id]).n) || 0;
        const winners = all('SELECT user_id FROM votes WHERE poll_id = ? AND option_id = ?', [poll.id, correctOption.id]);
        const award = calculateAward(settings, winners.length, totalVotes);

        // Кому баллы за этот опрос уже начислены (перенос points_history из WP или прошлый
        // прогон). Считается здесь, а не только при записи, чтобы отчёт до записи называл ту же
        // сумму, что реально уйдёт людям: иначе он обещает больше, чем скрипт начислит.
        //
        // Шаблон заканчивается номером без хвостового `%` — и это не придирка. Номер опроса стоит
        // в конце комментария («…в опросе № 1723»), и `LIKE '%№ 1723%'` поймал бы заодно строку про
        // опрос 17239. В базе такая пара есть: пользователь 70 с записью про 17239 оказался бы
        // «уже награждённым» за 1723 и молча остался бы без баллов. Проверено: все начисления за
        // опросы оканчиваются номером, а комментарии без номера — это регистрация и призы.
        const winnerIds = winners.map((w) => Number(w.user_id)).filter(Boolean);
        const toCredit = [];
        const alreadyCredited = [];
        for (const userId of winnerIds) {
            const already = get(
                "SELECT 1 AS ok FROM points_history WHERE user_id = ? AND comment LIKE '%опросе № ' || ?",
                [userId, String(poll.id)]
            );
            (already ? alreadyCredited : toCredit).push(userId);
        }

        plan.push({
            poll,
            wpId,
            correctOptionId: correctOption.id,
            correctText: correctOption.text,
            resolvedAt: wpFinishDate(wp.correct.data_finish),
            totalVotes,
            winners: winnerIds,
            toCredit,
            alreadyCredited,
            award,
        });
    }

    // --- Отчёт до записи -----------------------------------------------------------------
    const byReason = skipped.reduce((acc, s) => {
        acc[s.reason] = (acc[s.reason] || 0) + 1;
        return acc;
    }, {});

    const affectedUsers = new Set();
    let totalPoints = 0;
    let skippedCredits = 0;
    for (const item of plan) {
        if (item.award <= 0) continue;
        skippedCredits += item.alreadyCredited.length;
        for (const userId of item.toCredit) {
            affectedUsers.add(userId);
            totalPoints += item.award;
        }
    }

    const createdDates = plan.map((p) => String(p.poll.created_at || '').slice(0, 10)).filter(Boolean).sort();

    console.log('\n=== Что будет закрыто ===');
    console.log(`Опросов к закрытию: ${plan.length}`);
    if (createdDates.length > 0) {
        console.log(`  все они со старого сайта, созданы с ${createdDates[0]} по ${createdDates[createdDates.length - 1]}`);
    }
    console.log(`  из них с голосами: ${plan.filter((p) => p.totalVotes > 0).length}`);
    console.log(`  без единого голоса (баллы не начисляются): ${plan.filter((p) => p.totalVotes === 0).length}`);
    console.log(`Пользователей получат баллы: ${affectedUsers.size}`);
    console.log(`Всего баллов будет начислено: ${totalPoints.toLocaleString('ru-RU')}`);
    if (skippedCredits > 0) {
        console.log(`Начислений пропущено (баллы за этот опрос человек уже получил): ${skippedCredits}`);
    }

    console.log('\n=== Что пропущено ===');
    console.log(`Пропущено опросов: ${skipped.length}`);
    const protectedCount = skipped.filter((x) => x.reason === 'app-created' || x.reason === 'newer-than-dump').length;
    console.log(`  из них опросов нового сайта (остаются открытыми): ${protectedCount}`);
    for (const [reason, count] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${reason}: ${count}`);
    }

    // Расхождения показываем поимённо: это ровно те случаи, где машина отказалась решать за
    // человека, и разбирать их придётся вручную.
    const mismatches = skipped.filter((s) => s.reason.includes('mismatch') || s.reason.includes('ambiguous') || s.reason === 'bad-counter' || s.reason === 'counter-not-in-options');
    if (mismatches.length > 0) {
        console.log('\n--- Расхождения (требуют ручной проверки) ---');
        for (const item of mismatches) {
            console.log(`  опрос ${item.pollId} (wp ${item.wpId}) — ${item.reason}: ${item.detail}`);
        }
    }

    // --- Запись --------------------------------------------------------------------------
    const stats = { resolved: 0, awarded: 0, alreadyCredited: 0, pointsGiven: 0 };

    sqlite.exec('PRAGMA busy_timeout = 15000');
    sqlite.exec('BEGIN IMMEDIATE');
    try {
        for (const item of plan) {
            // resolved_by остаётся NULL: опрос закрыт переносом, а не конкретным администратором,
            // и подставлять чьё-то имя — значит соврать во вкладке «кто завершил».
            run(
                `UPDATE polls
                    SET correct_option_id = ?, is_resolved = 1, resolved_at = COALESCE(?, CURRENT_TIMESTAMP)
                  WHERE id = ? AND is_resolved = 0`,
                [item.correctOptionId, item.resolvedAt, item.poll.id]
            );
            stats.resolved += 1;

            if (item.award <= 0) continue;

            stats.alreadyCredited += item.alreadyCredited.length;

            // Списки посчитаны на этапе планирования — там же, где считался отчёт, поэтому
            // напечатанные цифры и записанное всегда совпадают.
            for (const userId of item.toCredit) {
                run('UPDATE users SET points = points + ? WHERE id = ?', [item.award, userId]);
                const updated = get('SELECT points FROM users WHERE id = ?', [userId]);
                run('UPDATE users SET level = ? WHERE id = ?', [calculateLevel(updated?.points || 0), userId]);
                run(
                    `INSERT INTO points_history (user_id, points, calculation_date, comment, kind)
                     VALUES (?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, 'poll')`,
                    [userId, item.award, item.resolvedAt, `Начисление баллов за победу в опросе № ${item.poll.id}`]
                );
                stats.awarded += 1;
                stats.pointsGiven += item.award;
            }
        }

        if (apply) {
            sqlite.exec('COMMIT');
            console.log('\n=== ЗАПИСАНО ===');
        } else {
            sqlite.exec('ROLLBACK');
            console.log('\n=== СУХОЙ ПРОГОН: изменения откачены (для записи добавьте --apply) ===');
        }
    } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
    }

    console.log(JSON.stringify(stats, null, 2));
    console.log('Итог по базе:', JSON.stringify({
        polls_open: get('SELECT COUNT(*) AS n FROM polls WHERE is_resolved = 0').n,
        polls_resolved: get('SELECT COUNT(*) AS n FROM polls WHERE is_resolved = 1').n,
        points_history: get('SELECT COUNT(*) AS n FROM points_history').n,
    }));
}

db.ready
    .then(() => {
        main();
    })
    .catch((error) => {
        console.error('Закрытие опросов не выполнено:', error.message);
        process.exitCode = 1;
    })
    .finally(() => {
        db.close(() => { });
    });
