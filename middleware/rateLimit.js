// middleware/rateLimit.js
const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  keyGenerator: (req) => {
    const ip =
      req.headers['x-real-ip'] ||
      req.ip ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() ||
      '';
    return String(ip);  // pastikan string → hindari ERR_ERL_KEY_GEN_IPV6
  },
});

module.exports = apiLimiter;
