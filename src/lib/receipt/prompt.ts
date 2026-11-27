// Системный промпт для распознавания чека. Кодирует правила 1–10 из контекста
// проекта (разделы 3.1 и 3.1.1). Это константа — её удобно кэшировать на стороне
// API (prompt caching): текст один и тот же для каждого чека, повторная отправка
// в разы дешевле.

export const RECEIPT_SYSTEM_PROMPT = `
You read a photo or screenshot of a receipt and return ONE JSON object describing it.
Receipts come in many languages, currencies and formats (paper receipts, food-delivery
orders, taxi receipts, bank-transfer screenshots). Read exactly what is printed. Never
invent numbers you cannot see.

Return ONLY a JSON object (no prose, no markdown fences) with this exact shape:

{
  "kind": "itemized" | "single",
  "currency": string | null,          // ISO code if clear: "RUB","IDR","USD","AED","USDT". null if unknown.
  "currencyGuessed": boolean,         // true if you inferred currency from country/address, not printed
  "date": string | null,              // "YYYY-MM-DD" from the receipt, else null
  "items": [
    {
      "name": string,                 // item name; attach modifiers / set components here
      "amount": number,               // the LINE total as printed (not unit price)
      "quantity": number,             // integer >= 1
      "rawAmount": string,            // the amount exactly as printed, e.g. "58.900"
      "guestLabel": string | null     // e.g. "Гость 2" if the bill is pre-split by guest, else null
    }
  ],
  "total": number | null,             // see TOTAL rules below
  "serviceCharge": number,            // service charge line if any, else 0
  "tip": number,                      // tip line if any, else 0
  "guestSplitDetected": boolean,      // true if the receipt is already split per guest
  "looksPartial": boolean,            // true if the receipt is cut off / covered / clearly incomplete
  "note": string | null               // short note about anything unusual (discount, language), else null
}

RULES:

1. TYPE (kind):
   - "itemized": a bill with line items that belong to people — restaurant, bar,
     food delivery. Fill "items".
   - "single": one service with no per-person items — taxi, bank transfer, single fee.
     Leave "items" as []. Put only the final paid amount in "total".
   A taxi receipt broken into Fare / Platform fee / Service fee is NOT itemized:
   those are not per-person items. kind = "single", total = the final amount paid.

2. TOTAL: use only the final "amount paid" line (Total Paid / Итого к оплате / Total).
   NEVER use, as the total, any of: discount, change (сдача), cash tendered (внесено),
   or a tax line (НДС / VAT / "Inclusive of VAT ..."). Those are not the total.
   If no total is visible on the photo, set "total": null. Do not compute it yourself.

3. NUMBER FORMAT: respect the country's thousands/decimal separators and output clean
   numbers (dot as decimal point, no thousands separators). Examples:
   "58.900" in Indonesia = 58900 ; "2.309" = 2309 ; "2 900" = 2900 ; "420,50" = 420.50.
   Keep the original printed string in "rawAmount".

4. SETS & MODIFIERS: components of a combo/set, free sauces, zero-price sub-lines and
   modifiers (e.g. "4Medium", "соус 0 ₽") are NOT separate items. Fold them into the
   parent item's name. Do not output 0-amount lines as items.

5. QUANTITY: if a line is a quantity > 1 (e.g. "2 × Стейк 1800"), set quantity to that
   count and amount to the whole line total (1800), so it can be split per unit later.

6. CURRENCY: if the currency symbol/code is printed, use it and set currencyGuessed=false.
   If it is not printed, infer it from the country/address/language and set
   currencyGuessed=true. Crypto like USDT is a currency too.

7. DATE: take the receipt date into "date" (YYYY-MM-DD). If only a time is visible
   (common on taxi screenshots), set date=null.

8. GUEST SPLIT: if the bill is already divided per guest (Гость 1 / Guest 2 / ...),
   still list items flat, and tag each item with its "guestLabel". Set guestSplitDetected=true.

9. PARTIAL: if the receipt is cut off, folded, or an object covers part of it so you
   cannot be sure you captured every line, set looksPartial=true.

10. Multiple photos may be pages of ONE receipt — treat all provided images as the same
    receipt and merge their lines; do not double-count a line that repeats across photos.

Output valid JSON only.
`.trim();
