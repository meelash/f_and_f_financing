# Deployment Guide

Complete guide for deploying Friends and Family Financing Portal to production.

## Pre-Deployment Checklist

- [ ] All tests passing (`npm run lint`, `npm run type-check`)
- [ ] Environment variables configured
- [ ] Database backups enabled
- [ ] SSL/TLS certificate obtained
- [ ] Domain DNS configured
- [ ] Security audit completed
- [ ] Load balancing configured (if multi-instance)
- [ ] Monitoring and alerts set up

## Environment Setup

### Production Environment Variables

Create a secure `.env.production` file with:

```bash
# Database
DATABASE_URL="postgresql://user:password@db-host:5432/ffp_db?sslmode=require"
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10

# Application
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://your-domain.com
NEXT_PUBLIC_SECURE_COOKIES=true

# Session
SESSION_COOKIE_NAME=ffp_session_user
SESSION_COOKIE_MAX_AGE=604800
```

**Security Notes:**
- Use strong, randomly generated database password
- Store secrets in environment manager (e.g., AWS Secrets Manager, Doppler, 1Password)
- Never commit `.env.production` to version control
- Use `sslmode=require` for PostgreSQL SSL connections
- Enable SSL/TLS certificate pinning if possible

## Database Setup

### PostgreSQL Configuration

1. **Create database and user:**

```sql
CREATE DATABASE ffp_db OWNER ffp_prod;
ALTER DATABASE ffp_db SET log_statement = 'all';
```

2. **Enable SSL:**

```sql
-- In postgresql.conf:
ssl = on
ssl_cert_file = 'path/to/server.crt'
ssl_key_file = 'path/to/server.key'
```

3. **Configure backups:**

```bash
# Daily backup script (cron)
0 2 * * * pg_dump -U ffp_prod ffp_db | gzip > /backups/ffp_db_$(date +%Y%m%d).sql.gz

# Archive backups for 30 days
find /backups -name "ffp_db_*.sql.gz" -mtime +30 -delete
```

4. **Push schema:**

```bash
DATABASE_URL="..." npm run db:push
```

5. **Optional: Seed production data**

```bash
# For first-time production setup only
npm run db:seed
```

### Connection Pooling

For production deployments with multiple instances, consider using PgBouncer:

```ini
# pgbouncer.ini
[databases]
ffp_db = host=db-host port=5432 dbname=ffp_db user=ffp_prod password=<password>

[pgbouncer]
listen_port = 6432
max_client_conn = 1000
default_pool_size = 25
min_pool_size = 10
```

Then update `DATABASE_URL` to point to PgBouncer:
```
DATABASE_URL="postgresql://ffp_prod:password@localhost:6432/ffp_db"
```

## Docker Deployment

### Build Production Image

```bash
docker build -t f-and-f-financing:latest .
docker build -t f-and-f-financing:v1.0.0 .  # Tag with version
```

### Run Container

```bash
docker run -d \
  --name ffp-app \
  -p 3000:3000 \
  --restart unless-stopped \
  -e DATABASE_URL="postgresql://..." \
  -e NODE_ENV=production \
  -e NEXT_PUBLIC_APP_URL="https://your-domain.com" \
  -e NEXT_PUBLIC_SECURE_COOKIES=true \
  f-and-f-financing:latest
```

### Docker Compose for Multiple Services

```yaml
version: '3.8'

services:
  app:
    image: f-and-f-financing:latest
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      DATABASE_URL: "postgresql://ffp_prod:${DB_PASSWORD}@db:5432/ffp_db"
      NEXT_PUBLIC_APP_URL: "https://your-domain.com"
      NEXT_PUBLIC_SECURE_COOKIES: "true"
    depends_on:
      - db
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ffp_prod
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: ffp_db
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ffp_prod"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

## Cloud Deployment

### Vercel Deployment

1. **Connect repository:**

```bash
vercel login
vercel link
```

2. **Configure environment:**

```bash
vercel env add DATABASE_URL
vercel env add NEXT_PUBLIC_APP_URL
vercel env add NEXT_PUBLIC_SECURE_COOKIES
```

3. **Deploy:**

```bash
vercel deploy --prod
```

### AWS Deployment (EC2 + RDS)

1. **Create RDS PostgreSQL instance:**

```bash
aws rds create-db-instance \
  --db-instance-identifier ffp-db \
  --db-instance-class db.t3.small \
  --engine postgres \
  --engine-version 16.1 \
  --master-username ffp_prod \
  --master-user-password <strong-password> \
  --allocated-storage 100 \
  --enable-cloudwatch-logs-exports postgresql
```

2. **Launch EC2 instance:**

```bash
aws ec2 run-instances \
  --image-id ami-0c55b159cbfafe1f0 \
  --instance-type t3.medium \
  --key-name your-key \
  --security-groups ffp-app
```

3. **Connect to EC2 and deploy:**

```bash
ssh -i your-key.pem ec2-user@instance-ip

# Install Node.js
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs

# Clone and setup
git clone https://github.com/your-repo/f-and-f-financing.git
cd f-and-f-financing
npm install

# Create .env.production
cat > .env.production << EOF
DATABASE_URL="postgresql://ffp_prod:password@rds-endpoint:5432/ffp_db?sslmode=require"
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://your-domain.com
NEXT_PUBLIC_SECURE_COOKIES=true
EOF

# Build and start
npm run build
npm run start
```

### DigitalOcean App Platform

1. **Create app:**

```bash
doctl apps create --spec app-spec.yaml
```

2. **app-spec.yaml:**

```yaml
name: f-and-f-financing
services:
- name: api
  github:
    repo: your-username/f-and-f-financing
    branch: main
  build_command: npm run build
  run_command: npm run start
  environment_slug: node-js
  envs:
  - key: NODE_ENV
    value: production
  - key: DATABASE_URL
    scope: RUN_TIME
    value: ${db.connection_string}
  http_port: 3000

databases:
- name: db
  engine: PG
  version: "16"
  size: db-s-1vcpu-1gb
```

## SSL/TLS Configuration

### Let's Encrypt with Certbot

```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot certonly --standalone -d your-domain.com
```

### Nginx Reverse Proxy

```nginx
upstream app {
    server localhost:3000;
}

server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    location / {
        proxy_pass http://app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Monitoring & Alerts

### Health Check Endpoint

```bash
curl https://your-domain.com/api/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2024-06-07T10:30:00Z"
}
```

### Logging Setup

1. **Application Logs:**

```bash
# Send logs to stdout (Docker captures these)
# Use structured logging for easier parsing
```

2. **Database Query Logging:**

```sql
-- Enable in PostgreSQL
ALTER DATABASE ffp_db SET log_statement = 'all';
ALTER DATABASE ffp_db SET log_duration = on;
```

3. **Monitoring Stack (Prometheus + Grafana):**

```yaml
# docker-compose.yml addition
  prometheus:
    image: prom/prometheus
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grafana
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
```

### Alerts Configuration

```yaml
# Alert rules (Prometheus)
groups:
  - name: ffp-alerts
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
        annotations:
          summary: "High error rate detected"

      - alert: DatabaseDown
        expr: up{job="postgres"} == 0
        annotations:
          summary: "Database unreachable"

      - alert: DiskSpaceRunningOut
        expr: disk_free_bytes < 10737418240  # 10GB
        annotations:
          summary: "Disk space below 10GB"
```

## Performance Optimization

### Caching Strategy

```bash
# Add Cache-Control headers in Next.js
// next.config.ts
headers: async () => [
  {
    source: '/api/:path*',
    headers: [
      { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
    ],
  },
  {
    source: '/_next/static/:path*',
    headers: [
      { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
    ],
  },
]
```

### Database Query Optimization

```sql
-- Index frequently queried columns
CREATE INDEX idx_partnership_user ON partnership_memberships(partnership_id, user_id);
CREATE INDEX idx_monthly_payment_posting ON monthly_payments(partnership_id, payment_month);
CREATE INDEX idx_ownership_snapshot_month ON ownership_snapshots(partnership_id, effective_month);
```

## Maintenance

### Regular Tasks

- **Daily**: Verify backups, monitor error logs
- **Weekly**: Review performance metrics, check database size
- **Monthly**: Analyze slow queries, update dependencies
- **Quarterly**: Security audit, disaster recovery test

### Upgrade Process

1. **Backup database:**

```bash
pg_dump ffp_db > backup_before_upgrade.sql
```

2. **Test in staging:**

```bash
git checkout new-version
npm install
npm run build
npm run db:push  # Test migration
npm run lint
npm run type-check
npm test
```

3. **Deploy to production:**

```bash
git checkout new-version
npm install
npm run build
npm run db:push
npm run start
```

4. **Verify:**

```bash
curl https://your-domain.com/api/health
# Monitor error logs for 30 minutes
```

## Troubleshooting

### Application Crashes

```bash
# Check logs
docker logs ffp-app

# Restart
docker restart ffp-app

# If persistent, check:
# - DATABASE_URL configuration
# - Database connectivity
# - Memory/CPU availability
```

### Database Issues

```bash
# Connect to database
psql postgresql://user:pass@host/ffp_db

# Check connections
SELECT count(*) FROM pg_stat_activity;

# Kill idle connections if needed
SELECT pg_terminate_backend(pid) FROM pg_stat_activity 
WHERE usename = 'ffp_prod' AND state = 'idle';
```

### SSL Certificate Renewal

```bash
# Certbot auto-renewal (runs via cron)
sudo certbot renew

# Manual renewal if needed
sudo certbot renew --force-renewal

# Verify renewal
sudo certbot certificates
```

## Security Hardening

### Network Security

- [ ] Enable VPC with private database subnet
- [ ] Restrict database access to app servers only
- [ ] Use security groups to limit inbound traffic
- [ ] Enable DDoS protection (AWS Shield, Cloudflare)

### Application Security

- [ ] Run regular security audits: `npm audit`
- [ ] Keep dependencies updated: `npm update`
- [ ] Enable Content Security Policy headers
- [ ] Implement rate limiting on all endpoints
- [ ] Log all authentication attempts
- [ ] Rotate secrets regularly

### Data Security

- [ ] Enable database encryption at rest
- [ ] Enable encryption in transit (SSL/TLS)
- [ ] Implement audit logging
- [ ] Regular backup testing
- [ ] Comply with data retention policies

## Rollback Procedure

If issues occur after deployment:

```bash
# Identify issue
docker logs ffp-app --tail 100

# Switch to previous version
docker stop ffp-app
docker run -d \
  --name ffp-app \
  ... (previous version image)

# If database schema changed, rollback:
git checkout previous-version
npm run db:push  # Rollback migration
```

---

For questions or issues, refer to the main README.md or contact the development team.
