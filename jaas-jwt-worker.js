// ============================================================
// JaaS JWT signing Worker — deploy this on Cloudflare Workers
// (free tier). It's the only thing that ever touches your JaaS
// private key; script.js just calls this and gets a signed token
// back. Never put the private key in script.js or any file that
// ships to the browser.
//
// Required environment variables/secrets (set in the Cloudflare
// dashboard, NOT hardcoded here):
//   JAAS_APP_ID      e.g. vpaas-magic-cookie-10d84a29a4de47cfb0f66b007bdeeaa6
//   JAAS_API_KEY_ID  e.g. vpaas-magic-cookie-10d84a29a4de47cfb0f66b007bdeeaa6/b38723
//   JAAS_PRIVATE_KEY the full PEM block, including the
//                    -----BEGIN PRIVATE KEY----- / -----END... lines
// ============================================================

function base64url(input) {
  let str;

  if (typeof input === "string") {
    str = btoa(unescape(encodeURIComponent(input)));
  } else {
    const bytes = new Uint8Array(input);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    str = btoa(binary);
  }

  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToArrayBuffer(pem) {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\r/g, "")
    .replace(/\n/g, "")
    .trim();

  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
}

export default {
  async fetch(request, env) {
    const corsHeaders = {
      // Tighten this to your actual GitHub Pages origin once this
      // is confirmed working — e.g. "https://yourname.github.io"
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", {
        status: 405,
        headers: corsHeaders
      });
    }

    try {
      const { uid, name, moderator } = await request.json();

      if (!uid) {
        return new Response(JSON.stringify({ error: "Missing uid" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const appId = env.JAAS_APP_ID;
      const apiKeyId = env.JAAS_API_KEY_ID;
      const privateKeyPem = env.JAAS_PRIVATE_KEY;

      const now = Math.floor(Date.now() / 1000);

      const header = { alg: "RS256", typ: "JWT", kid: apiKeyId };

      const payload = {
        aud: "jitsi",
        iss: "chat",
        sub: appId,
        room: "*",
        exp: now + 3 * 60 * 60, // token valid 3 hours
        nbf: now - 10,
        context: {
          user: {
            id: uid,
            name: name || "ProLingo User",
            moderator: moderator ? "true" : "false"
          },
          features: {
            livestreaming: "false",
            recording: "false",
            transcription: "false",
            "outbound-call": "false"
          }
        }
      };

      const encHeader = base64url(JSON.stringify(header));
      const encPayload = base64url(JSON.stringify(payload));
      const signingInput = `${encHeader}.${encPayload}`;

      const keyData = pemToArrayBuffer(privateKeyPem);

      const cryptoKey = await crypto.subtle.importKey(
        "pkcs8",
        keyData,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"]
      );

      const signatureBuffer = await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        cryptoKey,
        new TextEncoder().encode(signingInput)
      );

      const jwt = `${signingInput}.${base64url(signatureBuffer)}`;

      return new Response(JSON.stringify({ token: jwt, appId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }
};
