import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";

const store = () => getStore("decants-parana");
const KEYS = { products: "catalog/products", settings: "catalog/settings" };
const SESSION_COOKIE = "decants_admin_session";
const SESSION_HOURS = 12;

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

function json(data, status=200, extra={}) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", ...extra } });
}
function noStoreHeaders(){ return { "cache-control": "no-store" }; }
function cookies(req){
  const raw = req.headers.get("cookie") || "";
  return Object.fromEntries(raw.split(/;\s*/).filter(Boolean).map(x => { const i=x.indexOf("="); return [x.slice(0,i), decodeURIComponent(x.slice(i+1))]; }));
}
function secret(){ return process.env.ADMIN_SESSION_SECRET || crypto.createHash("sha256").update(`${process.env.LAUREANO_ADMIN_USER||""}:${process.env.LAUREANO_ADMIN_PASSWORD||""}:decants-parana`).digest("hex"); }
function sign(value){ return crypto.createHmac("sha256", secret()).update(value).digest("base64url"); }
function makeSession(user){
  const payload = Buffer.from(JSON.stringify({u:user, exp:Date.now()+SESSION_HOURS*3600*1000})).toString("base64url");
  return `${payload}.${sign(payload)}`;
}
function validSession(req){
  const token = cookies(req)[SESSION_COOKIE]; if(!token) return false;
  const [payload, sig] = token.split("."); if(!payload || !sig) return false;
  const expected=sign(payload);
  if(!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  try { return JSON.parse(Buffer.from(payload,"base64url").toString()).exp > Date.now(); } catch { return false; }
}
function requireAdmin(req){ return validSession(req); }
async function getProducts(){
  let data = await store().get(KEYS.products,{type:"json"});
  if(!data){
    const seed = JSON.parse(await readFile(new URL("../../catalog-seed.json", import.meta.url), "utf8"));
    data = seed.map(p=>({ ...p, visible: p.visible !== false, stock: Number.isFinite(p.stock) ? p.stock : 999, price5: p.price5 ?? 12000, price10: p.price10 ?? 18000, enabled5: p.enabled5 !== false, enabled10: p.enabled10 !== false }));
    await store().setJSON(KEYS.products,data);
  }
  return data;
}
async function getSettings(){
  const saved = await store().get(KEYS.settings,{type:"json"});
  return {...defaultSettings,...(saved||{})};
}
function cleanProduct(p){
  const id=String(p.id||"").trim();
  const name=String(p.name||"").trim();
  const brand=String(p.brand||"").trim();
  if(!id||!name||!brand) throw new Error("Cada producto necesita id, nombre y marca.");
  return {
    ...p, id, name, brand,
    visible: p.visible !== false,
    stock: Math.max(0, Number(p.stock)||0),
    price5: Math.max(0, Number(p.price5)||0), price10: Math.max(0, Number(p.price10)||0),
    enabled5: p.enabled5 !== false, enabled10: p.enabled10 !== false,
    description: String(p.description||""), image: String(p.image||""), source: String(p.source||""), sourceVerified: String(p.sourceVerified||"")
  };
}
function cookieHeader(token, maxAge=SESSION_HOURS*3600){ return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`; }

export default async (req) => {
  const url=new URL(req.url); const path=url.pathname.replace(/^\/api\/?/,"");
  try {
    if(req.method==="GET" && path==="catalog"){
      const [products,settings]=await Promise.all([getProducts(),getSettings()]);
      return json({products:products.filter(p=>p.visible),settings},200,noStoreHeaders());
    }
    if(req.method==="POST" && path==="login"){
      const body=await req.json().catch(()=>({}));
      const user=process.env.LAUREANO_ADMIN_USER || ""; const pass=process.env.LAUREANO_ADMIN_PASSWORD || "";
      if(!user || !pass) return json({error:"Faltan configurar las variables de administrador en Netlify."},503);
      const ok=body.username===user && body.password===pass;
      if(!ok) return json({error:"Usuario o contraseña incorrectos."},401);
      return json({ok:true,user},200,{"set-cookie":cookieHeader(makeSession(user)),...noStoreHeaders()});
    }
    if(req.method==="POST" && path==="logout"){
      return json({ok:true},200,{"set-cookie":cookieHeader("",0),...noStoreHeaders()});
    }
    if(req.method==="GET" && path==="session") return json({authenticated:validSession(req)},200,noStoreHeaders());
    if(!requireAdmin(req)) return json({error:"No autorizado."},401,noStoreHeaders());

    if(req.method==="GET" && path==="admin"){
      const [products,settings]=await Promise.all([getProducts(),getSettings()]);
      return json({products,settings},200,noStoreHeaders());
    }
    if(req.method==="PUT" && path==="products"){
      const body=await req.json(); const incoming=Array.isArray(body.products)?body.products:[];
      const products=incoming.map(cleanProduct);
      await store().setJSON(KEYS.products,products);
      return json({ok:true,count:products.length},200,noStoreHeaders());
    }
    if(req.method==="PUT" && path==="settings"){
      const body=await req.json();
      const current=await getSettings();
      const next={...current,...body,price5:Math.max(0,Number(body.price5 ?? current.price5)||0),price10:Math.max(0,Number(body.price10 ?? current.price10)||0)};
      await store().setJSON(KEYS.settings,next);
      return json({ok:true,settings:next},200,noStoreHeaders());
    }
    if(req.method==="POST" && path.startsWith("image/")){
      const id=decodeURIComponent(path.slice(6));
      const form=await req.formData(); const file=form.get("file");
      if(!(file instanceof File)) return json({error:"No se recibió una imagen."},400);
      if(file.size>5*1024*1024) return json({error:"La imagen supera el límite de 5 MB."},413);
      const ext=(file.name.split(".").pop()||"jpg").toLowerCase().replace(/[^a-z0-9]/g,"").slice(0,5)||"jpg";
      const key=`images/${id}.${ext}`;
      const existing=await store().list({prefix:`images/${id}.`});
      for(const old of (existing.blobs||[])){ if(old.key!==key) await store().delete(old.key); }
      await store().set(key,await file.arrayBuffer(),{metadata:{contentType:file.type||"image/jpeg",originalName:file.name}});
      return json({ok:true,url:`/api/image/${encodeURIComponent(id)}`},200,noStoreHeaders());
    }
    if(req.method==="GET" && path.startsWith("image/")){
      const id=decodeURIComponent(path.slice(6));
      const found=await store().list({prefix:`images/${id}.`});
      const item=found.blobs?.[0]; if(!item) return new Response("Not found",{status:404});
      const blob=await store().get(item.key,{type:"blob"});
      let contentType="image/jpeg";
      try { const meta=await store().getMetadata(item.key); contentType=meta?.metadata?.contentType||contentType; } catch {}
      return new Response(blob,{headers:{"content-type":contentType,"cache-control":"public, max-age=300, must-revalidate"}});
    }
    return json({error:"Ruta no encontrada."},404);
  } catch(e){
    console.error(e);
    return json({error:e.message||"Error interno."},500,noStoreHeaders());
  }
};

export const config = { path: "/api/*" };
