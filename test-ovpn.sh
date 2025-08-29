#!/bin/bash
# Full end-to-end test untuk vpn-api
# Health -> Create -> List -> Set Password -> Generate OVPN -> List Sessions -> Auto Disconnect -> Delete

API="${API:-http://localhost:3000}"
KEY="${KEY:-17AgustusTahun1945ItulahHariKemerdekaanKitaHariMerdekaNusaDanBangsa}"

EMAIL="${1:-testuser@example.com}"       # bisa override via argumen
NEWPASS="${2:-baru123}"                  # password baru (opsional)
OVPN_OUT="/tmp/${EMAIL%@*}.ovpn"         # file ovpn disimpan di /tmp

has_jq() { command -v jq >/dev/null 2>&1; }

line() { printf '%*s\n' "${COLUMNS:-80}" '' | tr ' ' '='; }

echo "=== 🔎 VPN-API FULL TEST ==="
echo "API     : $API"
echo "EMAIL   : $EMAIL"
echo "OVPN    : $OVPN_OUT"
line

# [0] Health
echo "[0] Health check"
curl -sS -H "x-api-key: $KEY" "$API/metrics/health" || echo "(no JSON / route missing)"
echo; line

# [1] Create user
echo "[1] Create user"
curl -sS -X POST "$API/vpn/create" \
  -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\"}"
echo; line

# [2] List users
echo "[2] List users"
curl -sS -H "x-api-key: $KEY" "$API/vpn/list"
echo; line

# [3] Set password
echo "[3] Set password -> $NEWPASS"
curl -sS -X POST "$API/vpn/set-password" \
  -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$NEWPASS\"}"
echo; line

# [4] Generate & download OVPN
echo "[4] Generate & download OVPN -> $OVPN_OUT"
curl -sS -X POST "$API/vpn/ovpn" \
  -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\"}" \
  -o "$OVPN_OUT"

if [ -s "$OVPN_OUT" ]; then
  echo "✅ OVPN saved: $OVPN_OUT"
  head -n 10 "$OVPN_OUT" || true
else
  echo "❌ OVPN file not created or empty."
fi
echo; line

# [5] List sessions
echo "[5] List sessions"
SESS_RAW="$(curl -sS -H "x-api-key: $KEY" "$API/hub/sessions")"
echo "$SESS_RAW"
echo

# [6] Auto-disconnect first non-SecureNAT session (if any)
SESSION_NAME=""
if has_jq; then
  SESSION_NAME="$(echo "$SESS_RAW" | jq -r '.sessions[]? | select(.["User Name"]? != "SecureNAT" and .["User Name"]? != null) | .name' | head -n1)"
else
  # fallback tanpa jq: regex kasar cari baris "Session Name|XXXX" dan ambil pertama
  SESSION_NAME="$(echo "$SESS_RAW" | grep -oE 'SID-[^"]+' | head -n1 || true)"
fi

if [ -n "$SESSION_NAME" ]; then
  echo "[6] Disconnect session: $SESSION_NAME"
  curl -sS -X POST "$API/hub/disconnect" \
    -H "x-api-key: $KEY" -H "Content-Type: application/json" \
    -d "{\"sessionName\":\"$SESSION_NAME\"}"
  echo
else
  echo "[6] No active session found (or jq missing & parsing failed) — skipping disconnect."
fi
line

# [7] Delete user
echo "[7] Delete user"
curl -sS -X POST "$API/vpn/delete" \
  -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\"}"
echo; line

echo "=== ✅ SELESAI ==="
