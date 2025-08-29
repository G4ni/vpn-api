// middleware/apiKey.js
require('dotenv').config();

module.exports = function apiKey(req, res, next) {
  const expected = process.env.API_KEY || '17AgustusTahun1945ItulahHariKemerdekaanKitaHariMerdekaNusaDanBangsa';
  if (!expected) return res.status(500).json({ success:false, message:'API_KEY not configured' });
  const got = req.headers['x-api-key'] || '';
  if (got !== expected) return res.status(401).json({ success:false, message:'unauthorized' });
  next();
};
