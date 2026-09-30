# DECANTS PARANA 4.0 — Netlify solamente

Esta versión no utiliza Supabase ni otro backend externo.

## Qué incluye
- Sitio público responsive.
- Panel privado en `/admin`.
- Usuario administrador configurado mediante variables de entorno de Netlify.
- Autenticación por sesión HttpOnly firmada.
- Netlify Functions como API/backend.
- Netlify Blobs como almacenamiento persistente para productos, configuración e imágenes.
- CRUD de productos: agregar, editar, eliminar, descripción, fuente, foto, stock/cantidad, visibilidad, precios 5 ml/10 ml y activación de cada tamaño.
- Edición de precios generales, WhatsApp, email, alias de Mercado Pago.
- Edición de textos principales y estilos/colores/tipografía.
- El catálogo público muestra únicamente productos marcados como visibles.
- Los cambios del panel sobreviven a nuevos deploys porque se guardan en un Site-wide Netlify Blob Store.

## Credenciales solicitadas
Por seguridad, la contraseña **no está escrita dentro del ZIP ni del JavaScript del navegador**.

En Netlify crear estas variables de entorno:

- `LAUREANO_ADMIN_USER` = `laureano`
- `LAUREANO_ADMIN_PASSWORD` = `laucha`
- `ADMIN_SESSION_SECRET` = una cadena larga y aleatoria, por ejemplo generada con un gestor de contraseñas.

Las variables deben estar disponibles para Functions. Netlify permite que las Functions accedan a variables de entorno en runtime. No las pongas en `netlify.toml`.

## Publicación
1. Crear un sitio en Netlify.
2. Subir este ZIP descomprimido como sitio, o conectar el repositorio.
3. Netlify detectará `netlify.toml` y las Functions de `netlify/functions`.
4. Configurar las 3 variables anteriores en el panel de Netlify.
5. Hacer un nuevo deploy después de guardar las variables.
6. Abrir `/admin` para administrar el catálogo.

## Primera carga
La primera visita a `/api/catalog` crea el catálogo persistente a partir de `catalog-seed.json` (178 productos). Una vez creado el Blob, los cambios realizados desde el panel pasan a ser la versión activa.

## Imágenes
El panel permite subir imágenes de hasta 5 MB. Se guardan en Netlify Blobs y se sirven mediante `/api/image/...`.

## Importante
El ZIP contiene una copia inicial del catálogo. Si se vuelve a crear el almacenamiento desde cero, esa copia sirve como semilla. Los cambios posteriores no modifican `catalog-seed.json` automáticamente: se guardan en Netlify Blobs.
