# vpn-api

Backend API untuk manajemen **SoftEther VPN Server**.  
Dibuat dengan **Node.js (Express)** dan diintegrasikan dengan `vpncmd`.

---

## 🚀 Fitur
- Create / Delete / List VPN User
- Set Password User
- Generate Config OVPN
- List & Disconnect Sessions
- Health & Metrics Monitoring

---

## 📦 Install

```bash
git clone https://github.com/G4ni/vpn-api.git
cd vpn-api
npm install
Pastikan binary vpncmd dari SoftEther versi 4.x sudah ada di server:

bash
Salin kode
which vpncmd
# contoh output: /usr/local/softether-vpnserver/vpncmd
⚙️ Konfigurasi
Buat file .env di root:

ini
Salin kode
VPN_HUB=VPN
VPN_HUB_PASS=asaku
VPN_SERVER=localhost
VPNCMD_PATH=/usr/local/softether-vpnserver/vpncmd
PORT=3000
API_KEY=17AgustusTahun1945ItulahHariKemerdekaanKitaHariMerdekaNusaDanBangsa

▶️ Menjalankan API
bash
Salin kode
npm start
atau dengan pm2:

bash
Salin kode
pm2 start index.js --name vpn-api
pm2 save
API jalan di http://127.0.0.1:3000

📡 Endpoint Utama
GET /api/metrics → Health & server metrics

POST /api/vpn/create

POST /api/vpn/delete

POST /api/vpn/set-password

GET /api/vpn/list

GET /api/hub/sessions

POST /api/hub/disconnect

GET /api/vpn/ovpn?email=<user>

Gunakan x-api-key di header setiap request.

