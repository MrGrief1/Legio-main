#!/usr/bin/env python3
"""Достаёт из SQL-дампа WordPress всё, что нужно, чтобы закрыть опрос в приложении.

Из дампа берутся два набора:
  * ACF-поля вариантов ответа (`answers_N_answer` / `answers_N_counter`) — чтобы сопоставить
    counter с конкретной строкой poll_options в базе приложения;
  * таблица `wp_poll_correct_answers` — какой counter объявлен верным и каким текстом.

Оба набора нужны вместе: counter сам по себе — это просто число, и без текста варианта нельзя
проверить, что строка, на которую он показывает в приложении, действительно та самая.

    python3 extract_answers.py --dump <dump.sql> --out <answers.json>
"""

import argparse
import json
import re
import sys

import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wp_delta_extract import split_tuples, unescape  # noqa: E402

ANSWER_META = re.compile(r'^answers_(\d+)_(answer|counter)$')


def scan(path):
    published = set()
    answers = {}          # post_id -> {index: {'text': str, 'counter': int}}
    correct = {}          # post_id -> {'counter': int, 'text': str, 'data_finish': str}
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
                    m = ANSWER_META.match(key or '')
                    if not m:
                        continue
                    post_id = int(f[1].strip())
                    index = int(m.group(1))
                    slot = answers.setdefault(post_id, {}).setdefault(index, {'text': '', 'counter': None})
                    value = unescape(f[3])
                    if m.group(2) == 'answer':
                        slot['text'] = value or ''
                    else:
                        try:
                            slot['counter'] = int(value)
                        except (TypeError, ValueError):
                            slot['counter'] = None

            elif line.startswith('INSERT INTO `wp_poll_correct_answers`'):
                for f in split_tuples(line.split(' VALUES ', 1)[1]):
                    if len(f) < 7:
                        continue
                    try:
                        post_id = int(unescape(f[1]))
                        counter = int(unescape(f[3]))
                    except (TypeError, ValueError):
                        continue
                    # У поста может быть несколько строк — берём последнюю: она отражает
                    # актуальное решение редакции.
                    correct[post_id] = {
                        'counter': counter,
                        'text': unescape(f[2]) or '',
                        'data_finish': unescape(f[4]) or '',
                        'calculation_points': unescape(f[6]),
                    }

            elif line.startswith('-- Dump completed on'):
                dump_completed_at = line.split('-- Dump completed on', 1)[1].strip()

    # ACF копирует поля опроса в ревизии — у постов, которых в ленте нет, мета тоже есть.
    answers = {pid: slots for pid, slots in answers.items() if pid in published}
    return published, answers, correct, dump_completed_at


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dump', required=True)
    ap.add_argument('--out', required=True)
    args = ap.parse_args()

    published, answers, correct, dump_completed_at = scan(args.dump)

    payload = {
        'dumpCompletedAt': dump_completed_at,
        'publishedCount': len(published),
        # Варианты — уже отсортированные по counter, ровно как их укладывал перенос
        # (parsePollMeta сортирует по counter, затем по индексу).
        'polls': {
            str(pid): {
                'options': [
                    {'index': i, 'counter': slot['counter'] if slot['counter'] else i + 1, 'text': slot['text']}
                    for i, slot in sorted(slots.items())
                ],
                'correct': correct.get(pid),
            }
            for pid, slots in answers.items()
        },
    }
    for entry in payload['polls'].values():
        entry['options'].sort(key=lambda o: (o['counter'], o['index']))

    with open(args.out, 'w', encoding='utf-8') as fh:
        json.dump(payload, fh, ensure_ascii=False)

    with_correct = sum(1 for e in payload['polls'].values() if e['correct'])
    print(f'дамп от {dump_completed_at}; опубликованных постов {len(published)}; '
          f'постов с вариантами {len(payload["polls"])}; из них с верным ответом {with_correct}',
          file=sys.stderr)


if __name__ == '__main__':
    main()
