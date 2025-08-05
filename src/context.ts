import type { Stagehand } from "@browserbasehq/stagehand";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { Config } from "../config.d.ts";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { listResources, readResource } from "./mcp/resources.js";
import { getSession, closeSession } from "./sessionManager.js";
import type { MCPTool, BrowserSession } from "./types/types.js";

export class Context {
  public readonly config: Config;
  public readonly browserSessionId: string;
  private readonly server: Server;
  private readonly mcpSessionId: string;

  constructor(server: Server, config: Config, mcpSessionId: string) {
    this.server = server;
    this.config = config;
    this.mcpSessionId = mcpSessionId;
    // Each MCP session gets its own browser session
    this.browserSessionId = `browser_${mcpSessionId}_${Date.now()}`;
    console.log(
      `[Context] Created new context - MCP: ${mcpSessionId}, Browser: ${this.browserSessionId}`,
    );
  }

  // Read-only access to current session ID
  public get currentSessionId(): string {
    return this.browserSessionId;
  }

  public getServer(): Server {
    return this.server;
  }

  /**
   * Gets the Stagehand instance for the current session from SessionManager
   */
  public async getStagehand(sessionId?: string): Promise<Stagehand> {
    const targetSessionId = sessionId || this.currentSessionId;
    console.log(
      `[Context] Getting Stagehand - MCP: ${this.mcpSessionId}, Target session: ${targetSessionId}`,
    );
    const session = await getSession(targetSessionId, this.config);
    if (!session) {
      throw new Error(`No session found for ID: ${targetSessionId}`);
    }
    return session.stagehand;
  }

  public async getActivePage(): Promise<BrowserSession["page"] | null> {
    // Get page from session manager
    console.log(
      `[Context] Getting active page - MCP: ${this.mcpSessionId}, Session: ${this.currentSessionId}`,
    );
    const session = await getSession(this.currentSessionId, this.config);
    if (session && session.page && !session.page.isClosed()) {
      return session.page;
    }

    return null;
  }

  public async getActiveBrowser(
    createIfMissing: boolean = true,
  ): Promise<BrowserSession["browser"] | null> {
    console.log(
      `[Context] Getting active browser - MCP: ${this.mcpSessionId}, Session: ${this.currentSessionId}`,
    );
    const session = await getSession(
      this.currentSessionId,
      this.config,
      createIfMissing,
    );
    if (!session || !session.browser || !session.browser.isConnected()) {
      return null;
    }
    return session.browser;
  }

  /**
   * Clean up browser session when MCP session ends
   */
  public async cleanup(): Promise<void> {
    console.log(`[Context] Cleaning up context - MCP: ${this.mcpSessionId}`);
    try {
      console.log(
        `[Context] Closing browser session: ${this.browserSessionId}`,
      );
      await closeSession(this.browserSessionId);
    } catch (error) {
      console.error(
        `[Context] Error cleaning up session for MCP ${this.mcpSessionId}: ${error}`,
      );
    }
  }

  async run(tool: MCPTool, args: unknown): Promise<CallToolResult> {
    try {
      console.error(
        `[Context] Executing tool: ${tool.schema.name} - MCP: ${this.mcpSessionId}, Session: ${this.currentSessionId}, Args: ${JSON.stringify(args)}`,
      );

      // Check if this tool has a handle method (new tool system)
      if ("handle" in tool && typeof tool.handle === "function") {
        const toolResult = await tool.handle(this, args);

        if (toolResult?.action) {
          const actionResult = await toolResult.action();
          const content = actionResult?.content || [];

          return {
            content: Array.isArray(content)
              ? content
              : [{ type: "text", text: "Action completed successfully." }],
            isError: false,
          };
        } else {
          return {
            content: [
              {
                type: "text",
                text: `${tool.schema.name} completed successfully.`,
              },
            ],
            isError: false,
          };
        }
      } else {
        // Fallback for any legacy tools without handle method
        throw new Error(
          `Tool ${tool.schema.name} does not have a handle method`,
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `Tool ${tool.schema?.name || "unknown"} failed: ${errorMessage}`,
      );
      return {
        content: [{ type: "text", text: `Error: ${errorMessage}` }],
        isError: true,
      };
    }
  }

  /**
   * List resources
   * Documentation: https://modelcontextprotocol.io/docs/concepts/resources
   */
  listResources() {
    return listResources();
  }

  /**
   * Read a resource by URI
   * Documentation: https://modelcontextprotocol.io/docs/concepts/resources
   */
  readResource(uri: string) {
    return readResource(uri);
  }
}
