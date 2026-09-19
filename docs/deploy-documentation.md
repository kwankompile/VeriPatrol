# VeriPatrol Deployment Documentation

**Project:** VeriPatrol  
**Backend:** Laravel 13 API  
**Frontend:** React/Vite on Netlify  
**Blockchain:** Ethereum Sepolia Testnet  
**Production Backend Domain:** `https://ikhwanarifi.site`  
**Frontend Domain:** `https://veripatrol.netlify.app`  
**Server OS:** Ubuntu 24.04 LTS  
**Current Droplet IPv4:** `157.245.56.157`  
**Last Updated:** September 2026

> **Security note:** This document intentionally excludes passwords, private keys, API keys, JWT secrets, application keys, SMTP credentials, Reverb secrets, and VAPID private keys. Use placeholders and store real values only in the production `.env` or the relevant provider dashboard.

---

## 1. Production Architecture

```text
React / Vite Frontend
veripatrol.netlify.app
        |
        | HTTPS API + WSS
        v
Nginx :80 / :443
ikhwanarifi.site
        |
        +----------------------------+
        |                            |
        v                            v
PHP-FPM 8.3                    /app WebSocket proxy
Laravel 13                     -> 127.0.0.1:8080
        |                            |
        |                            v
        |                       Laravel Reverb
        |
        +--> MySQL 8.0 on 127.0.0.1:3306
        |
        +--> Database Queue Worker
        |
        +--> Sepolia RPC Provider
                  |
                  v
        EvidenceStore Smart Contract
```

### Main server directories

```text
/var/www/backend/
├── cs251-fyp-backend/          # Laravel production backend
└── cs251-fyp-blockchain/       # Hardhat / Solidity / deployment ABI
```

---

## 2. Production Software Versions

| Component | Production Version |
|---|---|
| Ubuntu | 24.04 LTS |
| PHP | 8.3.33 |
| Laravel | 13.8.0 |
| Composer | 2.10.3 |
| MySQL | 8.0.46 |
| Nginx | 1.24.0 |
| Node.js | 22.23.2 |
| npm | 10.9.8 |
| Hardhat | 2.28.6 |
| Certbot | 2.9.0 |

PHP extensions required by the project include:

```text
bcmath
curl
dom
fileinfo
gmp
mbstring
mysqli
mysqlnd
openssl
pcntl
pdo_mysql
redis
session
sodium
tokenizer
xml
zip
```

`ext-gmp` is required by the Ethereum packages.

---

## 3. Initial Server Setup

### 3.1 Create deployment user

```bash
adduser deploy
usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy
```

Test:

```bash
ssh deploy@SERVER_IP
sudo whoami
```

Expected:

```text
root
```

### 3.2 Firewall

Only expose SSH, HTTP, and HTTPS:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

Do **not** publicly expose:

```text
3306  MySQL
8080  Laravel Reverb
```

Reverb is proxied through Nginx on port 443.

---

## 4. Install PHP 8.3 and Extensions

```bash
sudo apt update
sudo apt install -y software-properties-common
sudo add-apt-repository ppa:ondrej/php -y
sudo apt update

sudo apt install -y \
  php8.3 \
  php8.3-fpm \
  php8.3-mysql \
  php8.3-mbstring \
  php8.3-xml \
  php8.3-curl \
  php8.3-zip \
  php8.3-bcmath \
  php8.3-tokenizer \
  php8.3-redis \
  php8.3-gmp
```

`pcntl` is provided by the installed PHP build on this server and is not installed as a separate `php8.3-pcntl` package.

Verify:

```bash
php -v
php -m | grep -E "gmp|pcntl|curl|mbstring|mysqli|pdo_mysql|redis|xml|zip"
sudo systemctl status php8.3-fpm --no-pager
```

---

## 5. Install Composer

```bash
cd ~
curl -sS https://getcomposer.org/installer -o composer-setup.php
php composer-setup.php
sudo mv composer.phar /usr/local/bin/composer
sudo chmod +x /usr/local/bin/composer
rm composer-setup.php
```

Verify:

```bash
composer --version
which composer
```

Expected path:

```text
/usr/local/bin/composer
```

---

## 6. Install and Configure MySQL

```bash
sudo apt install -y mysql-server
sudo mysql_secure_installation
```

Create the production database and user:

```bash
sudo mysql
```

```sql
CREATE DATABASE fyp
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

CREATE USER 'ikhwan'@'localhost'
IDENTIFIED BY 'YOUR_STRONG_DB_PASSWORD';

GRANT ALL PRIVILEGES ON fyp.* TO 'ikhwan'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

Test using TCP because Laravel uses `127.0.0.1`:

```bash
mysql -h 127.0.0.1 -u ikhwan -p fyp
```

```sql
SELECT DATABASE();
EXIT;
```

---

## 7. Install Nginx, Node.js, and Certbot

### Nginx

```bash
sudo apt install -y nginx
sudo systemctl enable nginx
```

### Node.js 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

Verify:

```bash
node -v
npm -v
```

### Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
```

Verify:

```bash
certbot --version
sudo systemctl status certbot.timer --no-pager
```

---

## 8. Deploy Laravel Backend

### 8.1 Clone

```bash
sudo mkdir -p /var/www/backend
sudo chown deploy:deploy /var/www/backend

cd /var/www/backend
git clone YOUR_BACKEND_REPOSITORY_URL cs251-fyp-backend
cd cs251-fyp-backend
```

### 8.2 Install dependencies

```bash
composer install --no-dev --optimize-autoloader
```

Do **not** use `composer update` on production.

Verify:

```bash
php artisan --version
composer check-platform-reqs
```

### 8.3 Permissions

```bash
sudo chown -R deploy:www-data /var/www/backend/cs251-fyp-backend

sudo find /var/www/backend/cs251-fyp-backend -type d -exec chmod 755 {} \;
sudo find /var/www/backend/cs251-fyp-backend -type f -exec chmod 644 {} \;

sudo chown -R deploy:www-data storage bootstrap/cache
sudo find storage bootstrap/cache -type d -exec chmod 775 {} \;
sudo find storage bootstrap/cache -type f -exec chmod 664 {} \;
```

The log file must be writable by PHP-FPM:

```bash
sudo chown deploy:www-data storage/logs/laravel.log
sudo chmod 664 storage/logs/laravel.log
sudo -u www-data test -w storage/logs/laravel.log && \
  echo "Laravel log writable by www-data"
```

---

## 9. Production Backend `.env`

Create:

```bash
cp .env.example .env
chmod 640 .env
nano .env
```

Use the structure below.

```ini
APP_NAME=VeriPatrol
APP_ENV=production
APP_KEY=
APP_DEBUG=false
APP_URL=https://ikhwanarifi.site
FRONTEND_URL=https://veripatrol.netlify.app

APP_LOCALE=en
APP_FALLBACK_LOCALE=en
APP_FAKER_LOCALE=en_US
APP_MAINTENANCE_DRIVER=file
BCRYPT_ROUNDS=12

LOG_CHANNEL=stack
LOG_STACK=single
LOG_LEVEL=debug

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=fyp
DB_USERNAME=ikhwan
DB_PASSWORD=YOUR_DB_PASSWORD
DB_TIMEZONE=+00:00

SESSION_DRIVER=database
SESSION_LIFETIME=120
SESSION_ENCRYPT=false
SESSION_PATH=/
SESSION_DOMAIN=null

QUEUE_CONNECTION=database
CACHE_STORE=file
BROADCAST_CONNECTION=reverb
FILESYSTEM_DISK=local

MAIL_MAILER=smtp
MAIL_HOST=YOUR_SMTP_HOST
MAIL_PORT=587
MAIL_ENCRYPTION=tls
MAIL_USERNAME=YOUR_SMTP_USERNAME
MAIL_PASSWORD=YOUR_SMTP_PASSWORD
MAIL_FROM_ADDRESS=YOUR_MAIL_FROM_ADDRESS
MAIL_FROM_NAME="VeriPatrol"

JWT_ALGO=HS256
JWT_SECRET=

AUTH_ACCESS_TOKEN_TTL=30
AUTH_REFRESH_TOKEN_TTL_HOURS=12
AUTH_REFRESH_COOKIE_NAME=refresh_token
AUTH_REFRESH_COOKIE_SECURE=true
AUTH_REFRESH_COOKIE_SAME_SITE=none
AUTH_REFRESH_COOKIE_PATH=/api/auth
AUTH_LOGIN_MAX_ATTEMPTS=5
AUTH_LOGIN_LOCK_MINUTES=15
AUTH_PASSWORD_MIN_LENGTH=12
AUTH_PASSWORD_SETUP_TOKEN_TTL_HOURS=24
AUTH_OTP_CHALLENGE_TTL=5
AUTH_OTP_MAX_ATTEMPTS=5
AUTH_TWO_FACTOR_SETUP_TTL=10
AUTH_TOTP_ISSUER="VeriPatrol"
AUTH_TOTP_WINDOW=1

PROFILE_PICTURE_DISK=public
PROFILE_PICTURE_DIRECTORY=profile-pictures
PROFILE_PICTURE_MAX_SIZE_KB=2048
PROFILE_PICTURE_ALLOWED_MIMES=jpg,jpeg,png,webp
PROFILE_CHANGE_TOKEN_TTL_MINUTES=10
PROFILE_STEP_UP_MAX_ATTEMPTS=5
PROFILE_STEP_UP_DECAY_SECONDS=300

CORS_ALLOWED_ORIGINS=https://veripatrol.netlify.app

REVERB_APP_ID=YOUR_REVERB_APP_ID
REVERB_APP_KEY=YOUR_REVERB_APP_KEY
REVERB_APP_SECRET=YOUR_REVERB_APP_SECRET
REVERB_HOST=127.0.0.1
REVERB_PORT=8080
REVERB_SCHEME=http

VAPID_SUBJECT=mailto:YOUR_EMAIL
VAPID_PUBLIC_KEY=YOUR_VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY=YOUR_VAPID_PRIVATE_KEY
```

Generate application secrets:

```bash
php artisan key:generate
php artisan jwt:secret
```

Generate Reverb values:

```bash
openssl rand -hex 8
openssl rand -hex 20
openssl rand -hex 20
```

Generate VAPID keys:

```bash
npx web-push generate-vapid-keys
```

After every `.env` change:

```bash
php artisan config:clear
php artisan config:cache
```

---

## 10. Database Migrations and Seeders

The repository already contains queue migrations. A session migration was added for `SESSION_DRIVER=database`.

Run:

```bash
php artisan migrate --force
php artisan db:seed --class=RoleSeeder --force
```

If the project does not yet contain a `failed_jobs` table:

```bash
php artisan make:queue-failed-table
php artisan migrate --force
```

Verify:

```bash
php artisan migrate:status
php artisan queue:failed
```

Expected:

```text
No failed jobs found.
```

---

## 11. Storage Link

```bash
php artisan storage:link
```

Verify:

```bash
php artisan about | grep -A3 Storage
```

Expected:

```text
public/storage ... LINKED
```

---

## 12. Production Laravel Caches

```bash
php artisan config:clear
php artisan route:clear
php artisan view:clear

php artisan config:cache
php artisan route:cache
php artisan view:cache
```

Verify:

```bash
php artisan about
```

Important production values:

```text
Environment ........ production
Debug Mode ......... OFF
URL ................ https://ikhwanarifi.site
Config ............. CACHED
Routes ............. CACHED
Views .............. CACHED
Broadcasting ....... reverb
Database ........... mysql
Queue .............. database
Session ............ database
```

---

## 13. Nginx Configuration

File:

```text
/etc/nginx/sites-available/backend
```

Recommended configuration:

```nginx
server {
    listen 80;
    listen [::]:80;

    server_name ikhwanarifi.site www.ikhwanarifi.site;

    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;

    server_name ikhwanarifi.site www.ikhwanarifi.site;

    ssl_certificate /etc/letsencrypt/live/ikhwanarifi.site/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ikhwanarifi.site/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    root /var/www/backend/cs251-fyp-backend/public;
    index index.php;

    charset utf-8;

    # ANPR evidence uploads can exceed Nginx's default 1 MB limit.
    client_max_body_size 20M;

    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    # Laravel Reverb
    location /app {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location = /favicon.ico {
        access_log off;
        log_not_found off;
    }

    location = /robots.txt {
        access_log off;
        log_not_found off;
    }

    location ~ \.php$ {
        fastcgi_pass unix:/var/run/php/php8.3-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        include fastcgi_params;
    }

    location ~ /\.(?!well-known).* {
        deny all;
    }
}
```

Enable:

```bash
sudo ln -s /etc/nginx/sites-available/backend /etc/nginx/sites-enabled/backend
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t
sudo systemctl reload nginx
```

---

## 14. PHP Upload Limits for ANPR Evidence

Nginx may allow a request while PHP still rejects it.

Edit:

```text
/etc/php/8.3/fpm/php.ini
```

Recommended:

```ini
upload_max_filesize = 20M
post_max_size = 25M
```

Restart:

```bash
sudo systemctl restart php8.3-fpm
```

Verify:

```bash
grep -E '^(upload_max_filesize|post_max_size)' /etc/php/8.3/fpm/php.ini
sudo nginx -T 2>/dev/null | grep client_max_body_size
```

This fixes:

```text
413 Request Entity Too Large
```

for evidence images larger than Nginx's default limit.

---

## 15. SSL / HTTPS

DNS records should point both names to the production Droplet:

```text
A  @    157.245.56.157
A  www  157.245.56.157
```

Verify:

```bash
getent ahostsv4 ikhwanarifi.site
getent ahostsv4 www.ikhwanarifi.site
```

Issue certificate:

```bash
sudo certbot --nginx \
  -d ikhwanarifi.site \
  -d www.ikhwanarifi.site
```

Verify:

```bash
curl -I https://ikhwanarifi.site
curl -I http://ikhwanarifi.site
sudo certbot certificates
sudo certbot renew --dry-run
systemctl is-active certbot.timer
```

Expected:

```text
HTTPS -> 200
HTTP  -> 301 to HTTPS
certbot.timer -> active
```

---

## 16. Laravel Reverb Service

Reverb should listen only on localhost.

File:

```text
/etc/systemd/system/reverb.service
```

```ini
[Unit]
Description=VeriPatrol Laravel Reverb WebSocket Server
After=network.target

[Service]
Type=simple
User=deploy
Group=www-data
WorkingDirectory=/var/www/backend/cs251-fyp-backend
ExecStart=/usr/bin/php artisan reverb:start --host=127.0.0.1 --port=8080
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

Enable:

```bash
sudo systemctl daemon-reload
sudo systemctl enable reverb
sudo systemctl start reverb
```

Verify:

```bash
sudo systemctl status reverb --no-pager
sudo ss -ltnp | grep ':8080'
```

Expected:

```text
127.0.0.1:8080
```

### Public WebSocket test

```bash
REVERB_KEY=$(grep '^REVERB_APP_KEY=' .env | cut -d= -f2-)

curl --http1.1 -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  "https://ikhwanarifi.site/app/${REVERB_KEY}?protocol=7&client=js&version=8.4.0&flash=false"

unset REVERB_KEY
```

Expected:

```text
HTTP/1.1 101 Switching Protocols
X-Powered-By: Laravel Reverb
```

---

## 17. Queue Worker Service

File:

```text
/etc/systemd/system/laravel-queue.service
```

```ini
[Unit]
Description=VeriPatrol Laravel Queue Worker
After=network.target mysql.service

[Service]
Type=simple
User=deploy
Group=www-data
WorkingDirectory=/var/www/backend/cs251-fyp-backend
ExecStart=/usr/bin/php artisan queue:work --sleep=3 --tries=3 --max-time=3600
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

Enable:

```bash
sudo systemctl daemon-reload
sudo systemctl enable laravel-queue
sudo systemctl start laravel-queue
```

Verify:

```bash
sudo systemctl status laravel-queue --no-pager
ps aux | grep '[q]ueue:work'
php artisan queue:failed
```

---

## 18. CORS

Laravel handles CORS.

Production origin:

```text
https://veripatrol.netlify.app
```

Expected preflight test:

```bash
curl -i -X OPTIONS \
  https://ikhwanarifi.site/api/auth/login \
  -H "Origin: https://veripatrol.netlify.app" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type, Authorization"
```

Expected:

```text
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: https://veripatrol.netlify.app
Access-Control-Allow-Credentials: true
```

Do not configure `Access-Control-Allow-Origin: *` because credentialed refresh cookies are used.

### Important troubleshooting note

A browser may display a "CORS" error when the real request returned an application-level `500` without CORS headers.

Always check:

```bash
sudo grep 'REQUEST_PATH' /var/log/nginx/access.log | tail
```

If `OPTIONS` is `204` but the real `POST` is `500`, investigate Laravel instead of changing CORS.

---

## 19. Refresh Cookie Configuration

Production refresh cookie:

```ini
AUTH_REFRESH_COOKIE_NAME=refresh_token
AUTH_REFRESH_COOKIE_SECURE=true
AUTH_REFRESH_COOKIE_SAME_SITE=none
AUTH_REFRESH_COOKIE_PATH=/api/auth
```

Expected properties:

```text
Secure
HttpOnly
SameSite=None
Path=/api/auth
```

The normal Laravel session cookie may remain `SameSite=Lax` if it is not required for cross-site authentication.

---

## 20. Netlify Frontend Environment

Use:

```ini
VITE_API_BASE_URL=https://ikhwanarifi.site/api
VITE_APP_BASE_NAME=/

VITE_REVERB_APP_KEY=YOUR_PUBLIC_REVERB_APP_KEY
VITE_REVERB_HOST=ikhwanarifi.site
VITE_REVERB_PORT=443
VITE_REVERB_SCHEME=https

VITE_VAPID_PUBLIC_KEY=YOUR_VAPID_PUBLIC_KEY
```

Frontend Reverb and backend Reverb intentionally use different endpoints:

| Side | Host | Port | Scheme |
|---|---|---:|---|
| Backend Laravel | `127.0.0.1` | `8080` | `http` |
| Netlify frontend | `ikhwanarifi.site` | `443` | `https` |

The browser connects through:

```text
wss://ikhwanarifi.site/app/...
```

Vite variables are embedded at build time. Trigger a new Netlify deployment after changing any `VITE_*` variable.

---

## 21. Web Push / VAPID

If FCM returns:

```text
403 Forbidden
the VAPID credentials in the authorization header do not correspond
to the credentials used to create the subscriptions
```

the browser subscription was created with a different VAPID key pair.

### Fix

1. Ensure backend and frontend use the same public VAPID key.
2. Remove stale rows from `push_subscriptions`.
3. Unsubscribe the browser's old push subscription.
4. Re-subscribe using the current key.
5. Redeploy Netlify after changing `VITE_VAPID_PUBLIC_KEY`.

Browser unsubscribe example:

```javascript
navigator.serviceWorker.ready.then(async registration => {
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
        await subscription.unsubscribe();
        console.log('Old push subscription removed');
    }
});
```

If VAPID private keys are rotated, old browser subscriptions must be recreated.

---

# Blockchain Deployment

## 22. Blockchain Architecture

VeriPatrol stores deterministic hashes on Ethereum Sepolia. Raw business data is not stored on-chain.

```text
Laravel
   |
   v
blockchain_records
   |
   v
AnchorBlockchainRecordJob
   |
   v
Ethereum RPC
   |
   v
EvidenceStore on Sepolia
```

### On-chain entities

Examples include:

```text
ANPR event            -> entity_created
ANPR image            -> evidence_file
Patrol session        -> validation_result
Password change       -> profile_password_changed
Email change          -> profile_email_changed
2FA reconfiguration   -> profile_2fa_reconfigured
```

Never store raw plate numbers, names, emails, GPS coordinates, or image data on-chain.

---

## 23. Sepolia Contract

| Item | Value |
|---|---|
| Network | Ethereum Sepolia |
| Chain ID | `11155111` |
| Contract | `0x463AA7890b41a4168c903626C9A5cFc83c50Ee09` |
| Owner / signer wallet | `0x7342327A607fC87584c4546906110De281Bc6F98` |
| ABI | `/var/www/backend/cs251-fyp-blockchain/deployments/sepolia/EvidenceStore.json` |

Contract ABI exposes:

```text
owner()
storeHash(bytes32)
verifyHash(bytes32)
transferOwnership(address)
```

Events:

```text
HashStored(bytes32 hash, address sender, uint256 timestamp)
OwnershipTransferred(address previousOwner, address newOwner)
```

---

## 24. Deploy Blockchain Repository

```bash
cd /var/www/backend
git clone YOUR_BLOCKCHAIN_REPOSITORY_URL cs251-fyp-blockchain
cd cs251-fyp-blockchain

npm ci
```

Verify:

```bash
npx hardhat --version
npm list ethers

node -e "
const d=require('./deployments/sepolia/EvidenceStore.json');
console.log(d.address);
"
```

Expected:

```text
0x463AA7890b41a4168c903626C9A5cFc83c50Ee09
```

### Permissions

Do not recursively force every Node file to `644`; that removes executable permissions from Hardhat binaries.

Use:

```bash
sudo chown -R deploy:www-data /var/www/backend/cs251-fyp-blockchain
```

Then verify the ABI is readable:

```bash
sudo -u www-data test -r \
  /var/www/backend/cs251-fyp-blockchain/deployments/sepolia/EvidenceStore.json \
  && echo "ABI readable by www-data"
```

If executable permissions are accidentally removed from `node_modules`, restore with:

```bash
rm -rf node_modules
npm ci
```

---

## 25. Sepolia RPC Verification

Never print or share the real RPC API key.

Temporary shell test:

```bash
read -s -p "Paste Sepolia RPC URL: " SEPOLIA_RPC_URL
echo
export SEPOLIA_RPC_URL
```

Verify network:

```bash
node -e "
const { ethers } = require('ethers');

(async () => {
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const network = await provider.getNetwork();
  const block = await provider.getBlockNumber();

  console.log('Chain ID:', network.chainId.toString());
  console.log('Latest block:', block);
})();
"
```

Expected:

```text
Chain ID: 11155111
```

Verify contract code:

```bash
node -e "
const { ethers } = require('ethers');

(async () => {
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const address = '0x463AA7890b41a4168c903626C9A5cFc83c50Ee09';
  const code = await provider.getCode(address);

  console.log('Contract code present:', code !== '0x');
  console.log('Bytecode length:', code.length);
})();
"
```

Expected:

```text
Contract code present: true
```

---

## 26. Laravel Blockchain `.env`

Add:

```ini
BLOCKCHAIN_ENABLED=true
BLOCKCHAIN_MODE=testnet
BLOCKCHAIN_NETWORK=sepolia
BLOCKCHAIN_ENVIRONMENT=staging
BLOCKCHAIN_CHAIN_ID=11155111

BLOCKCHAIN_RPC_URL=YOUR_SEPOLIA_RPC_URL

BLOCKCHAIN_CONTRACT_ADDRESS=0x463AA7890b41a4168c903626C9A5cFc83c50Ee09
BLOCKCHAIN_CONTRACT_ABI_PATH=../cs251-fyp-blockchain/deployments/sepolia/EvidenceStore.json

BLOCKCHAIN_WALLET_ADDRESS=0x7342327A607fC87584c4546906110De281Bc6F98
BLOCKCHAIN_PRIVATE_KEY=YOUR_SIGNER_PRIVATE_KEY

BLOCKCHAIN_CONFIRMATION_BLOCKS=2
BLOCKCHAIN_MAX_RETRIES=5
BLOCKCHAIN_RETRY_BASE_SECONDS=10
BLOCKCHAIN_CANONICAL_VERSION=v1
BLOCKCHAIN_HASH_ALGORITHM=sha256
```

Apply:

```bash
php artisan config:clear
php artisan config:cache
sudo systemctl restart laravel-queue
sudo systemctl restart php8.3-fpm
```

Verify:

```bash
php artisan blockchain:check-config
```

Safe Tinker check:

```bash
php artisan tinker --execute="
dump('enabled: '.(config('blockchain.enabled') ? 'true' : 'false'));
dump('network: '.config('blockchain.network'));
dump('chain_id: '.config('blockchain.chain_id'));
dump('rpc configured: '.(filled(config('blockchain.rpc_url')) ? 'yes' : 'no'));
dump('private key configured: '.(filled(config('blockchain.private_key')) ? 'yes' : 'no'));
"
```

---

## 27. Wallet Verification

The private key must derive the configured signer address.

Do not print the private key.

Expected verification result:

```text
Wallet match: true
```

Check Sepolia balance and chain:

```text
Network chain ID: 11155111
Balance: > 0 ETH
```

The production wallet must have Sepolia ETH for gas.

---

## 28. Blockchain Database Tables

Verify:

```bash
mysql -u ikhwan -p fyp
```

```sql
SHOW TABLES LIKE 'blockchain%';
```

Expected:

```text
blockchain_jobs
blockchain_records
blockchain_verifications
```

Typical lifecycle:

```text
pending
  ->
queued
  ->
processing
  ->
submitted
  ->
confirmed
```

Inspect recent records:

```sql
SELECT
    id,
    entity_type,
    proof_type,
    status,
    retry_count,
    tx_hash,
    last_error,
    created_at
FROM blockchain_records
ORDER BY created_at DESC
LIMIT 10;
```

---

## 29. Important Blockchain Troubleshooting

### `cURL error 7` to `127.0.0.1:7545`

This is the old Ganache RPC endpoint.

Production must use Sepolia.

Check:

```bash
grep '^BLOCKCHAIN_' .env | \
  sed -E \
  's#(BLOCKCHAIN_RPC_URL=).*#\1[SET]#; s#(BLOCKCHAIN_PRIVATE_KEY=).*#\1[SET]#'
```

Verify Laravel resolves Sepolia:

```bash
php artisan tinker --execute="
\$url=config('blockchain.rpc_url');
dump(str_starts_with(\$url, 'https://'));
dump(str_contains(\$url, 'sepolia'));
"
```

Expected:

```text
true
true
```

Then:

```bash
php artisan config:clear
php artisan config:cache
sudo systemctl restart laravel-queue
sudo systemctl restart php8.3-fpm
```

Old failed `blockchain_records` may still contain the historical Ganache error. Test using a newly created blockchain record after restarting the worker.

---

## 30. Patrol Validation Troubleshooting

Route:

```text
POST /api/patrol-sessions/{patrol_session}/validate
```

Controller flow:

```text
PatrolSessionController@validateSession
        |
        v
PatrolValidationService::validatePatrolSession()
        |
        v
BlockchainPatrolIntegrationService::anchorValidationResult()
        |
        v
PatrolBroadcastService::validationCompleted()
```

If the browser reports CORS but Nginx access logs show:

```text
OPTIONS -> 204
POST    -> 500
```

then the real problem is the Laravel `500`, not CORS.

Check:

```bash
sudo grep 'patrol-sessions/.*validate' /var/log/nginx/access.log | tail -20

tail -n 150 storage/logs/laravel.log

sudo journalctl -u php8.3-fpm --since "10 minutes ago" --no-pager
```

If `storage/logs/laravel.log` remains empty, confirm PHP-FPM can write to it.

---

## 31. Monitoring Commands

### Services

```bash
systemctl is-active \
  nginx \
  php8.3-fpm \
  mysql \
  reverb \
  laravel-queue \
  certbot.timer
```

Expected: all `active`.

### Listening ports

```bash
sudo ss -ltnp | grep -E ':22|:80|:443|:3306|:8080'
```

Expected architecture:

```text
22                    public SSH
80                    public Nginx
443                   public Nginx
127.0.0.1:3306        private MySQL
127.0.0.1:8080        private Reverb
```

### Logs

```bash
tail -f /var/www/backend/cs251-fyp-backend/storage/logs/laravel.log

sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

sudo journalctl -u reverb -f
sudo journalctl -u laravel-queue -f
sudo journalctl -u php8.3-fpm -f
```

---

## 32. Backend Redeployment Procedure

Use this after pushing new backend code.

```bash
cd /var/www/backend/cs251-fyp-backend

git pull origin main

composer install --no-dev --optimize-autoloader

php artisan migrate --force

php artisan config:clear
php artisan route:clear
php artisan view:clear

php artisan config:cache
php artisan route:cache
php artisan view:cache

sudo systemctl restart php8.3-fpm
sudo systemctl restart reverb
sudo systemctl restart laravel-queue

systemctl is-active php8.3-fpm reverb laravel-queue
```

If `.env` changed, always restart long-running workers.

---

## 33. Blockchain Repository Update Procedure

```bash
cd /var/www/backend/cs251-fyp-blockchain

git pull origin main
npm ci
```

If the contract is redeployed:

1. Update `BLOCKCHAIN_CONTRACT_ADDRESS`.
2. Update the ABI deployment JSON.
3. Update `BLOCKCHAIN_WALLET_ADDRESS` if ownership changed.
4. Re-cache Laravel config.
5. Restart the queue worker.

```bash
cd /var/www/backend/cs251-fyp-backend

php artisan config:clear
php artisan config:cache
php artisan migrate --force

sudo systemctl restart laravel-queue
sudo systemctl restart php8.3-fpm
```

---

## 34. Security Checklist

- `APP_DEBUG=false`
- Never commit `.env`.
- Never expose `APP_KEY`.
- Never expose `JWT_SECRET`.
- Never expose SMTP passwords.
- Never expose `REVERB_APP_SECRET`.
- Never expose `VAPID_PRIVATE_KEY`.
- Never expose `BLOCKCHAIN_PRIVATE_KEY`.
- Never publish an RPC provider API key unnecessarily.
- Keep MySQL on localhost only.
- Keep Reverb on `127.0.0.1:8080` only.
- Use HTTPS everywhere externally.
- Use `SameSite=None; Secure; HttpOnly` for cross-site refresh cookies.
- Rotate any secret immediately if it has been exposed.
- If the blockchain signer private key is exposed, create a new wallet and transfer smart-contract ownership before retiring the old key.
- Keep only hashes on-chain; never write raw evidence or personal information to Ethereum.

---

## 35. Current Production Verification Checklist

```text
[ ] DNS resolves ikhwanarifi.site to production Droplet
[ ] HTTP redirects to HTTPS
[ ] HTTPS returns 200
[ ] Certbot renewal dry-run succeeds
[ ] Nginx active
[ ] PHP-FPM active
[ ] MySQL active
[ ] Reverb active
[ ] Queue worker active
[ ] Reverb bound to 127.0.0.1:8080
[ ] MySQL bound to localhost
[ ] CORS preflight returns 204
[ ] Frontend origin allowed exactly
[ ] Refresh cookie is Secure + HttpOnly + SameSite=None
[ ] public/storage is LINKED
[ ] Laravel production caches enabled
[ ] All migrations Ran
[ ] failed_jobs table exists
[ ] RoleSeeder completed
[ ] ANPR upload limit configured
[ ] Sepolia RPC resolves chain 11155111
[ ] EvidenceStore bytecode exists
[ ] ABI readable by PHP
[ ] Blockchain wallet matches configured signer
[ ] Wallet has Sepolia ETH
[ ] Blockchain queue creates submitted/confirmed records
[ ] Web Push subscriptions use current VAPID key pair
```
