---
description: Deploy API and Admin to VPS
---

## Deploy API to VPS
// turbo
1. Push changes to git first:
```bash
cd c:\Project\mrgcar-api
git add -A && git commit -m "Update" && git push
```

2. SSH to VPS and run deploy script:
```bash
ssh root@your-vps-ip "/usr/local/bin/deploy_api.sh"
```

Or directly run on VPS:
```bash
/usr/local/bin/deploy_api.sh
```

---

## Deploy Admin Panel to VPS
// turbo
1. Push changes to git first:
```bash
cd c:\Project\mrgcar-admin
git add -A && git commit -m "Update" && git push
```

2. SSH to VPS and run deploy script:
```bash
ssh root@your-vps-ip "/usr/local/bin/deploy_admin.sh"
```

Or directly run on VPS:
```bash
/usr/local/bin/deploy_admin.sh
```

---

## Run Pending Migrations (Manual)
After deploy, run any pending migrations:
```bash
psql -d mrgcar -f scripts/migrations/010_slider_reviews.sql
psql -d mrgcar -f scripts/migrations/013_user_ban_columns.sql
psql -d mrgcar -f scripts/migrations/014_nested_replies.sql
```
