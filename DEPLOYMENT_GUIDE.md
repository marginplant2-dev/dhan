# DhanFunded Deployment Guide - AWS EC2 + MongoDB Atlas + Cloudflare

## Prerequisites
- Fresh AWS EC2 instance (Ubuntu 22.04 LTS recommended)
- Domain: dhanfunded.com connected to Cloudflare
- MongoDB Atlas account

---

## Part 1: MongoDB Atlas Setup

### 1.1 Create MongoDB Atlas Cluster
1. Go to https://cloud.mongodb.com
2. Create a new project: `DhanFunded`
3. Build a Database → Choose **M0 Free Tier** or **M10+ for production**
4. Select AWS as provider, choose region closest to your EC2 (e.g., Mumbai ap-south-1)
5. Create cluster

### 1.2 Create Database User
1. Go to **Database Access** → Add New Database User
2. Username: `dhanfunded_admin`
3. Password: Generate a strong password (save it!)
4. Role: `Atlas Admin` or `readWriteAnyDatabase`
5. Click **Add User**

### 1.3 Configure Network Access
1. Go to **Network Access** → Add IP Address
2. For production: Add your EC2's Elastic IP
3. For testing: Click **Allow Access from Anywhere** (0.0.0.0/0)
4. Click **Confirm**

### 1.4 Get Connection String
1. Go to **Database** → Click **Connect**
2. Choose **Connect your application**
3. Copy the connection string:
```
mongodb+srv://dhanfunded_admin:<password>@cluster0.xxxxx.mongodb.net/dhanfunded?retryWrites=true&w=majority
```
Replace `<password>` with your actual password.

---

## Part 2: AWS EC2 Setup

### 2.1 Launch EC2 Instance
- **AMI:** Ubuntu Server 22.04 LTS
- **Instance Type:** t3.medium (recommended) or t2.micro (free tier)
- **Storage:** 30GB+ SSD
- **Security Group:** Allow ports 22 (SSH), 80 (HTTP), 443 (HTTPS), 3001 (API)

### 2.2 Allocate Elastic IP
1. Go to EC2 → Elastic IPs → Allocate
2. Associate with your instance
3. Note the IP address (e.g., 13.xxx.xxx.xxx)

### 2.3 Connect to EC2
```bash
ssh -i your-key.pem ubuntu@YOUR_ELASTIC_IP
```

---

## Part 3: Server Setup Commands

### 3.1 Update System
```bash
sudo apt update && sudo apt upgrade -y
```

### 3.2 Install Node.js 20 LTS
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v  # Should show v20.x.x
npm -v
```

### 3.3 Install PM2 (Process Manager)
```bash
sudo npm install -g pm2
```

### 3.4 Install Nginx
```bash
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

### 3.5 Install Git
```bash
sudo apt install -y git
```

### 3.6 Install Redis (for Socket.IO scaling)
```bash
sudo apt install -y redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server
```

---

## Part 4: Deploy Application

### 4.1 Create App Directory
```bash
# Skip if already created during user setup
sudo mkdir -p /var/www/dhanfunded
sudo chown -R dhanfunded:dhanfunded /var/www/dhanfunded
cd /var/www/dhanfunded
```

### 4.2 Clone or Upload Your Code
**Option A: Using Git**
```bash
git clone https://github.com/YOUR_USERNAME/dhanfunded.git .
```

**Option B: Using SCP (from your local machine)**
```bash
# Run this on your LOCAL machine
scp -i your-key.pem -r /Users/tarundewangan/Downloads/Projects/dhanfunded/* ubuntu@YOUR_ELASTIC_IP:/var/www/dhanfunded/
```

### 4.3 Install Server Dependencies
```bash
cd /var/www/dhanfunded/server
npm install
```

### 4.4 Create Server Environment File
```bash
nano /var/www/dhanfunded/server/.env
```

Add the following content:
```env
# Server Configuration
PORT=3001
NODE_ENV=production

# MongoDB Atlas Connection
MONGODB_URI=mongodb+srv://dhanfunded_admin:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/dhanfunded?retryWrites=true&w=majority

# JWT Secret (generate a strong random string)
JWT_SECRET=DhanFunded-super-secret-key-change-this-in-production-2024

# Redis Configuration
REDIS_URL=redis://localhost:6379

# MetaAPI Configuration (if using)
META_API_TOKEN=your_metaapi_token
META_API_ACCOUNT_ID=your_account_id

# Guest User Settings
GUEST_DEFAULT_BALANCE=100000
GUEST_DEFAULT_PASSWORD=guest123

# Frontend URL (for CORS)
FRONTEND_URL=https://dhanfunded.com

# Admin Credentials
ADMIN_EMAIL=admin@dhanfunded.com
ADMIN_PASSWORD=your_secure_admin_password
```

Press `Ctrl+X`, then `Y`, then `Enter` to save.

### 4.5 Build Client
```bash
cd /var/www/dhanfunded/client
npm install
```

Create client environment file:
```bash
nano /var/www/dhanfunded/client/.env.production
```

Add:
```env
VITE_API_BASE_URL=https://api.dhanfunded.com
VITE_WS_URL=wss://api.dhanfunded.com
```

Build the client:
```bash
npm run build
```

### 4.6 Start Server with PM2
```bash
cd /var/www/dhanfunded/server
```

Run the command PM2 outputs to enable auto-start on reboot.

---

## Part 5: Nginx Configuration

### 5.1 Create Nginx Config for API (api.dhanfunded.com)
```bash
sudo nano /etc/nginx/sites-available/dhanfunded-api
```

Add:
```nginx
server {
    listen 80;
    server_name api.dhanfunded.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }
}
```

### 5.2 Create Nginx Config for Frontend (dhanfunded.com)
```bash
sudo nano /etc/nginx/sites-available/dhanfunded-frontend
```

Add:
```nginx
server {
    listen 80;
    server_name dhanfunded.com www.dhanfunded.com;

    root /var/www/dhanfunded/client/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### 5.3 Enable Sites
```bash
sudo ln -s /etc/nginx/sites-available/dhanfunded-api /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/dhanfunded-frontend /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

---

## Part 6: Cloudflare Configuration

### 6.1 Add DNS Records
Go to Cloudflare Dashboard → dhanfunded.com → DNS

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | @ | YOUR_EC2_ELASTIC_IP | Proxied (orange) |
| A | www | YOUR_EC2_ELASTIC_IP | Proxied (orange) |
| A | api | YOUR_EC2_ELASTIC_IP | Proxied (orange) |

### 6.2 SSL/TLS Settings
1. Go to **SSL/TLS** → Overview
2. Set encryption mode to **Full** (not Full Strict since we're not using origin certificates)

### 6.3 Edge Certificates
1. Go to **SSL/TLS** → Edge Certificates
2. Enable **Always Use HTTPS**
3. Enable **Automatic HTTPS Rewrites**

### 6.4 WebSocket Support (Important for Trading)
1. Go to **Network**
2. Enable **WebSockets**

### 6.5 Page Rules (Optional)
Create a page rule for API:
- URL: `api.dhanfunded.com/*`
- Settings: Cache Level = Bypass

---

## Part 7: Firewall Configuration

### 7.1 AWS Security Group
Ensure these inbound rules:
| Port | Protocol | Source | Description |
|------|----------|--------|-------------|
| 22 | TCP | Your IP | SSH |
| 80 | TCP | 0.0.0.0/0 | HTTP |
| 443 | TCP | 0.0.0.0/0 | HTTPS |

### 7.2 Ubuntu Firewall (UFW)
```bash
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
sudo ufw status
```

---

## Part 8: Useful Commands

### PM2 Commands
```bash
pm2 status              # Check status
pm2 logs dhanfunded-api    # View logs
pm2 restart dhanfunded-api # Restart server
pm2 stop dhanfunded-api    # Stop server
pm2 monit               # Monitor resources
```

### Nginx Commands
```bash
sudo systemctl status nginx
sudo systemctl restart nginx
sudo nginx -t           # Test config
sudo tail -f /var/log/nginx/error.log
```

### View Server Logs
```bash
pm2 logs dhanfunded-api --lines 100
```

### Update Application
```bash
cd /var/www/dhanfunded
git pull origin main

# Rebuild client
cd client
npm install
npm run build

# Restart server
cd ../server
npm install
pm2 restart dhanfunded-api
```

---

## Part 9: Verify Deployment

### 9.1 Test API
```bash
curl http://localhost:3001/api/health
# or from browser: https://api.dhanfunded.com/api/health
```

### 9.2 Test Frontend
Open https://dhanfunded.com in browser

### 9.3 Test WebSocket
Check browser console for WebSocket connection

---

## Part 10: Troubleshooting

### MongoDB Connection Issues
```bash
# Test MongoDB connection
cd /var/www/dhanfunded/server
node -e "const mongoose = require('mongoose'); mongoose.connect(process.env.MONGODB_URI).then(() => console.log('Connected!')).catch(err => console.error(err))"
```

### Port Already in Use
```bash
sudo lsof -i :3001
sudo kill -9 PID
```

### Nginx 502 Bad Gateway
```bash
# Check if Node.js server is running
pm2 status
pm2 restart dhanfunded-api
```

### Check Disk Space
```bash
df -h
```

### Check Memory
```bash
free -m
htop
```

---

## Quick Reference

| Service | URL |
|---------|-----|
| Frontend | https://dhanfunded.com |
| API | https://api.dhanfunded.com |
| WebSocket | wss://api.dhanfunded.com |

| Server | Port |
|--------|------|
| Node.js API | 3001 |
| Redis | 6379 |
| Nginx | 80, 443 |

---

## Security Checklist

- [ ] Change default passwords
- [ ] Use strong JWT secret
- [ ] Enable Cloudflare WAF
- [ ] Set up rate limiting
- [ ] Enable MongoDB Atlas IP whitelist
- [ ] Regular backups
- [ ] Monitor logs
- [ ] Keep packages updated

