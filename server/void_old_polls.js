// Закрытие «без результата» опросов, приехавших со старого WordPress и оставшихся без ответа.
//
// Зачем. После close_polls_from_wp.js в приложении не осталось ни одного опроса, для которого на
// старом сайте был объявлен верный вариант. Но часть перенесённых опросов не была завершена и там:
// по учёту самого WordPress (таблица wp_poll_points, колонка `wait`) 773 голоса от 36 человек
// ждали результата, которого так и не будет. В приложении они висели открытыми и портили и ленту
// «незавершённых», и плитку «ждут результата» в профиле.
//
// Верного варианта для них нет ни в одной таблице, поэтому «завершить» их обычным способом
// невозможно: пришлось бы назначить победителя произвольно и раздать за это баллы. Вместо этого
// опрос помечается как закрытый без результата — is_resolved = 1, is_void = 1,
// correct_option_id остаётся NULL.
//
// Что это значит для людей: голосование закрыто, баллы не начисляются и не отнимаются, а голос в
// таком опросе не считается ни верным, ни ошибочным — точность прогнозов от него не меняется.
//
// Операция обратима: экономика не затронута, а если исход какого-то события всё-таки станет
// известен, опрос можно завершить по-настоящему через обычное «выбрать верный вариант» — сервер
// такой переход из аннулированного состояния разрешает и снимает флаг.
//
// Опросы, заведённые в самом приложении, не трогаются никогда: у них news.wp_post_id IS NULL,
// и это единственный критерий отбора — никаких дат и эвристик.
//
// Запуск:
//   node void_old_polls.js [--apply]
// Без --apply это сухой прогон: всё считается и печатается, но транзакция откатывается.

const db = require('./database');

const sqlite = db.db;
const run = (sql, params = []) => sqlite.prepare(sql).run(...params);
const get = (sql, params = []) => sqlite.prepare(sql).get(...params);
const all = (sql, params = []) => sqlite.prepare(sql).all(...params);

function main() {
    const apply = process.argv.includes('--apply');

    // Отбор: открытый опрос, чья новость приехала со старого сайта. wp_post_id проставляют только
    // скрипты переноса — эндпоинт создания новости эту колонку не пишет вовсе, поэтому всё, что
    // опубликовано с нового сайта, сюда не попадает по построению.
    const targets = all(
        `SELECT p.id, p.question, p.ends_at, n.wp_post_id,
                (SELECT COUNT(*) FROM votes v WHERE v.poll_id = p.id) AS votes
           FROM polls p
           JOIN news n ON n.id = p.news_id
          WHERE p.is_resolved = 0 AND n.wp_post_id IS NOT NULL
          ORDER BY p.id`
    );

    const appPolls = get(
        `SELECT COUNT(*) AS n
           FROM polls p LEFT JOIN news n ON n.id = p.news_id
          WHERE p.is_resolved = 0 AND (n.wp_post_id IS NULL OR n.id IS NULL)`
    ).n;

    const today = new Date().toISOString().slice(0, 10);
    const withDeadlineRunning = targets.filter((t) => String(t.ends_at || '').trim() && String(t.ends_at).trim() > today).length;
    const withDeadlinePassed = targets.filter((t) => String(t.ends_at || '').trim() && String(t.ends_at).trim() <= today).length;
    const withoutDeadline = targets.filter((t) => !String(t.ends_at || '').trim()).length;
    const withVotes = targets.filter((t) => t.votes > 0).length;
    const affectedVotes = targets.reduce((sum, t) => sum + t.votes, 0);

    console.log('=== Что будет закрыто без результата ===');
    console.log(`Опросов со старого сайта: ${targets.length}`);
    console.log(`  без срока голосования: ${withoutDeadline}`);
    console.log(`  срок ещё не вышел: ${withDeadlineRunning}`);
    console.log(`  срок вышел: ${withDeadlinePassed}`);
    console.log(`  из них с голосами: ${withVotes} (всего голосов затронуто: ${affectedVotes})`);
    console.log(`Опросов нового сайта — не трогаем: ${appPolls}`);
    console.log('Баллы не начисляются и не отнимаются; точность прогнозов не меняется.');

    const stats = { voided: 0 };

    sqlite.exec('PRAGMA busy_timeout = 15000');
    sqlite.exec('BEGIN IMMEDIATE');
    try {
        for (const poll of targets) {
            // resolved_by остаётся NULL: опрос закрыт разбором данных, а не решением конкретного
            // администратора, и подставлять чьё-то имя значило бы соврать в служебной строке.
            const info = run(
                `UPDATE polls
                    SET is_resolved = 1, is_void = 1, correct_option_id = NULL,
                        resolved_at = CURRENT_TIMESTAMP
                  WHERE id = ? AND is_resolved = 0`,
                [poll.id]
            );
            stats.voided += info.changes;
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
        polls_resolved_with_winner: get('SELECT COUNT(*) AS n FROM polls WHERE is_resolved = 1 AND correct_option_id IS NOT NULL').n,
        polls_void: get('SELECT COUNT(*) AS n FROM polls WHERE is_void = 1').n,
        votes_waiting: get('SELECT COUNT(*) AS n FROM votes v JOIN polls p ON p.id = v.poll_id WHERE p.is_resolved = 0').n,
    }));
}

db.ready
    .then(() => {
        main();
    })
    .catch((error) => {
        console.error('Аннулирование не выполнено:', error.message);
        process.exitCode = 1;
    })
    .finally(() => {
        db.close(() => { });
    });
