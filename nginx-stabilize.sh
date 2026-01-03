#!/bin/bash
# MRGCar NGINX Stabilizasyon Script
# VPS'de root veya sudo yetkisiyle çalıştır

set -e  # Hata durumunda dur

echo "=========================================="
echo "MRGCar NGINX Stabilizasyon Başlıyor"
echo "=========================================="
echo ""

# ADIM 0: Mevcut durumu analiz et
echo "=== ADIM 0: Mevcut Durum Analizi ==="
echo ""
echo "sites-enabled:"
ls -la /etc/nginx/sites-enabled/ || echo "Dizin bulunamadı"
echo ""
echo "sites-available:"
ls -la /etc/nginx/sites-available/ || echo "Dizin bulunamadı"
echo ""
echo "api.mrgcar.com server_name sayısı:"
API_COUNT=$(sudo nginx -T 2>/dev/null | grep -c "server_name api.mrgcar.com" || echo "0")
echo "  Bulundu: $API_COUNT kez"
echo ""
echo "admin.mrgcar.com server_name sayısı:"
ADMIN_COUNT=$(sudo nginx -T 2>/dev/null | grep -c "server_name admin.mrgcar.com" || echo "0")
echo "  Bulundu: $ADMIN_COUNT kez"
echo ""

# Kullanıcıdan onay al
read -p "Devam etmek istiyor musun? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "İptal edildi."
    exit 1
fi

# ADIM 1: Config dosyalarını oluştur
echo ""
echo "=== ADIM 1: Config Dosyaları Oluşturuluyor ==="

# API config
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
echo "✅ api.mrgcar.com config oluşturuldu"

# Admin config
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
echo "✅ admin.mrgcar.com config oluşturuldu"

# ADIM 2: Eski çakışan dosyaları disable et
echo ""
echo "=== ADIM 2: Eski Çakışan Dosyalar Kontrol Ediliyor ==="
cd /etc/nginx/sites-enabled/
DISABLED_FILES=()

for file in *; do
    if [ -L "$file" ] && [ -f "/etc/nginx/sites-available/$file" ]; then
        # API çakışması kontrolü
        if grep -q "server_name api.mrgcar.com" "/etc/nginx/sites-available/$file" 2>/dev/null && [ "$file" != "api.mrgcar.com" ]; then
            echo "⚠️  Çakışan dosya: $file (api.mrgcar.com için)"
            sudo rm "$file"
            DISABLED_FILES+=("$file")
        fi
        # Admin çakışması kontrolü
        if grep -q "server_name admin.mrgcar.com" "/etc/nginx/sites-available/$file" 2>/dev/null && [ "$file" != "admin.mrgcar.com" ]; then
            echo "⚠️  Çakışan dosya: $file (admin.mrgcar.com için)"
            sudo rm "$file"
            DISABLED_FILES+=("$file")
        fi
    fi
done

if [ ${#DISABLED_FILES[@]} -eq 0 ]; then
    echo "✅ Çakışan dosya bulunamadı"
else
    echo "✅ Devre dışı bırakılan dosyalar: ${DISABLED_FILES[*]}"
fi

# Yeni configleri enable et
echo ""
echo "=== Yeni Configler Enable Ediliyor ==="
sudo ln -sf /etc/nginx/sites-available/api.mrgcar.com /etc/nginx/sites-enabled/api.mrgcar.com
sudo ln -sf /etc/nginx/sites-available/admin.mrgcar.com /etc/nginx/sites-enabled/admin.mrgcar.com
echo "✅ Configler enable edildi"

# ADIM 3: NGINX test
echo ""
echo "=== ADIM 3: NGINX Test ==="
if sudo nginx -t; then
    echo "✅ NGINX syntax OK"
else
    echo "❌ NGINX syntax hatası!"
    exit 1
fi

# Reload
echo ""
echo "=== NGINX Reload ==="
sudo systemctl reload nginx
echo "✅ NGINX reload edildi"

# ADIM 4: Doğrulama
echo ""
echo "=== ADIM 4: Doğrulama Testleri ==="
echo ""
echo "server_name sayıları:"
NEW_API_COUNT=$(sudo nginx -T 2>/dev/null | grep -c "server_name api.mrgcar.com" || echo "0")
NEW_ADMIN_COUNT=$(sudo nginx -T 2>/dev/null | grep -c "server_name admin.mrgcar.com" || echo "0")
echo "  api.mrgcar.com: $NEW_API_COUNT (beklenti: 2)"
echo "  admin.mrgcar.com: $NEW_ADMIN_COUNT (beklenti: 2)"

if [ "$NEW_API_COUNT" -eq 2 ] && [ "$NEW_ADMIN_COUNT" -eq 2 ]; then
    echo "✅ server_name sayıları doğru"
else
    echo "⚠️  server_name sayıları beklenenden farklı"
fi

echo ""
echo "Port kontrolü:"
ss -lntp | grep -E ':(3000|3001|80|443)' || echo "⚠️  Bazı portlar dinlenmiyor"

echo ""
echo "PM2 durumu:"
pm2 list || echo "⚠️  PM2 çalışmıyor"

echo ""
echo "=========================================="
echo "✅ NGINX Stabilizasyon Tamamlandı!"
echo "=========================================="
echo ""
echo "Sonraki adımlar:"
echo "1. Cloudflare Cache Rules'ı manuel olarak ekle (NGINX_STABILIZATION_GUIDE.md'ye bak)"
echo "2. Endpoint testleri yap:"
echo "   curl -I https://api.mrgcar.com/"
echo "   curl -I https://admin.mrgcar.com/"
echo ""

