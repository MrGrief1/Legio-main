import { useEffect, useRef } from 'react';

// Кнопка «назад» (и жест возврата на телефоне) — главный способ вернуться на шаг назад. Разделы
// и модалки этого приложения жили только в React-состоянии: история браузера про них не знала,
// поэтому «назад» уводил не на предыдущий экран, а с сайта целиком.
//
// Модель: в истории браузера держим не по записи на каждый шаг, а одну запись-страж поверх
// исходной — ровно пока внутри приложения есть куда возвращаться. Сам стек шагов живёт здесь,
// в модуле.
//
// Почему не по записи на шаг: шаг сплошь и рядом закрывается не с вершины стека — переход по меню
// разом закрывает меню и меняет раздел, «Править» закрывает модалку и открывает мастер. Вынуть
// запись из середины истории браузера нельзя, и такие записи копились бы мёртвым грузом: человек
// жал бы «назад» вхолостую. Со стражем порядок закрытия неважен — историю трогаем только на
// границе «стек пуст / не пуст».

type BackStep = { id: number; onPop: () => void };

let stack: BackStep[] = [];
let nextId = 1;
// Лежит ли наша запись-страж в истории браузера.
let guard = false;
// Сколько history.back() мы вызвали сами и ещё ждём по ним popstate. Пока ждём — историю не
// трогаем: pushState посреди незавершённого back() затёр бы запись, к которой back и ведёт.
let pendingBack = 0;
let listening = false;

const GUARD_KEY = '__legioBackGuard';

// Приводим историю в соответствие со стеком: есть шаги — нужен страж, шагов нет — страж лишний.
const sync = () => {
    if (pendingBack > 0) return; // досинхронизируемся, когда придёт popstate по нашему back()

    const needGuard = stack.length > 0;
    if (needGuard === guard) return;

    if (needGuard) {
        guard = true;
        const previous = (window.history.state && typeof window.history.state === 'object')
            ? window.history.state
            : {};
        window.history.pushState({ ...previous, [GUARD_KEY]: true }, '');
    } else {
        guard = false;
        pendingBack += 1;
        window.history.back();
    }
};

const handlePopState = () => {
    if (pendingBack > 0) {
        // Это popstate по нашему собственному back(): состояние приложения уже обновлено тем, кто
        // закрыл шаг, закрывать что-то ещё нельзя.
        pendingBack -= 1;
        sync();
        return;
    }

    // Нет стража — значит уходят со страницы, и это ровно то, чего человек хотел.
    if (!guard) return;

    guard = false;
    stack.pop()?.onPop();
    sync(); // внутри ещё есть куда возвращаться — ставим стража заново
};

const startListening = () => {
    if (listening) return;
    listening = true;
    window.addEventListener('popstate', handlePopState);
};

// Добавить шаг «назад». Возвращает идентификатор для releaseBackStep.
export const pushBackStep = (onPop: () => void): number => {
    startListening();
    const id = nextId++;
    stack.push({ id, onPop });
    sync();
    return id;
};

// Снять шаг, закрытый изнутри приложения (крестиком, выбором в меню, отправкой формы).
export const releaseBackStep = (id: number) => {
    const index = stack.findIndex((step) => step.id === id);
    if (index === -1) return; // шаг уже сняла кнопка «назад» — повторно ничего не делаем
    stack.splice(index, 1);
    sync();
};

// Пока `active`, «назад» закрывает этот слой, а не уводит со страницы.
export const useBackClose = (active: boolean, onClose: () => void) => {
    const onCloseRef = useRef(onClose);

    // Обновляем ссылку отдельным эффектом (он объявлен раньше и потому выполняется первым): у
    // диалогов onClose пересоздаётся на каждый вызов, а перезапуск эффекта ниже добавил бы лишний
    // шаг в стек.
    useEffect(() => {
        onCloseRef.current = onClose;
    });

    useEffect(() => {
        if (!active) return;
        const id = pushBackStep(() => onCloseRef.current());
        return () => releaseBackStep(id);
    }, [active]);
};

// После перезагрузки страницы стража в памяти нет, а пометка в history.state могла остаться:
// снимаем её, чтобы модель состояния не расходилась с реальностью.
if (typeof window !== 'undefined') {
    const state = window.history.state;
    if (state && typeof state === 'object' && (state as Record<string, unknown>)[GUARD_KEY]) {
        const { [GUARD_KEY]: _removed, ...rest } = state as Record<string, unknown>;
        window.history.replaceState(rest, '');
    }
}
