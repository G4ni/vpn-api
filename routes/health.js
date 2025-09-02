// routes/health.js
const router = require('express').Router();
router.get('/', (req, res) => res.json({ ok: true, ts: Date.now() }));
module.exports = router;
