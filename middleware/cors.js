// middleware/cors.js
const cors = require('cors');

const allowOrigins = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
// jika kosong, default allow none kecuali local
const defaultOrigins = ['http://localhost:4000', 'http://127.0.0.1:4000'];

module.exports = cors({
  origin: allowOrigins.length ? allowOrigins : defaultOrigins,
  methods: ['GET','POST','OPTIONS'],
  allowedHeaders: ['Content-Type','x-api-key'],
  credentials: false,
  maxAge: 600,
});