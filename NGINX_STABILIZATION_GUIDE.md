# MRGCar NGINX + Cloudflare Cache Stabilizasyon Rehberi

## ADIM 0 — Mevcut Durumu Analiz Et

VPS'de şu komutları çalıştır:

```bash
# 1) Aktif site dosyalarını listele
echo "=== sites-enabled ==="
ls -la /etc/nginx/sites-enabled/
echo ""
echo "=== sites-available ==="
ls -la /etc/nginx/sites-available/

# 2) server_name çakışmalarını kontrol et
echo ""
echo "=== api.mrgcar.com kaç kez geçiyor ==="
sudo nginx -T 2>/dev/null | grep -n "server_name api.mrgcar.com" || echo "Bulunamadı"

echo ""
echo "=== admin.mrgcar.com kaç kez geçiyor ==="
sudo nginx -T 2>/dev/null | grep -n "server_name admin.mrgcar.com" || echo "Bulunamadı"

# 3) NGINX syntax kontrolü
echo ""
echo "=== NGINX syntax test ==="
sudo nginx -t
```

**Çıktıyı kaydet ve paylaş** - buna göre çakışan dosyaları belirleyeceğiz.

---

## ADIM 1 — Temiz NGINX Config Dosyaları

### A) API Config: `/etc/nginx/sites-available/api.mrgcar.com`

```nginx
# HTTP -> HTTPS Redirect
server {
    listen 80;
    server_name api.mrgcar.com;
    return 301 https://$host$request_uri;
}

# HTTPS Reverse Proxy
server {
    listen 443 ssl http2;
    server_name api.mrgcar.com;

    ssl_certificate     /etc/letsencrypt/live/api.mrgcar.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.mrgcar.com/privkey.pem;

    # SSL Security Headers
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;

    # Logging
    access_log /var/log/nginx/api.mrgcar.com.access.log;
    error_log /var/log/nginx/api.mrgcar.com.error.log;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Request-ID $http_x_request_id;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

### B) Admin Config: `/etc/nginx/sites-available/admin.mrgcar.com`

```nginx
# HTTP -> HTTPS Redirect
server {
    listen 80;
    server_name admin.mrgcar.com;
    return 301 https://$host$request_uri;
}

# HTTPS Reverse Proxy + WebSocket
server {
    listen 443 ssl http2;
    server_name admin.mrgcar.com;

    ssl_certificate     /etc/letsencrypt/live/admin.mrgcar.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/admin.mrgcar.com/privkey.pem;

    # SSL Security Headers
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;

    # Logging
    access_log /var/log/nginx/admin.mrgcar.com.access.log;
    error_log /var/log/nginx/admin.mrgcar.com.error.log;

    # Static files cache (Next.js chunks)
    location /_next/static/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Cache headers for static assets
        proxy_cache_valid 200 30d;
        add_header Cache-Control "public, immutable, max-age=2592000";
    }

    # Main app (no cache for HTML)
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_cache_bypass $http_upgrade;

        # No cache for HTML
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
        add_header Expires "0";

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

---

## ADIM 2 — Dosyaları Oluştur ve Enable Et

VPS'de şu komutları sırayla çalıştır:

```bash
# 1) API config dosyasını oluştur
sudo tee /etc/nginx/sites-available/api.mrgcar.com > /dev/null << 'EOF'
# HTTP -> HTTPS Redirect
server {
    listen 80;
    server_name api.mrgcar.com;
    return 301 https://$host$request_uri;
}

# HTTPS Reverse Proxy
server {
    listen 443 ssl http2;
    server_name api.mrgcar.com;

    ssl_certificate     /etc/letsencrypt/live/api.mrgcar.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.mrgcar.com/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;

    access_log /var/log/nginx/api.mrgcar.com.access.log;
    error_log /var/log/nginx/api.mrgcar.com.error.log;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Request-ID $http_x_request_id;

        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
EOF

# 2) Admin config dosyasını oluştur
sudo tee /etc/nginx/sites-available/admin.mrgcar.com > /dev/null << 'EOF'
# HTTP -> HTTPS Redirect
server {
    listen 80;
    server_name admin.mrgcar.com;
    return 301 https://$host$request_uri;
}

# HTTPS Reverse Proxy + WebSocket
server {
    listen 443 ssl http2;
    server_name admin.mrgcar.com;

    ssl_certificate     /etc/letsencrypt/live/admin.mrgcar.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/admin.mrgcar.com/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;

    access_log /var/log/nginx/admin.mrgcar.com.access.log;
    error_log /var/log/nginx/admin.mrgcar.com.error.log;

    location /_next/static/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_cache_valid 200 30d;
        add_header Cache-Control "public, immutable, max-age=2592000";
    }

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_cache_bypass $http_upgrade;

        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
        add_header Expires "0";

        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
EOF

# 3) Eski çakışan dosyaları bul ve disable et
echo "=== Eski dosyaları kontrol ediyoruz ==="
cd /etc/nginx/sites-enabled/
for file in *; do
    if [ -L "$file" ]; then
        if grep -q "server_name api.mrgcar.com" "/etc/nginx/sites-available/$file" 2>/dev/null && [ "$file" != "api.mrgcar.com" ]; then
            echo "⚠️  Çakışan dosya bulundu: $file (api.mrgcar.com için)"
            echo "   Disable ediliyor..."
            sudo rm "$file"
        fi
        if grep -q "server_name admin.mrgcar.com" "/etc/nginx/sites-available/$file" 2>/dev/null && [ "$file" != "admin.mrgcar.com" ]; then
            echo "⚠️  Çakışan dosya bulundu: $file (admin.mrgcar.com için)"
            echo "   Disable ediliyor..."
            sudo rm "$file"
        fi
    fi
done

# 4) Yeni configleri enable et
echo ""
echo "=== Yeni configleri enable ediyoruz ==="
sudo ln -sf /etc/nginx/sites-available/api.mrgcar.com /etc/nginx/sites-enabled/api.mrgcar.com
sudo ln -sf /etc/nginx/sites-available/admin.mrgcar.com /etc/nginx/sites-enabled/admin.mrgcar.com

echo "✅ Dosyalar oluşturuldu ve enable edildi"
```

---

## ADIM 3 — NGINX Test ve Reload

```bash
# Syntax test
echo "=== NGINX syntax test ==="
sudo nginx -t

# Eğer test başarılıysa reload
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Syntax OK, reload yapılıyor..."
    sudo systemctl reload nginx
    echo "✅ NGINX reload edildi"
else
    echo "❌ Syntax hatası var! Lütfen kontrol et."
    exit 1
fi
```

---

## ADIM 4 — Doğrulama Testleri

```bash
# 1) server_name sayısı kontrolü (her domain 2 kez olmalı: 80 ve 443)
echo "=== server_name kontrolü ==="
echo ""
echo "api.mrgcar.com:"
sudo nginx -T 2>/dev/null | grep -c "server_name api.mrgcar.com" || echo "0"
echo "(Beklenti: 2 - HTTP ve HTTPS)"

echo ""
echo "admin.mrgcar.com:"
sudo nginx -T 2>/dev/null | grep -c "server_name admin.mrgcar.com" || echo "0"
echo "(Beklenti: 2 - HTTP ve HTTPS)"

# 2) Endpoint test
echo ""
echo "=== Endpoint testleri ==="
echo ""
echo "API Health Check:"
curl -I https://api.mrgcar.com/ 2>&1 | head -5

echo ""
echo "Admin Panel:"
curl -I https://admin.mrgcar.com/ 2>&1 | head -5

# 3) Port kontrolü
echo ""
echo "=== Port kontrolü ==="
ss -lntp | grep -E ':(3000|3001|80|443)' || echo "Portlar dinlenmiyor"

# 4) PM2 durumu
echo ""
echo "=== PM2 durumu ==="
pm2 list
```

---

## ADIM 5 — Cloudflare Cache Rules

Cloudflare Dashboard'da şu kuralları oluştur:

### Kural 1: HTML Bypass (admin.mrgcar.com)

**Rules → Cache Rules → Create Rule**

- **Rule Name:** `Admin HTML - No Cache`
- **If:**
  - Hostname equals `admin.mrgcar.com`
  - AND URI Path does NOT start with `/_next/static/`
- **Then:**
  - Cache status: `Bypass`

### Kural 2: Static Chunks Cache (admin.mrgcar.com)

**Rules → Cache Rules → Create Rule**

- **Rule Name:** `Admin Static Chunks - Long Cache`
- **If:**
  - Hostname equals `admin.mrgcar.com`
  - AND URI Path starts with `/_next/static/`
- **Then:**
  - Cache status: `Cache`
  - Edge TTL: `1 month`
  - Browser TTL: `1 month`

### Kural 3: API No Cache (api.mrgcar.com)

**Rules → Cache Rules → Create Rule**

- **Rule Name:** `API - No Cache`
- **If:**
  - Hostname equals `api.mrgcar.com`
- **Then:**
  - Cache status: `Bypass`

---

## Özet ve Notlar

### Yapılan Değişiklikler:
1. ✅ Temiz NGINX config dosyaları oluşturuldu
2. ✅ Eski çakışan dosyalar devre dışı bırakıldı
3. ✅ HTTP → HTTPS redirect eklendi
4. ✅ Reverse proxy ayarları optimize edildi
5. ✅ Admin panel için WebSocket desteği eklendi
6. ✅ Static chunks için cache headers eklendi
7. ✅ HTML için no-cache headers eklendi

### Test Sonuçları:
- [ ] server_name sayısı doğru (her domain 2 kez)
- [ ] API endpoint çalışıyor
- [ ] Admin endpoint çalışıyor
- [ ] Portlar dinleniyor
- [ ] PM2 processler çalışıyor

### Cloudflare Cache:
- [ ] HTML bypass kuralı eklendi
- [ ] Static chunks cache kuralı eklendi
- [ ] API bypass kuralı eklendi

---

## Sorun Giderme

### Eğer NGINX test başarısız olursa:
```bash
# Detaylı hata mesajı
sudo nginx -t

# Config dosyalarını kontrol et
sudo nginx -T | grep -A 10 "server_name api.mrgcar.com"
sudo nginx -T | grep -A 10 "server_name admin.mrgcar.com"
```

### Eğer SSL sertifikası bulunamazsa:
```bash
# Certbot ile sertifika kontrolü
sudo certbot certificates

# Eğer yoksa oluştur:
sudo certbot --nginx -d api.mrgcar.com
sudo certbot --nginx -d admin.mrgcar.com
```

### Eğer chunk 404 hatası devam ederse:
1. Cloudflare cache'i temizle: **Caching → Purge Everything**
2. Admin panel'i rebuild et: `cd /var/www/admin && npm run build`
3. PM2 restart: `pm2 restart admin`

