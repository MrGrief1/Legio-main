#!/usr/bin/env python3
"""Собирает список новостей старого сайта, которых ещё нет в приложении.

Тексты, заголовки, даты, теги, категории и картинки берутся из WP REST API — там они уже
разобраны и совпадают с тем, что положил в базу первый перенос (проверено на посте 18457).
Из SQL-дампа читается только то, чего REST не отдаёт: поля опроса (ACF) и таблица правильных
ответов. Это короткие значения без HTML, поэтому разбор дампа остаётся простым.

    python3 scripts/wp_delta_extract.py \
        --dump ~/Documents/legio-old/database/cs01478_wp_2026-08-18_1915.sql \
        --existing-ids /tmp/prod_news_ids.txt \
        --out /tmp/wp_delta.json

Результат скармливается server/import_wp_delta.js.
"""

import argparse
import html
import json
import re
import subprocess
import sys

POLL_META_KEYS = {'question', 'istochnik', 'okonchanie_oprosa'}
ANSWER_META = re.compile(r'^answers_\d+_(answer|counter)$')


def split_tuples(payload):
    """Режет "(...),(...)" из INSERT ... VALUES на списки полей, не ломаясь на кавычках внутри строк."""
    i, n = 0, len(payload)
    while i < n:
        while i < n and payload[i] != '(':
            i += 1
        if i >= n:
            return
        i += 1
        fields, cur, in_str, esc = [], [], False, False
        while i < n:
            c = payload[i]
            if in_str:
                if esc:
                    cur.append(c)
                    esc = False
                elif c == '\\':
                    cur.append(c)
                    esc = True
                elif c == "'":
                    in_str = False
                    cur.append(c)
                else:
                    cur.append(c)
            else:
                if c == "'":
                    in_str = True
                    cur.append(c)
                elif c == ',':
                    fields.append(''.join(cur))
                    cur = []
                elif c == ')':
                    fields.append(''.join(cur))
                    i += 1
                    break
                else:
                    cur.append(c)
            i += 1
        yield fields


# mysqldump экранирует значения обратным слэшем, а не удвоением кавычки.
BACKSLASH_ESCAPES = {
    '0': '\0', 'n': '\n', 'r': '\r', 't': '\t', 'b': '\b',
    'Z': '\x1a', '\\': '\\', "'": "'", '"': '"',
}


def unescape(raw):
    value = raw.strip()
    if value == 'NULL':
        return None
    if not (value.startswith("'") and value.endswith("'") and len(value) >= 2):
        return value
    body = value[1:-1]
    out, i = [], 0
    while i < len(body):
        c = body[i]
        if c == '\\' and i + 1 < len(body):
            nxt = body[i + 1]
            out.append(BACKSLASH_ESCAPES.get(nxt, nxt))
            i += 2
            continue
        out.append(c)
        i += 1
    return ''.join(out)


def scan_dump(path):
    published, poll_meta_rows, correct_answers = set(), [], []
    dump_completed_at = None

    with open(path, 'r', encoding='utf-8', errors='replace') as fh:
        for line in fh:
            if line.startswith('INSERT INTO `wp_posts`'):
                for f in split_tuples(line.split(' VALUES ', 1)[1]):
                    if len(f) < 21:
                        continue
                    if unescape(f[20]) == 'post' and unescape(f[7]) == 'publish':
                        published.add(int(f[0].strip()))
            elif line.startswith('INSERT INTO `wp_postmeta`'):
                for f in split_tuples(line.split(' VALUES ', 1)[1]):
                    if len(f) < 4:
                        continue
                    key = unescape(f[2])
                    if key in POLL_META_KEYS or (key and ANSWER_META.match(key)):
                        poll_meta_rows.append({
                            'post_id': int(f[1].strip()),
                            'meta_key': key,
                            'meta_value': unescape(f[3]),
                        })
            elif line.startswith('INSERT INTO `wp_poll_correct_answers`'):
                for f in split_tuples(line.split(' VALUES ', 1)[1]):
                    if len(f) < 3:
                        continue
                    try:
                        correct_answers.append({
                            'post_id': int(unescape(f[1])),
                            'correct_answer_counter': int(unescape(f[2])),
                        })
                    except (TypeError, ValueError):
                        continue
            elif line.startswith('-- Dump completed on'):
                dump_completed_at = line.split('-- Dump completed on', 1)[1].strip()

    # ACF копирует поля опроса в ревизии, поэтому мета есть и у постов, которых в ленте нет.
    poll_meta_rows = [row for row in poll_meta_rows if row['post_id'] in published]
    return published, poll_meta_rows, correct_answers, dump_completed_at


def fetch_rest(host, ids):
    """Тянет посты по id пачками. Домен уже указывает на новое приложение, поэтому обращаемся
    по IP старого сервера с нужным Host — так же, как это делает прокси картинок."""
    posts = []
    batch = 40
    for start in range(0, len(ids), batch):
        chunk = ids[start:start + batch]
        url = ('https://legio.news/wp-json/wp/v2/posts'
               f'?include={",".join(str(i) for i in chunk)}&per_page={len(chunk)}&_embed=wp:term,wp:featuredmedia')
        result = subprocess.run(
            ['curl', '-sk', '-m', '90', '--resolve', f'legio.news:443:{host}', url],
            capture_output=True, text=True, check=True,
        )
        data = json.loads(result.stdout)
        if not isinstance(data, list):
            raise SystemExit(f'REST вернул не список: {str(data)[:200]}')

        for item in data:
            embedded = item.get('_embedded') or {}
            terms = embedded.get('wp:term') or []
            category, tags = 'general', []
            for group in terms:
                for term in group or []:
                    if term.get('taxonomy') == 'category' and category == 'general':
                        category = term.get('slug') or term.get('name') or 'general'
                    elif term.get('taxonomy') == 'post_tag':
                        name = html.unescape(term.get('name') or '')
                        if name and name not in tags:
                            tags.append(name)

            media = embedded.get('wp:featuredmedia') or []
            image = ''
            if media and isinstance(media[0], dict):
                image = media[0].get('source_url') or ''

            posts.append({
                'wpId': item['id'],
                'title': html.unescape((item.get('title') or {}).get('rendered', '')),
                'content': (item.get('content') or {}).get('rendered', ''),
                # Локальное время сайта — в этом же виде лежат новости первого переноса.
                'date': str(item.get('date') or '').replace('T', ' '),
                'image': image,
                'category': category,
                'tags': tags,
            })

        print(f'  получено {len(posts)}/{len(ids)}', file=sys.stderr)

    return posts


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dump', required=True)
    parser.add_argument('--existing-ids', required=True,
                        help='файл со списком уже перенесённых id постов, по одному в строке')
    parser.add_argument('--out', required=True)
    parser.add_argument('--host', default='92.63.176.152')
    args = parser.parse_args()

    published, poll_meta_rows, correct_answers, dump_completed_at = scan_dump(args.dump)
    print(f'В дампе опубликованных постов: {len(published)}; дамп от {dump_completed_at}', file=sys.stderr)

    with open(args.existing_ids, encoding='utf-8') as fh:
        existing = {int(line.strip()) for line in fh if line.strip().isdigit()}

    delta = sorted(published - existing)
    print(f'Уже в приложении: {len(existing & published)}; к догрузке: {len(delta)}', file=sys.stderr)

    posts = fetch_rest(args.host, delta) if delta else []

    missing = sorted(set(delta) - {p['wpId'] for p in posts})
    if missing:
        print(f'ВНИМАНИЕ: REST не отдал {len(missing)} постов: {missing[:20]}', file=sys.stderr)

    delta_set = set(delta)
    payload = {
        'dumpCompletedAt': dump_completed_at,
        'posts': posts,
        'pollMeta': [row for row in poll_meta_rows if row['post_id'] in delta_set],
        'correctAnswers': [row for row in correct_answers if row['post_id'] in delta_set],
    }

    with open(args.out, 'w', encoding='utf-8') as fh:
        json.dump(payload, fh, ensure_ascii=False)

    print(f'Записано {args.out}: постов {len(payload["posts"])}, '
          f'полей опросов {len(payload["pollMeta"])}, правильных ответов {len(payload["correctAnswers"])}',
          file=sys.stderr)


if __name__ == '__main__':
    main()
