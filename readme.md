# DECANTS PARANA — versión Vercel

Catálogo de decants + panel privado en `/admin`.

- Sitio estático (`index.html`, `app.js`, `styles.css`, `assets/`).
- API en `api/[...path].mjs` (Vercel Function).
- Datos e imágenes del panel en **Vercel Blob**.

## Despliegue
1. `index.html`, `vercel.json` y la carpeta `api/` deben quedar **en la raíz** del repositorio / proyecto (no dentro de una subcarpeta).
2. En Vercel → Storage → **Blob** → crear store y *Connect Project* (crea `BLOB_READ_WRITE_TOKEN`).
3. En Settings → Environment Variables (Production):
   - `LAUREANO_ADMIN_USER`
   - `LAUREANO_ADMIN_PASSWORD`
   - `ADMIN_SESSION_SECRET` (cadena larga aleatoria)
4. Redeploy. Abrir `/admin`.

La primera vez que se entra al panel, el catálogo se crea desde `catalog-seed.json`; desde ahí los cambios quedan en Blob.
