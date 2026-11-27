import type { RecognizedReceipt } from '../../src/lib/receipt/types';

// Демо-данные для режима ?demo=1 и для MOCK_RECOGNIZE на сервере:
// реалистичный ресторанный чек в рублях со сбором 10%, суммы сходятся.
export const sampleReceipt: RecognizedReceipt = {
  kind: 'itemized',
  currency: 'RUB',
  currencyGuessed: false,
  date: '2026-11-19',
  items: [
    { name: 'Стейк Рибай', amount: 1800, quantity: 1, ownerIds: [] },
    { name: 'Том ям с креветками', amount: 590, quantity: 1, ownerIds: [] },
    { name: 'Цезарь с курицей', amount: 650, quantity: 1, ownerIds: [] },
    { name: 'Паста карбонара', amount: 720, quantity: 1, ownerIds: [] },
    { name: 'Вино, бокал', amount: 1100, quantity: 2, ownerIds: [] },
    { name: 'Чизкейк', amount: 450, quantity: 1, ownerIds: [] },
  ],
  total: 5841,
  serviceCharge: 531,
  tip: 0,
  guestSplitDetected: false,
  looksPartial: false,
  note: null,
  itemsSum: 5310,
  totalMatches: true,
  difference: 0,
  needsReview: false,
  reviewReasons: [],
};
