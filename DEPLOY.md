# Запуск на российском сервере Xonta (80.68.156.117)

Сервис работает в Docker и слушает только `127.0.0.1:4031`. Наружу по HTTPS его отдаёт веб-сервер, который уже обслуживает xonta.ru. Сам маркетплейс сервис не трогает.

## 0. DNS (один раз)

Там, где управляется домен xonta.ru, добавьте запись:

```
mcp   A   80.68.156.117
```

Проверка с вашего компьютера через 5–30 минут: `ping mcp.xonta.ru` должен показать 80.68.156.117.

## 1. Посмотреть, что стоит на сервере

```bash
ssh xonta@80.68.156.117
docker --version; docker compose version
sudo ss -ltnp | grep -E ':(80|443) '
```

Последняя команда покажет, кто держит порты 80 и 443: `nginx`, `caddy` или `docker-proxy` (веб-сервер внутри контейнера). Пришлите вывод, если что-то непонятно.

Если Docker не установлен: `sudo apt update && sudo apt install -y docker.io docker-compose-v2 && sudo usermod -aG docker xonta`, затем перезайдите по ssh.

## 2. Загрузить и запустить сервис

С вашего компьютера:

```bash
scp ~/Downloads/xonta-docs-v1.0.1.zip xonta@80.68.156.117:~/
```

На сервере:

```bash
cd ~ && unzip -o xonta-docs-v1.0.1.zip -d xonta-docs && cd xonta-docs
cp .env.example .env
sed -i "s/change-me/$(openssl rand -hex 12)/" .env
mkdir -p logs files && sudo chown 1000:1000 logs files
docker compose up -d --build
curl -s localhost:4031/health          # {"ok":true,"version":"1.0.0"}
```

## 3. Открыть наружу по HTTPS

### Вариант А: на сервере nginx (самый вероятный)

```bash
sudo tee /etc/nginx/sites-available/mcp.xonta.ru >/dev/null <<'EOF'
server {
    listen 80;
    server_name mcp.xonta.ru;
    location / {
        proxy_pass http://127.0.0.1:4031;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
sudo ln -sf /etc/nginx/sites-available/mcp.xonta.ru /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d mcp.xonta.ru     # сертификат Let's Encrypt; certbot сам допишет HTTPS
```

Если certbot не установлен: `sudo apt install -y certbot python3-certbot-nginx`.
Если конфиги nginx лежат в `/etc/nginx/conf.d/`, положите файл туда как `mcp.xonta.ru.conf` и пропустите команду `ln`.

### Вариант Б: на сервере Caddy

Добавьте в Caddyfile и перезагрузите Caddy (`sudo systemctl reload caddy`):

```
mcp.xonta.ru {
	encode gzip
	reverse_proxy 127.0.0.1:4031
}
```

Если Caddy работает в Docker-контейнере, вместо `127.0.0.1` нужен адрес хоста. В этом случае пришлите `docker ps`, подскажу точную строку.

## 4. Проверить

```bash
curl https://mcp.xonta.ru/health
curl -X POST https://mcp.xonta.ru/v1/text/amount-in-words -H "Content-Type: application/json" -d '{"amount":"1234.56","vat_rate":"22"}'
```

Главная страница в браузере: https://mcp.xonta.ru

## Статистика

```bash
cd ~/xonta-docs && docker compose exec docs node src/stats.js      # за 14 дней
docker compose exec docs node src/stats.js 60                       # за 60 дней
```

Журнал лежит в `~/xonta-docs/logs/calls.jsonl` и не пропадает при пересборке. ФИО и реквизиты в него не пишутся.

## Обновление

```bash
cd ~ && unzip -o xonta-docs-vX.zip -d xonta-docs && cd xonta-docs && docker compose up -d --build
```
