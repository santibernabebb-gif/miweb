// Protege todo lo que hay dentro de /juegos/ con usuario y contraseña.
// El usuario y la contraseña NO están aquí: se leen de los secretos de Cloudflare
// SS_USER y SS_PASS (Pages → Configuración → Variables y secretos).
// El resto de la web (portada, imágenes de /assets/) sigue siendo pública.

const REALM = "SantiSystems Games";
const ZONA_PRIVADA = "/juegos";

export async function onRequest(context) {
  const { request, env, next } = context;

  if (!esZonaPrivada(request.url)) return next();

  const validUser = env.SS_USER;
  const validPass = env.SS_PASS;

  // Si faltan los secretos, se bloquea todo (mejor cerrado que abierto).
  if (!validUser || !validPass) {
    return new Response("Acceso no configurado.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const auth = request.headers.get("Authorization") || "";
  if (auth.startsWith("Basic ")) {
    let decoded = "";
    try {
      decoded = new TextDecoder().decode(
        Uint8Array.from(atob(auth.slice(6).trim()), (c) => c.charCodeAt(0))
      );
    } catch {
      decoded = "";
    }
    const sep = decoded.indexOf(":");
    if (sep > -1) {
      const okUser = await safeEqual(decoded.slice(0, sep), validUser);
      const okPass = await safeEqual(decoded.slice(sep + 1), validPass);
      if (okUser && okPass) {
        const res = await next();
        const out = new Response(res.body, res);
        // Que ninguna caché compartida guarde los juegos
        out.headers.set("Cache-Control", "private, no-cache");
        return out;
      }
    }
    // Pequeña pausa para frenar intentos de fuerza bruta
    await new Promise((r) => setTimeout(r, 400));
  }

  return new Response("Acceso restringido. Introduce usuario y contraseña.", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${REALM}", charset="UTF-8"`,
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

// Normaliza la ruta para que no se pueda esquivar la protección
// con trucos como //juegos, /%6Auegos, /JUEGOS o /./juegos
function esZonaPrivada(url) {
  let p = new URL(url).pathname;
  for (let i = 0; i < 3; i++) {
    try {
      const d = decodeURIComponent(p);
      if (d === p) break;
      p = d;
    } catch {
      return true; // ruta mal codificada: por si acaso, se protege
    }
  }
  p = p.replace(/\\/g, "/").replace(/\/{2,}/g, "/").toLowerCase();
  const partes = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") partes.pop();
    else partes.push(seg);
  }
  const limpia = "/" + partes.join("/");
  return limpia === ZONA_PRIVADA || limpia.startsWith(ZONA_PRIVADA + "/");
}

// Comparación en tiempo constante (no revela cuántos caracteres coinciden)
async function safeEqual(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const x = new Uint8Array(ha);
  const y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
