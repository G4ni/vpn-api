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
