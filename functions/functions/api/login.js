const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // Lee el body JSON enviado desde el HTML
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Petición inválida." }, 400);
  }

  const { username, password } = body;

  // Compara con las variables de entorno secretas de Cloudflare
  const validUser = env.SS_USER;
  const validPass = env.SS_PASS;

  if (!validUser || !validPass) {
    return json({ ok: false, error: "Variables de entorno no configuradas." }, 500);
  }

  if (username === validUser && password === validPass) {
    return json({ ok: true });
  }

  // Pequeño delay para dificultar fuerza bruta
  await new Promise(r => setTimeout(r, 400));
  return json({ ok: false, error: "Usuario o contraseña incorrectos." }, 401);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}
