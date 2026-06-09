# Bee Epic Apiary — Roadmap

## Phase 1: Current — Image Support (URLs & Data URIs)

The project fully supports images as URL strings and inline Data URIs.

| Image Type         | Storage                                 | Field Type                | Default Fallback                                                |
| ------------------ | --------------------------------------- | ------------------------- | --------------------------------------------------------------- |
| Product images     | Stripe `product.images[]` / URL strings | `imageUrls: string[]`     | SVG data URI (admin: Lucide package icon; web: honey pot emoji) |
| Product thumbnails | Stripe / URL strings                    | `thumbnailUrls: string[]` | Same as product default                                         |
| Logo               | KV via `ISiteContent.logo`              | `logo: string`            | `/images/bee-logo.svg`                                          |
| About images       | KV via `ISiteContent.aboutImages[]`     | `aboutImages: string[]`   | None                                                            |
| Process step icons | KV via `IProcessStep.icon`              | `icon: string`            | None                                                            |

**Admin UI**: All image fields are `<input type="url">` text inputs (`UrlInputList` component). No file upload mechanism.

**API**: No image-specific endpoints. Images are passed through to Stripe as URL strings or stored as-is in KV JSON.

---

## Phase 2: Image Upload via Cloudflare R2

### Goal

Allow admin users to upload image files directly (drag-and-drop / file picker) instead of manually pasting URLs. Uploaded files are stored in Cloudflare R2 and referenced via public URL.

### Components

#### 1. R2 Bucket Binding (services/)

- Create R2 bucket `epic-bee-apiary-images`:
  ```bash
  npx wrangler r2 bucket create epic-bee-apiary-images
  ```
- Add R2 binding to `services/wrangler.jsonc`:
  ```jsonc
  "r2_buckets": [
    { "binding": "IMAGES_BUCKET", "bucket_name": "epic-bee-apiary-images" }
  ]
  ```
- Run `npm run cf-typegen` to regenerate `Env` types with `IMAGES_BUCKET: R2Bucket`

#### 2. Upload Endpoint (services/src/router.ts)

Add route: `POST /upload`

- Accepts `multipart/form-data` with an image file field
- Validates:
  - Allowed MIME types: `image/png`, `image/jpeg`, `image/svg+xml`, `image/webp`
  - Max file size: ~5 MB (enforced in Worker)
  - Sanitized filename (UUID-based to prevent collision / path traversal)
- Stores in R2 under a key scheme:
  - `products/{uuid}.{ext}` for product images
  - `settings/{uuid}.{ext}` for logo / about images
- Returns `{ url: string, thumbnailUrl?: string }`:
  - The `url` points to the R2-hosted image (or proxy endpoint)
  - Optionally generate thumbnails via Cloudflare Images or a Worker-based pipeline (deferred to sub-phase)

#### 3. Public Image Serving

Two options:

| Option                                    | Pros                                             | Cons                                       |
| ----------------------------------------- | ------------------------------------------------ | ------------------------------------------ |
| **A. Public R2 bucket**                   | Simplest, no Worker CPU cost                     | No access control; public URL is guessable |
| **B. Worker proxy** (`GET /images/:path`) | Access control, caching headers, optional resize | Extra Worker invocation per image request  |

Recommendation: start with **Option A** (public bucket) for simplicity, add Option B later if needed.

#### 4. Admin UI: File Inputs (admin/)

- Add a file picker / dropzone component alongside existing URL text inputs in:
  - `ProductFormDialog` (product images, thumbnails)
  - `SiteContentTab` (logo, about images)
- Upload on selection, show preview thumbnail while uploading, append returned URL on success
- Keep the existing URL text input as a fallback for external images
- Library options: `<input type="file">` (vanilla) or `react-dropzone` (if drag-and-drop desired)

#### 5. Settings Image Migration

- Logo (`ISiteContent.logo`) and about images (`ISiteContent.aboutImages[]`) currently stored as URL strings in KV
- R2 upload adds a "Browse / Upload" button alongside the existing URL text field
- On upload: store file in R2, set the returned URL as the field value
- Existing URLs are preserved — R2 is additive

### No New Dependencies Required

- `admin/`: Native `<input type="file">` + `fetch` suffice; no new npm packages needed
- `services/`: Workers runtime provides `request.formData()` for multipart parsing; R2 binding is native; no new npm packages needed

### Migration Path (No Breaking Changes)

1. Add R2 binding and upload endpoint — existing URL-based flow continues working
2. Add file input UI alongside existing URL inputs (user choice)
3. Existing Data URIs and external URLs remain valid — R2 is additive, not replacing

### Future Sub-Phases (Post-MVP)

- **Image resizing**: Auto-generate thumbnails on upload via Cloudflare Images or `@cloudflare/puppeteer`
- **Image optimization**: WebP/AVIF conversion, responsive `srcset` generation
- **Media library**: A dedicated admin page to browse, delete, and re-use uploaded images
- **Access control**: Migrate from public R2 bucket to a Worker proxy with auth
