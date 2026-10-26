// =====================================================================
//  SantiSystems · Acceso privado a los juegos (uno por uno)
// ---------------------------------------------------------------------
//  - Cada juego de /juegos/<nombre>/ pide usuario y contraseña POR SEPARADO.
//    Entrar en un juego NO da acceso a los demás.
//  - El usuario y la contraseña NO están aquí: se leen de los secretos de
//    Cloudflare SS_USER y SS_PASS (Pages → Configuración → Variables y secretos).
//  - Si cambias la contraseña en Cloudflare, todas las sesiones abiertas
//    dejan de valer y hay que volver a entrar.
//  - El resto de la web (portada, /assets/) es pública.
// =====================================================================

// Cuánto dura la sesión de cada juego antes de volver a pedir la contraseña
const DURACION_HORAS = 24;

// Juegos protegidos: carpeta → datos para la pantalla de acceso
const JUEGOS = {
  "la-llave-runica": { nombre: "La Llave Rúnica", color: "#c9772a" },
  "revienta-pompas": { nombre: "Revienta Pompas", color: "#e5533d" },
  "don-hierro":      { nombre: "Don Hierro",      color: "#2f6fd6" },
  "rebufo-gp":       { nombre: "Rebufo GP",       color: "#e08a00" },
  "huevo-dragon":    { nombre: "El Huevo del Dragón", color: "#d9572b" },
};

const ZONA = "juegos";
const RUTA_LOGIN = "__acceso";

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const partes = rutaNormalizada(url.pathname);

  // Fuera de /juegos → web pública
  if (partes === null || partes[0] !== ZONA) return next();

  const slug = partes[1];

  // /juegos o /juegos/ → a la sección de juegos de la portada
  if (!slug) return Response.redirect(url.origin + "/#juegos", 302);

  // Carpeta que no es un juego conocido → no existe
  const juego = JUEGOS[slug];
  if (!juego) return texto("No encontrado.", 404);

  const base = `/${ZONA}/${slug}/`;

  // /juegos/don-hierro (sin barra final) → /juegos/don-hierro/
  if (partes.length === 2 && !url.pathname.endsWith("/")) {
    return Response.redirect(url.origin + base, 301);
  }

  // El manifest y los iconos de cada juego son públicos: así el móvil siempre
  // reconoce cada juego como una app distinta (no contienen nada privado).
  // (solo si la ruta viene "limpia", sin trucos de codificación)
  if (
    request.method === "GET" &&
    url.pathname === "/" + partes.join("/") &&
    esArchivoPublico(partes.slice(2))
  ) return next();

  const validUser = env.SS_USER;
  const validPass = env.SS_PASS;
  if (!validUser || !validPass) return texto("Acceso no configurado.", 503);

  const clave = await claveFirma(validUser, validPass);
  const cookieNombre = "ssg_" + slug.replace(/-/g, "_");

  // ---- Envío del formulario de acceso ----
  if (partes[2] === RUTA_LOGIN && partes.length === 3) {
    if (request.method !== "POST") return Response.redirect(url.origin + base, 303);
    let user = "", pass = "";
    try {
      const form = await request.formData();
      user = String(form.get("usuario") || "");
      pass = String(form.get("contrasena") || "");
    } catch {}
    const okU = await igualSeguro(user, validUser);
    const okP = await igualSeguro(pass, validPass);
    if (okU && okP) {
      const exp = Math.floor(Date.now() / 1000) + DURACION_HORAS * 3600;
      const token = `${exp}.${await firmar(clave, `${slug}|${exp}`)}`;
      return new Response(null, {
        status: 303,
        headers: {
          Location: base,
          "Set-Cookie": `${cookieNombre}=${token}; Path=${base}; Max-Age=${DURACION_HORAS * 3600}; HttpOnly; Secure; SameSite=Lax`,
          "Cache-Control": "no-store",
        },
      });
    }
    await new Promise((r) => setTimeout(r, 600)); // frena la fuerza bruta
    return paginaAcceso(slug, juego, base, "Usuario o contraseña incorrectos.", user);
  }

  // ---- ¿Tiene sesión válida para ESTE juego? ----
  const token = leerCookie(request.headers.get("Cookie") || "", cookieNombre);
  if (token && (await tokenValido(clave, slug, token))) {
    const res = await next();
    const out = new Response(res.body, res);
    out.headers.set("Cache-Control", "private, no-cache");
    return out;
  }

  // Sin sesión: si es la página → pantalla de acceso; si es un archivo → bloqueado
  const accept = request.headers.get("Accept") || "";
  const esPagina =
    request.method === "GET" &&
    (request.headers.get("Sec-Fetch-Mode") === "navigate" || accept.includes("text/html"));
  if (esPagina) return paginaAcceso(slug, juego, base, "", "");
  return texto("Acceso restringido.", 401);
}

// ---------------------------------------------------------------------
//  Utilidades
// ---------------------------------------------------------------------

// Normaliza la ruta para que no se pueda esquivar la protección
// con trucos como //juegos, /%6Auegos, /JUEGOS o /./juegos
function rutaNormalizada(pathname) {
  let p = pathname;
  for (let i = 0; i < 3; i++) {
    try {
      const d = decodeURIComponent(p);
      if (d === p) break;
      p = d;
    } catch {
      return [ZONA, "__invalida"]; // mal codificada: se trata como privada
    }
  }
  p = p.replace(/\\/g, "/").toLowerCase();
  const partes = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") partes.pop();
    else partes.push(seg);
  }
  return partes.length ? partes : null;
}

function esArchivoPublico(resto) {
  if (resto.length === 1) {
    return /^manifest\.(json|webmanifest)$/.test(resto[0]) || /^icon[\w-]*\.png$/.test(resto[0]);
  }
  return resto.length === 2 && resto[0] === "icons" && /^[\w-]+\.png$/.test(resto[1]);
}

function leerCookie(cabecera, nombre) {
  for (const trozo of cabecera.split(";")) {
    const i = trozo.indexOf("=");
    if (i > -1 && trozo.slice(0, i).trim() === nombre) return trozo.slice(i + 1).trim();
  }
  return null;
}

async function claveFirma(user, pass) {
  const material = new TextEncoder().encode(`ssg-v1:${user}:${pass}`);
  const hash = await crypto.subtle.digest("SHA-256", material);
  return crypto.subtle.importKey("raw", hash, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

async function firmar(clave, datos) {
  const sig = await crypto.subtle.sign("HMAC", clave, new TextEncoder().encode(datos));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function tokenValido(clave, slug, token) {
  const i = token.indexOf(".");
  if (i < 1) return false;
  const exp = Number(token.slice(0, i));
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return false;
  const esperado = await firmar(clave, `${slug}|${exp}`);
  return igualSeguro(token.slice(i + 1), esperado);
}

// Comparación en tiempo constante
async function igualSeguro(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const x = new Uint8Array(ha), y = new Uint8Array(hb);
  let d = 0;
  for (let k = 0; k < x.length; k++) d |= x[k] ^ y[k];
  return d === 0;
}

function texto(msg, status) {
  return new Response(msg, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------------------------------------------------------------------
//  Pantalla de acceso (mismo estilo que la web)
// ---------------------------------------------------------------------
function paginaAcceso(slug, juego, base, error, usuario) {
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<title>${esc(juego.nombre)} · Acceso · SantiSystems</title>
<link rel="icon" href="/assets/juegos/${slug}/icono.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
  :root{--text:#0f1523;--muted:#6b738f;--light:#9ba3bd;--border:#e2e5f0;--off:#f7f8fc;--blue:#2563eb;--accent:${juego.color}}
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Outfit',system-ui,sans-serif;color:var(--text);background:#f3f5fb;min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 16px;-webkit-font-smoothing:antialiased;
    background-image:radial-gradient(circle at 15% 10%,#dbeafe 0,transparent 40%),radial-gradient(circle at 90% 90%,#fde7d4 0,transparent 40%)}
  .card{width:100%;max-width:420px;background:#fff;border-radius:24px;box-shadow:0 20px 60px rgba(15,21,35,.12),0 4px 16px rgba(15,21,35,.06);overflow:hidden}
  .cover{position:relative;aspect-ratio:16/9;background:#111 center/cover no-repeat;background-image:url('/assets/juegos/${slug}/portada.jpg')}
  .cover::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 45%,rgba(0,0,0,.55))}
  .cover-name{position:absolute;left:20px;bottom:14px;z-index:1;display:flex;align-items:center;gap:10px;color:#fff;font-weight:800;font-size:22px;letter-spacing:-.4px;text-shadow:0 2px 10px rgba(0,0,0,.4)}
  .cover-name img{width:40px;height:40px;border-radius:10px;box-shadow:0 4px 12px rgba(0,0,0,.35)}
  .body{padding:26px 26px 28px}
  .lock{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--accent);background:color-mix(in srgb,var(--accent) 12%,#fff);padding:5px 11px;border-radius:999px;margin-bottom:12px}
  .lock svg{width:12px;height:12px}
  h1{font-size:22px;font-weight:800;letter-spacing:-.4px;margin-bottom:4px}
  .sub{font-size:14px;color:var(--muted);margin-bottom:20px}
  label{display:block;font-size:13px;font-weight:600;margin-bottom:6px}
  input{width:100%;border:1.5px solid var(--border);background:var(--off);border-radius:11px;padding:12px 14px;font:500 15px 'Outfit',system-ui,sans-serif;color:var(--text);outline:none;transition:border-color .15s,box-shadow .15s,background .15s;margin-bottom:14px}
  input:focus{border-color:var(--blue);background:#fff;box-shadow:0 0 0 4px rgba(37,99,235,.1)}
  .err{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;border-radius:10px;padding:10px 12px;font-size:13px;font-weight:600;margin-bottom:14px}
  button{width:100%;padding:13px;border:0;border-radius:11px;background:var(--blue);color:#fff;font:700 15px 'Outfit',system-ui,sans-serif;cursor:pointer;transition:background .15s,transform .15s}
  button:hover{background:#1d4ed8;transform:translateY(-1px)}
  .back{display:inline-block;margin-top:20px;font-size:14px;font-weight:600;color:var(--muted);text-decoration:none}
  .back:hover{color:var(--text)}
  .brand{display:flex;align-items:center;gap:8px;margin-bottom:18px;color:var(--text);text-decoration:none;font-weight:700;font-size:16px}
  .brand b{width:30px;height:30px;border-radius:9px;background:var(--blue);display:grid;place-items:center;color:#fff;font-weight:800;font-size:14px}
  .brand i{font-style:normal}.brand span{color:var(--blue)}
</style>
</head>
<body>
  <a class="brand" href="/"><b>S</b><i>Santi<span>Systems</span></i></a>
  <main class="card">
    <div class="cover" role="img" aria-label="Captura de ${esc(juego.nombre)}">
      <div class="cover-name"><img src="/assets/juegos/${slug}/icono.png" alt="">${esc(juego.nombre)}</div>
    </div>
    <div class="body">
      <div class="lock"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V7a5 5 0 0 1 10 0v3" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><rect x="4.5" y="10" width="15" height="11" rx="2.5" fill="currentColor"/></svg>Acceso privado</div>
      <h1>Entrar a jugar</h1>
      <p class="sub">Introduce tu usuario y contraseña para abrir ${esc(juego.nombre)}.</p>
      ${error ? `<div class="err" role="alert">${esc(error)}</div>` : ""}
      <form method="post" action="${base}${RUTA_LOGIN}" autocomplete="on">
        <label for="u">Usuario</label>
        <input id="u" name="usuario" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required value="${esc(usuario)}" ${usuario ? "" : "autofocus"}>
        <label for="p">Contraseña</label>
        <input id="p" name="contrasena" type="password" autocomplete="current-password" required ${usuario ? "autofocus" : ""}>
        <button type="submit">Entrar</button>
      </form>
      <a class="back" href="/#juegos">← Volver a SantiSystems</a>
    </div>
  </main>
</body>
</html>`;
  return new Response(html, {
    status: 401,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Frame-Options": "DENY",
      "X-Robots-Tag": "noindex",
    },
  });
}
