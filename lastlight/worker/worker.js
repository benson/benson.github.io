const MAX_PLAYERS = 4;
const MAX_MESSAGE_BYTES = 512_000;

export function normalizeCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6);
}

export function safeProfile(value = {}) {
  return {
    name: String(value.name || "Rookie").replace(/[^\w .'-]/g, "").slice(0, 16) || "Rookie",
    specialist: /^[a-z]{3,8}$/.test(value.specialist) ? value.specialist : "zuri",
    ready: Boolean(value.ready),
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "lastlight-relay", now: new Date().toISOString() }, { headers: corsHeaders(request) });
    }
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
    const match = url.pathname.match(/^\/room\/([A-Za-z2-9]{4,6})\/?$/);
    if (!match) return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders(request) });
    const code = normalizeCode(match[1]);
    const room = env.ROOMS.get(env.ROOMS.idFromName(code));
    return room.fetch(request);
  },
};

export class Room {
  constructor(state) {
    this.state = state;
    this.sessions = new Map();
    this.hostId = null;
  }

  async fetch(request) {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("WebSocket required", { status: 426 });
    if (this.sessions.size >= MAX_PLAYERS) return new Response("Squad full", { status: 409 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    const url = new URL(request.url);
    const profile = safeProfile({ name: url.searchParams.get("name"), specialist: url.searchParams.get("specialist") });
    const id = crypto.randomUUID().slice(0, 8);
    if (!this.hostId) this.hostId = id;
    this.sessions.set(server, { id, ...profile, connectedAt: Date.now() });
    const peers = [...this.sessions.values()].filter((peer) => peer.id !== id).map(publicPeer);
    server.send(JSON.stringify({ type: "welcome", id, role: id === this.hostId ? "host" : "guest", peers }));
    this.broadcast({ type: "peer_joined", peer: publicPeer(this.sessions.get(server)) }, server);

    server.addEventListener("message", (event) => this.onMessage(server, event.data));
    server.addEventListener("close", () => this.onClose(server));
    server.addEventListener("error", () => this.onClose(server));
    return new Response(null, { status: 101, webSocket: client });
  }

  onMessage(socket, raw) {
    const session = this.sessions.get(socket);
    if (!session) return;
    const bytes = typeof raw === "string" ? new TextEncoder().encode(raw).byteLength : raw.byteLength;
    if (bytes > MAX_MESSAGE_BYTES) { socket.close(1009, "Message too large"); return; }
    let message;
    try { message = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw)); } catch { return; }
    if (!message || typeof message.type !== "string") return;
    if (message.type === "profile") {
      const profile = safeProfile(message.profile);
      Object.assign(session, profile);
      message.profile = { id: session.id, ...profile };
    }
    const allowed = new Set(["profile", "lobby_state", "start", "return_lobby", "input", "cast", "choice", "snapshot"]);
    if (!allowed.has(message.type)) return;
    message._from = session.id;
    this.broadcast(message, socket);
  }

  onClose(socket) {
    const session = this.sessions.get(socket);
    if (!session) return;
    this.sessions.delete(socket);
    this.broadcast({ type: "peer_left", id: session.id });
    if (session.id === this.hostId) {
      this.hostId = this.sessions.values().next().value?.id || null;
      if (this.hostId) this.broadcast({ type: "host_changed", id: this.hostId });
    }
  }

  broadcast(message, except = null) {
    const payload = JSON.stringify(message);
    for (const socket of this.sessions.keys()) {
      if (socket === except) continue;
      try { socket.send(payload); } catch { this.onClose(socket); }
    }
  }
}

function publicPeer(session) {
  return { id: session.id, name: session.name, specialist: session.specialist, ready: session.ready };
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allowed = origin === "https://bensonperry.com" || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "https://bensonperry.com",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

