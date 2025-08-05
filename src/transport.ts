import http from "node:http";
import assert from "node:assert";
import crypto from "node:crypto";

import { ServerList } from "./server.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

// Track both transport and session context
interface TransportSession {
  transport: StreamableHTTPServerTransport;
  mcpSessionId: string;
}

async function handleStreamable(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  serverList: ServerList,
  sessions: Map<string, TransportSession>,
) {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (sessionId) {
    console.log(
      `[Transport] Received request with mcp-session-id: ${sessionId}`,
    );
    const session = sessions.get(sessionId);
    if (!session) {
      console.error(`[Transport] Session not found for ID: ${sessionId}`);
      res.statusCode = 404;
      res.end("Session not found");
      return;
    }
    console.log(
      `[Transport] Routing request to existing session: ${sessionId} (MCP: ${session.mcpSessionId})`,
    );
    return await session.transport.handleRequest(req, res);
  }

  if (req.method === "POST") {
    const mcpSessionId = crypto.randomUUID();
    console.log(`[Transport] Creating new MCP session: ${mcpSessionId}`);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => mcpSessionId,
      onsessioninitialized: (sessionId) => {
        console.log(
          `[Transport] Session initialized - Transport ID: ${sessionId}, MCP ID: ${mcpSessionId}`,
        );
        sessions.set(sessionId, { transport, mcpSessionId });
      },
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        console.log(`[Transport] Closing session: ${transport.sessionId}`);
        const session = sessions.get(transport.sessionId);
        if (session) {
          console.log(
            `[Transport] Cleaning up MCP session: ${session.mcpSessionId}`,
          );
        }
        sessions.delete(transport.sessionId);
      }
    };

    // Pass MCP session ID to server creation
    console.log(`[Transport] Creating server for MCP session: ${mcpSessionId}`);
    const server = await serverList.create(mcpSessionId);
    await server.connect(transport);
    return await transport.handleRequest(req, res);
  }

  res.statusCode = 400;
  res.end("Invalid request");
}

export function startHttpTransport(
  port: number,
  hostname: string | undefined,
  serverList: ServerList,
) {
  console.log(
    `[Transport] Starting HTTP transport on ${hostname || "localhost"}:${port}`,
  );
  const streamableSessions = new Map<string, TransportSession>();
  const httpServer = http.createServer(async (req, res) => {
    if (!req.url) {
      res.statusCode = 400;
      res.end("Bad request: missing URL");
      return;
    }
    const url = new URL(`http://localhost${req.url}`);
    if (url.pathname.startsWith("/mcp"))
      await handleStreamable(req, res, serverList, streamableSessions);
  });
  httpServer.listen(port, hostname, () => {
    const address = httpServer.address();
    assert(address, "Could not bind server socket");
    let url: string;
    if (typeof address === "string") {
      url = address;
    } else {
      const resolvedPort = address.port;
      let resolvedHost =
        address.family === "IPv4" ? address.address : `[${address.address}]`;
      if (resolvedHost === "0.0.0.0" || resolvedHost === "[::]")
        resolvedHost = "localhost";
      url = `http://${resolvedHost}:${resolvedPort}`;
    }
    const message = [
      `Listening on ${url}`,
      "Put this in your client config:",
      JSON.stringify(
        {
          mcpServers: {
            browserbase: {
              url: `${url}/mcp`,
            },
          },
        },
        undefined,
        2,
      ),
      "If your client supports streamable HTTP, you can use the /mcp endpoint instead.",
    ].join("\n");
    console.log(message);
  });
}
