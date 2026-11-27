#!/bin/bash
# Пополам — запуск приложения на Маке. Просто двойной клик по этому файлу.
cd "$(dirname "$0")" || exit 1

echo "=================================================="
echo "   Пополам — запускаю приложение"
echo "=================================================="
echo

# 1) Есть ли Node.js?
if ! command -v npm >/dev/null 2>&1; then
  echo "❌ Не найден Node.js (он нужен для запуска)."
  echo "   Поставь его с https://nodejs.org (большая кнопка LTS),"
  echo "   потом снова дважды кликни по этому файлу."
  echo
  echo "Это окно можно закрыть."
  exit 1
fi

# 2) Есть ли ключ в .env?
if ! grep -q "ANTHROPIC_API_KEY=sk-ant" .env 2>/dev/null; then
  echo "⚠️  В файле .env не вижу ключ — чек не распознается."
  echo "   (Приложение всё равно откроется, но распознавание не сработает.)"
  echo
fi

# 3) Первый запуск — ставим зависимости именно под этот Мак
if [ ! -f .mac_deps_ok ]; then
  echo "Первый запуск: ставлю зависимости под твой Мак."
  echo "Это займёт пару минут и нужен интернет. Подожди…"
  echo
  rm -rf node_modules
  if npm install; then
    touch .mac_deps_ok
    echo
    echo "✅ Готово, зависимости поставлены."
  else
    echo
    echo "❌ Не получилось поставить зависимости. Пришли мне то, что выше."
    echo "Окно можно закрыть."
    exit 1
  fi
  echo
fi

# 4) На всякий случай гасим прошлые запуски на этих портах
lsof -ti tcp:8787 2>/dev/null | xargs kill -9 2>/dev/null
lsof -ti tcp:5173 2>/dev/null | xargs kill -9 2>/dev/null

# 5) Запускаем сервер (распознавание) и экран
echo "Запускаю сервер и экран…"
npx tsx server/index.ts > /tmp/popolam-server.log 2>&1 &
SRV=$!
npx vite --port 5173 --strictPort > /tmp/popolam-web.log 2>&1 &
VITE=$!

# Когда закроешь это окно — всё аккуратно останавливается
trap 'kill $SRV $VITE 2>/dev/null; exit 0' INT TERM EXIT

# 6) Ждём, пока поднимется экран, и открываем браузер
printf "Жду, пока всё поднимется"
for i in $(seq 1 45); do
  if curl -s -o /dev/null "http://localhost:5173/" 2>/dev/null; then
    break
  fi
  printf "."
  sleep 1
done
echo
open "http://localhost:5173/"

echo
echo "=================================================="
echo "   ✅ Готово! Открылся браузер с приложением."
echo
echo "   Жми «Сфотографировать чек» → выбери фото чека"
echo "   (или сделай фото). Позиции прилетят на экран."
echo
echo "   Чтобы остановить — просто закрой это окно."
echo "=================================================="

# держим приложение живым, пока окно открыто
wait
