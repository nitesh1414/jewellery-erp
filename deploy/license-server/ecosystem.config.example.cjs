/**
 * PM2 process definition for the Jewellery ERP license server.
 *
 *   cp deploy/license-server/ecosystem.config.example.cjs deploy/license-server/ecosystem.config.cjs
 *   pm2 start deploy/license-server/ecosystem.config.cjs
 *   pm2 save && pm2 startup      # survive reboots (see docs/DEPLOY-LICENSE-SERVER-VPS.md)
 *
 * All application settings (PORT, HOST, JWT_SECRET, admin account, data dir)
 * live in packages/license-server/.env and are loaded by the server itself,
 * so this file only describes how to run the process.
 */
module.exports = {
  apps: [
    {
      name: 'jewellery-license-server',
      cwd: '/var/www/jewellery-erp/packages/license-server',
      script: 'dist/index.js',
      // SQLite database → exactly ONE instance. Do not raise this (and do not
      // enable cluster mode) unless you have moved to PostgreSQL.
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '512M',
      time: true,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
