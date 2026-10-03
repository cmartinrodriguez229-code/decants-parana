# Cómo poner las fotos reales

Hay **10 productos con foto real** y **168 con una ilustración provisoria** (frasco con marca y nombre).

## Opción A — desde el panel (recomendada)
1. Entrá a `/admin` → Editar producto.
2. "Subir foto" (se optimiza automáticamente) → "Aplicar al listado" → "Guardar cambios".

## Opción B — masivo, por carpeta
1. Guardá cada foto como **JPG** con el nombre exacto de la columna `nombre_de_archivo_exacto`
   de `FOTOS-PENDIENTES.csv` (ejemplo: `lattafa-asad-zanzibar.jpg`).
2. Ponelas en `assets/perfumes/` y volvé a subir la carpeta a Vercel.
3. El sitio usa automáticamente la foto real si existe; si no, muestra la ilustración.

Prioridad de origen sugerida: sitio oficial de la marca → tienda online reconocida.
Recomendación: fondo blanco, frasco centrado, imagen cuadrada de al menos 800 px.
