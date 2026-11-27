import { useEffect, useRef, useState } from 'react';
import type { RecognizedReceipt, ReviewReason } from '../../src/lib/receipt/types';
import { sampleReceipt } from './sampleReceipt';

// Понятные человеку причины «проверь» (reviewReasons из модуля распознавания).
const REVIEW_LABELS: Record<ReviewReason, string> = {
  total_not_found: 'На фото не видно итога — проверь сумму или введи вручную',
  sum_mismatch: 'Сумма позиций не сошлась с итогом — проверь выделенные цифры',
  currency_guessed: 'Валюту определили по чеку — подтверди, что верно',
  date_not_found: 'Не нашли дату чека — нужна для курса, укажи вручную',
  no_items_found: 'Не удалось распознать позиции — добавь вручную',
  partial_receipt: 'Чек, похоже, обрезан — возможно, видны не все позиции. Доснимите чек',
};

function formatMoney(amount: number, currency: string | null): string {
  if (!currency) return amount.toLocaleString('ru-RU');
  try {
    return new Intl.NumberFormat('ru-RU', { style: 'currency', currency }).format(amount);
  } catch {
    // USDT и прочие неизвестные ISO-коды — показываем числом + код
    return `${amount.toLocaleString('ru-RU')} ${currency}`;
  }
}

type Status = 'idle' | 'loading' | 'done' | 'error';

export function App() {
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<RecognizedReceipt | null>(null);
  const [error, setError] = useState<string>('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Демо-режим (?demo=1) — показать экран на готовых данных без сервера.
  useEffect(() => {
    if (new URLSearchParams(location.search).has('demo')) {
      setResult(sampleReceipt);
      setStatus('done');
    }
  }, []);

  async function onPick(files: FileList | null) {
    if (!files || files.length === 0) return;
    setStatus('loading');
    setError('');
    setResult(null);
    try {
      const fd = new FormData();
      for (const f of Array.from(files)) fd.append('image', f);
      const res = await fetch('/api/recognize', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Ошибка сервера (${res.status})`);
      setResult(data as RecognizedReceipt);
      setStatus('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось распознать чек');
      setStatus('error');
    }
  }

  function reset() {
    setResult(null);
    setStatus('idle');
    setError('');
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div className="screen">
      <header className="top">
        <h1>Новая трата</h1>
        <p className="sub">Сфотографируй чек — позиции подставятся сами</p>
      </header>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        hidden
        onChange={(e) => onPick(e.target.files)}
      />

      {status !== 'done' && (
        <button
          className="shoot"
          onClick={() => fileRef.current?.click()}
          disabled={status === 'loading'}
        >
          {status === 'loading' ? (
            <span className="spinner" aria-label="Распознаю…" />
          ) : (
            <>
              <span className="cam">📷</span>
              <span>Сфотографировать чек</span>
              <span className="hint">можно несколько фото одного чека</span>
            </>
          )}
        </button>
      )}

      {status === 'error' && (
        <div className="banner error">
          <b>Не получилось распознать.</b>
          <div>{error}</div>
          <button className="link" onClick={reset}>
            Попробовать другое фото
          </button>
        </div>
      )}

      {status === 'done' && result && <Receipt r={result} onReset={reset} />}
    </div>
  );
}

function Receipt({ r, onReset }: { r: RecognizedReceipt; onReset: () => void }) {
  const isSingle = r.kind === 'single';
  return (
    <section className="receipt">
      <div className="total-card">
        <div className="total-label">{isSingle ? 'Сумма' : 'Итого по чеку'}</div>
        <div className="total-value">{formatMoney(r.total ?? r.itemsSum ?? 0, r.currency)}</div>
        <div className="meta">
          {r.date ?? 'дата не распознана'}
          {r.currencyGuessed && r.currency ? ` · валюта ${r.currency} (угадана)` : ''}
        </div>
      </div>

      {r.needsReview && (
        <div className="banner warn">
          <b>Проверь, пожалуйста</b>
          <ul>
            {r.reviewReasons.map((x) => (
              <li key={x}>{REVIEW_LABELS[x] ?? x}</li>
            ))}
          </ul>
        </div>
      )}

      {!isSingle && r.items.length > 0 && (
        <ul className="items">
          {r.items.map((it, i) => (
            <li key={i} className="item">
              <span className="name">
                {it.name}
                {it.quantity > 1 && <span className="qty">×{it.quantity}</span>}
              </span>
              <span className="amt">{formatMoney(it.amount, r.currency)}</span>
            </li>
          ))}
        </ul>
      )}

      {(r.serviceCharge > 0 || r.tip > 0) && (
        <ul className="items extra">
          {r.serviceCharge > 0 && (
            <li className="item">
              <span className="name">Сервисный сбор</span>
              <span className="amt">{formatMoney(r.serviceCharge, r.currency)}</span>
            </li>
          )}
          {r.tip > 0 && (
            <li className="item">
              <span className="name">Чаевые</span>
              <span className="amt">{formatMoney(r.tip, r.currency)}</span>
            </li>
          )}
        </ul>
      )}

      {isSingle && (
        <p className="single-note">
          Это одна услуга (такси/перевод) — делим сумму целиком между участниками, без позиций.
        </p>
      )}

      <div className="actions">
        <button className="primary">Разложить по людям</button>
        <button className="link" onClick={onReset}>
          Отсканировать другой чек
        </button>
      </div>
    </section>
  );
}
