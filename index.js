const express = require("express");
const bodyParser = require("body-parser");
const { exec } = require("child_process");
const apiKey = require('./middleware/apiKey');
const userRoutes = require("./routes/user");
const hubRoutes = require("./routes/hub");
const metricsRoutes = require("./routes/metrics");
const cleanupRoutes = require('./routes/cleanup');
const helmet = require('helmet');
const corsMw = require('./middleware/cors');
const limiter = require('./middleware/rateLimit');
const toolsRoutes = require('./routes/tools');
const aclRoutes = require('./routes/acl');



const app = express();
app.set('trust proxy', 1);

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';



// Konfigurasi VPN
const VPNCMD_PATH = "/usr/bin/vpncmd";  // lokasi vpncmd
const HUB_NAME = "VPN";                 // nama HUB
const HUB_PASSWORD = "asaku";           // password HUB
const USER_PASSWORD = "123456";         // 🔑 password fix semua user


app.use(bodyParser.json());
app.use(helmet());
app.use(corsMw);
app.use(limiter);
app.use('/cleanup', apiKey, cleanupRoutes);
app.use('/tools', apiKey, toolsRoutes);
// Proteksi semua route berikut pakai API Key:
app.use('/vpn', apiKey, userRoutes);
app.use('/hub', apiKey, hubRoutes);
app.use('/metrics', apiKey, metricsRoutes);
app.use('/acl', apiKey, aclRoutes);


// Helper untuk jalankan vpncmd
function runCmd(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(stderr || stdout || error.message);
      } else {
        resolve(stdout);
      }
    });
  });
}



app.listen(PORT, HOST, () => console.log(`VPN API di http://${HOST}:${PORT}`));
