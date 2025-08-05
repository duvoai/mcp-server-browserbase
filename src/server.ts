import { Server } from "@modelcontextprotocol/sdk/server/index.js";

export class ServerList {
  private _servers: Map<string, Server> = new Map();
  private _serverFactory: (mcpSessionId?: string) => Promise<Server>;

  constructor(serverFactory: (mcpSessionId?: string) => Promise<Server>) {
    this._serverFactory = serverFactory;
  }

  async create(mcpSessionId?: string) {
    console.log(
      `[ServerList] Creating server for session: ${mcpSessionId || "default"}`,
    );
    const server = await this._serverFactory(mcpSessionId);

    if (mcpSessionId) {
      this._servers.set(mcpSessionId, server);
    } else {
      // For non-session servers (like stdio), use a unique key
      const key = `server_${Date.now()}`;
      console.log(`[ServerList] No session ID provided, using key: ${key}`);
      this._servers.set(key, server);
    }

    console.log(`[ServerList] Total active servers: ${this._servers.size}`);
    return server;
  }

  async close(server: Server) {
    console.log(`[ServerList] Closing server`);
    await server.close();

    // Find and remove the server from the map
    for (const [id, s] of this._servers) {
      if (s === server) {
        console.log(`[ServerList] Removing server with ID: ${id}`);
        this._servers.delete(id);
        break;
      }
    }

    console.log(`[ServerList] Remaining active servers: ${this._servers.size}`);
  }

  async closeAll() {
    console.log(
      `[ServerList] Closing all servers (count: ${this._servers.size})`,
    );
    const servers = Array.from(this._servers.values());
    await Promise.all(servers.map((server) => server.close()));
    this._servers.clear();
    console.log(`[ServerList] All servers closed`);
  }
}
