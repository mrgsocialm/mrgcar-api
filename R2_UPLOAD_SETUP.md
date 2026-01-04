# Cloudflare R2 Upload Setup

## Backend Configuration

### Environment Variables

Add these to your `.env` file (do NOT commit to git):

```env
R2_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your-access-key-id
R2_SECRET_ACCESS_KEY=your-secret-access-key
R2_BUCKET=your-bucket-name
R2_PUBLIC_BASE_URL=https://your-bucket-name.your-domain.com
```

### Getting R2 Credentials

1. Go to Cloudflare Dashboard → R2
2. Create a bucket (or use existing)
3. Go to "Manage R2 API Tokens"
4. Create API Token with "Object Read & Write" permissions
5. Copy the credentials:
   - **Access Key ID**: From the token creation page
   - **Secret Access Key**: Copy immediately (shown only once)
   - **Endpoint**: Format: `https://<account-id>.r2.cloudflarestorage.com`
   - **Bucket Name**: Your bucket name
   - **Public Base URL**: Your custom domain or R2 public URL

### API Endpoint

**POST /uploads/presign**

Request:
```json
{
  "filename": "image.jpg",
  "contentType": "image/jpeg",
  "folder": "cars" // Optional: "cars" | "news" | "sliders" | "misc" (default: "misc")
}
```

Response:
```json
{
  "ok": true,
  "data": {
    "uploadUrl": "https://...presigned-url...",
    "publicUrl": "https://your-bucket-name.your-domain.com/cars/2025/01/1234567890-abc123.jpg",
    "key": "cars/2025/01/1234567890-abc123.jpg"
  }
}
```

**Security:**
- Requires admin JWT token (Authorization: Bearer <token>)
- Only allows image types: jpeg, jpg, png, webp
- Presigned URL expires in 60 seconds

## Cloudflare R2 CORS Configuration

In Cloudflare Dashboard → R2 → Your Bucket → Settings → CORS:

**Allowed Origins:**
```
https://admin.mrgcar.com
https://mrgcar.com
http://localhost:3001
```

**Allowed Methods:**
```
GET, PUT, POST, HEAD
```

**Allowed Headers:**
```
*
```

**Expose Headers:**
```
ETag
```

## Admin Panel Usage

The `ImageUpload` component is already integrated into:
- Cars page (new/edit): `folder="cars"`
- News page (edit): `folder="news"`
- Sliders page (homepage): `folder="sliders"`

The component supports:
- Drag & drop file upload
- Click to select file
- Manual URL input (fallback)
- Image preview
- Upload progress indicator

## Testing

1. **Backend Test:**
   ```bash
   curl -X POST https://api.mrgcar.com/uploads/presign \
     -H "Authorization: Bearer <admin-token>" \
     -H "Content-Type: application/json" \
     -d '{"filename":"test.jpg","contentType":"image/jpeg","folder":"cars"}'
   ```

2. **Upload Test:**
   - Get presigned URL from step 1
   - Upload file:
     ```bash
     curl -X PUT <uploadUrl> \
       -H "Content-Type: image/jpeg" \
       --data-binary @test.jpg
     ```

3. **Verify:**
   - Check public URL in browser
   - Verify file appears in R2 bucket

## Troubleshooting

**Error: "R2 storage is not configured"**
- Check all R2_* environment variables are set
- Restart API server after adding env vars

**Error: "CORS policy"**
- Verify CORS settings in R2 bucket
- Check allowed origins include admin domain

**Error: "Presigned URL expired"**
- Presigned URLs expire in 60 seconds
- Upload immediately after getting URL

**Error: "Invalid content type"**
- Only image/jpeg, image/jpg, image/png, image/webp allowed
- Check file MIME type matches contentType parameter


