#!/usr/bin/env bash
# ============================================================================
# telegram-alert.sh "<message>" — best-effort push to the shop owner's Telegram.
#
# Needs two GitHub Actions secrets (see supabase/KEYS.md):
#   TELEGRAM_BOT_TOKEN — from @BotFather (a real secret)
#   TELEGRAM_CHAT_ID   — the owner's numeric Telegram id (NOT a phone number;
#                        Telegram bots cannot message a phone number)
#
# If either is missing it logs a clear notice and exits 0, so the pipeline still
# works before the owner has set them up (the workflow itself already shows red).
# ============================================================================
set -uo pipefail
MSG="${1:-ASC backup alert}"

if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_CHAT_ID:-}" ]; then
  echo "::warning::Telegram not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID unset) — see supabase/KEYS.md. Alert NOT sent:"
  echo "           $MSG"
  exit 0
fi

CODE=$(curl -sS -m 20 -o /tmp/tg.out -w '%{http_code}' \
  --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
  --data-urlencode "text=${MSG}" \
  --data-urlencode "disable_web_page_preview=true" \
  "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" || echo "000")

if [ "$CODE" = "200" ]; then
  echo "✓ Telegram alert delivered."
else
  echo "::warning::Telegram API returned HTTP $CODE — alert may not have been delivered:"
  cat /tmp/tg.out 2>/dev/null || true
fi
exit 0
