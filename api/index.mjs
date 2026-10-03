// Backend del panel en Vercel Functions + Vercel Blob (reemplaza a Netlify Functions + Netlify Blobs).
import { put, list, del } from "@vercel/blob";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const PREFIX = "decants-parana";
const PRODUCTS_KEY = `${PREFIX}/catalog/products.json`;
const SETTINGS_KEY = `${PREFIX}/catalog/settings.json`;
const SESSION_COOKIE = "decants_admin_session";
const SESSION_HOURS = 12;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // Vercel limita el cuerpo de una función a 4,5 MB

const defaultSettings = {
  siteName: "DECANTS PARANA",
  heroEyebrow: "PERFUMERÍA · PARANÁ",
  heroTitle: "Tu perfume favorito,",
  heroTitleAccent: "en el tamaño justo.",
  heroText: "Elegí tu fragancia, seleccioná 5 ml o 10 ml y armá tu pedido. Recibimos pedidos por WhatsApp y el pago se realiza únicamente por transferencia.",
  catalogEyebrow: "CATÁLOGO",
  catalogTitle: "Elegí tu fragancia",
  howEyebrow: "SIMPLE Y DIRECTO",
  howTitle: "Cómo comprar",
  contactTitle: "¿Tenés una consulta?",
  contactText: "Escribinos por WhatsApp y te ayudamos con disponibilidad, entrega y medios de pago.",
  footerText: "DECANTS PARANA · Perfumes en 5 ml y 10 ml",
  whatsapp: "5493434161890",
  email: "c.martin.rodriguez.229@gmail.com",
  alias: "rayo.doblar.rizo.mp",
  price5: 12000,
  price10: 18000,
  currency: "ARS",
  primaryColor: "#1f2937",
  accentColor: "#b88952",
  backgroundColor: "#f7f5f1",
  cardColor: "#ffffff",
  textColor: "#1f2937",
  mutedColor: "#6b7280",
  fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
};

class ConfigError extends Error {}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra }
  });
}

// ---------- sesión ----------
function cookies(req) {
  const raw = req.headers.get("cookie") || "";
  return Object.fromEntries(raw.split(/;\s*/).filter(Boolean).map((x) => {
    const i = x.indexOf("=");
    return [x.slice(0, i), decodeURIComponent(x.slice(i + 1))];
  }));
}
function secret() {
  return process.env.ADMIN_SESSION_SECRET ||
    crypto.createHash("sha256").update(`${process.env.LAUREANO_ADMIN_USER || ""}:${process.env.LAUREANO_ADMIN_PASSWORD || ""}:decants-parana`).digest("hex");
}
const sign = (v) => crypto.createHmac("sha256", secret()).update(v).digest("base64url");
function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}
function makeSession(user) {
  const payload = Buffer.from(JSON.stringify({ u: user, exp: Date.now() + SESSION_HOURS * 3600 * 1000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}
function validSession(req) {
  const token = cookies(req)[SESSION_COOKIE];
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !safeEqual(sig, sign(payload))) return false;
  try { return JSON.parse(Buffer.from(payload, "base64url").toString()).exp > Date.now(); } catch { return false; }
}
function cookieHeader(token, maxAge = SESSION_HOURS * 3600) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

// ---------- almacenamiento (Vercel Blob) ----------
function requireBlob() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new ConfigError("Falta conectar Vercel Blob al proyecto (Storage → Blob → Connect Project) y volver a desplegar.");
  }
}
async function findBlob(pathname) {
  const { blobs } = await list({ prefix: pathname, limit: 20 });
  return blobs.find((b) => b.pathname === pathname) || null;
}
async function readJson(pathname) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  const b = await findBlob(pathname);
  if (!b) return null;
  const r = await fetch(`${b.url}?t=${Date.now()}`, { cache: "no-store" });
  if (!r.ok) return null;
  return r.json();
}
async function writeJson(pathname, data) {
  requireBlob();
  await put(pathname, JSON.stringify(data), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60
  });
}

async function loadSeed(req) {
  try {
    return JSON.parse(await readFile(join(process.cwd(), "catalog-seed.json"), "utf8"));
  } catch {
    const origin = new URL(req.url).origin;
    const r = await fetch(`${origin}/catalog-seed.json`);
    if (!r.ok) throw new Error("No se pudo leer catalog-seed.json");
    return r.json();
  }
}
const normalizeSeed = (seed) => seed.map((p) => ({
  ...p,
  visible: p.visible !== false,
  stock: Number.isFinite(p.stock) ? p.stock : 999,
  price5: p.price5 ?? 12000,
  price10: p.price10 ?? 18000,
  enabled5: p.enabled5 !== false,
  enabled10: p.enabled10 !== false
}));

async function getProducts(req, { persistSeed = true } = {}) {
  let data = await readJson(PRODUCTS_KEY);
  if (!data) {
    data = normalizeSeed(await loadSeed(req));
    if (persistSeed && process.env.BLOB_READ_WRITE_TOKEN) await writeJson(PRODUCTS_KEY, data);
  }
  return data;
}
async function getSettings() {
  const saved = await readJson(SETTINGS_KEY);
  return { ...defaultSettings, ...(saved || {}) };
}

function cleanProduct(p) {
  const id = String(p.id || "").trim();
  const name = String(p.name || "").trim();
  const brand = String(p.brand || "").trim();
  if (!id || !name || !brand) throw new Error("Cada producto necesita id, nombre y marca.");
  return {
    ...p, id, name, brand,
    visible: p.visible !== false,
    stock: Math.max(0, Number(p.stock) || 0),
    price5: Math.max(0, Number(p.price5) || 0),
    price10: Math.max(0, Number(p.price10) || 0),
    enabled5: p.enabled5 !== false,
    enabled10: p.enabled10 !== false,
    description: String(p.description || ""),
    image: String(p.image || ""),
    source: String(p.source || ""),
    sourceVerified: String(p.sourceVerified || "")
  };
}

const decode = (v) => { try { return decodeURIComponent(v); } catch { return v; } };
const safeId = (id) => String(id).replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120);
const EXT_BY_TYPE = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif", "image/svg+xml": "svg" };

async function handle(req) {
  const url = new URL(req.url);
  // vercel.json reescribe /api/<ruta> a /api/index?path=<ruta>; si no hubiera rewrite se usa la URL original.
  const raw = url.searchParams.get("path") ?? url.pathname.replace(/^\/api(\/index)?\/?/, "");
  const path = raw.replace(/^\/+|\/+$/g, "");
  const method = req.method;
  try {
    if (method === "GET" && path === "catalog") {
      const [products, settings] = await Promise.all([getProducts(req, { persistSeed: false }), getSettings()]);
      return json({ products: products.filter((p) => p.visible !== false), settings });
    }
    if (method === "POST" && path === "login") {
      const body = await req.json().catch(() => ({}));
      const user = process.env.LAUREANO_ADMIN_USER || "";
      const pass = process.env.LAUREANO_ADMIN_PASSWORD || "";
      if (!user || !pass) return json({ error: "Faltan configurar las variables LAUREANO_ADMIN_USER y LAUREANO_ADMIN_PASSWORD en Vercel." }, 503);
      if (!safeEqual(body.username ?? "", user) || !safeEqual(body.password ?? "", pass)) {
        return json({ error: "Usuario o contraseña incorrectos." }, 401);
      }
      return json({ ok: true, user }, 200, { "set-cookie": cookieHeader(makeSession(user)) });
    }
    if (method === "POST" && path === "logout") {
      return json({ ok: true }, 200, { "set-cookie": cookieHeader("", 0) });
    }
    if (method === "GET" && path === "session") return json({ authenticated: validSession(req) });

    // Las fotos son públicas: se redirige al archivo guardado en Vercel Blob.
    if (method === "GET" && path.startsWith("image/")) {
      requireBlob();
      const id = safeId(decode(path.slice(6)));
      const { blobs } = await list({ prefix: `${PREFIX}/images/${id}.`, limit: 5 });
      const item = blobs.find((b) => b.pathname.slice(`${PREFIX}/images/`.length).replace(/\.[a-z0-9]+$/i, "") === id);
      if (!item) return new Response("Not found", { status: 404 });
      return new Response(null, { status: 302, headers: { location: item.url, "cache-control": "public, max-age=60" } });
    }

    if (!validSession(req)) return json({ error: "No autorizado." }, 401);

    if (method === "GET" && path === "admin") {
      const [products, settings] = await Promise.all([getProducts(req), getSettings()]);
      return json({ products, settings });
    }
    if (method === "PUT" && path === "products") {
      const body = await req.json();
      const products = (Array.isArray(body.products) ? body.products : []).map(cleanProduct);
      await writeJson(PRODUCTS_KEY, products);
      return json({ ok: true, count: products.length });
    }
    if (method === "PUT" && path === "settings") {
      const body = await req.json();
      const current = await getSettings();
      const next = {
        ...current, ...body,
        price5: Math.max(0, Number(body.price5 ?? current.price5) || 0),
        price10: Math.max(0, Number(body.price10 ?? current.price10) || 0)
      };
      await writeJson(SETTINGS_KEY, next);
      return json({ ok: true, settings: next });
    }
    if (method === "POST" && path.startsWith("image/")) {
      requireBlob();
      const id = safeId(decode(path.slice(6)));
      const type = (req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      const ext = EXT_BY_TYPE[type];
      if (!ext) return json({ error: "Formato de imagen no admitido." }, 415);
      const buf = Buffer.from(await req.arrayBuffer());
      if (!buf.length) return json({ error: "No se recibió una imagen." }, 400);
      if (buf.length > MAX_IMAGE_BYTES) return json({ error: "La imagen supera el límite de 4 MB." }, 413);
      const pathname = `${PREFIX}/images/${id}.${ext}`;
      const { blobs } = await list({ prefix: `${PREFIX}/images/${id}.`, limit: 20 });
      await put(pathname, buf, { access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: type, cacheControlMaxAge: 60 });
      const old = blobs.filter((b) => b.pathname !== pathname && b.pathname.slice(`${PREFIX}/images/`.length).replace(/\.[a-z0-9]+$/i, "") === id).map((b) => b.url);
      if (old.length) await del(old);
      return json({ ok: true, url: `/api/image/${encodeURIComponent(id)}?v=${Date.now()}` });
    }
    return json({ error: "Ruta no encontrada." }, 404);
  } catch (e) {
    console.error(e);
    return json({ error: e.message || "Error interno." }, e instanceof ConfigError ? 503 : 500);
  }
}

export default { fetch: handle };
