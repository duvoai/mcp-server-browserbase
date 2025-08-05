import { Page, BrowserContext } from "@browserbasehq/stagehand";
import type { Config } from "../config.d.ts";
import type { Cookie } from "playwright-core";
import { createStagehandInstance } from "./stagehandStore.js";
import type { BrowserSession } from "./types/types.js";

// Global state for managing browser sessions
const browsers = new Map<string, BrowserSession>();

// Keep track of the active session ID per context
let activeSessionId: string | null = null;

console.log(`[SessionManager] Initialized session manager`);

/**
 * Sets the active session ID.
 * @param id The ID of the session to set as active.
 */
export function setActiveSessionId(id: string): void {
  console.log(`[SessionManager] Setting active session ID: ${id}`);
  if (browsers.has(id)) {
    activeSessionId = id;
  } else {
    process.stderr.write(
      `[SessionManager] WARN - Set active session failed for non-existent ID: ${id}\n`,
    );
  }
}

/**
 * Gets the active session ID.
 * @returns The active session ID.
 */
export function getActiveSessionId(): string | null {
  return activeSessionId;
}

/**
 * Adds cookies to a browser context
 * @param context Playwright browser context
 * @param cookies Array of cookies to add
 */
export async function addCookiesToContext(
  context: BrowserContext,
  cookies: Cookie[],
): Promise<void> {
  if (!cookies || cookies.length === 0) {
    return;
  }

  try {
    process.stderr.write(
      `[SessionManager] Adding ${cookies.length} cookies to browser context\n`,
    );
    await context.addCookies(cookies);
    process.stderr.write(
      `[SessionManager] Successfully added cookies to browser context\n`,
    );
  } catch (error) {
    process.stderr.write(
      `[SessionManager] Error adding cookies to browser context: ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
  }
}

// Function to create a new Browserbase session using Stagehand
export async function createNewBrowserSession(
  newSessionId: string,
  config: Config,
  resumeSessionId?: string,
): Promise<BrowserSession> {
  if (!config.browserbaseApiKey) {
    throw new Error("Browserbase API Key is missing in the configuration.");
  }
  if (!config.browserbaseProjectId) {
    throw new Error("Browserbase Project ID is missing in the configuration.");
  }

  try {
    process.stderr.write(
      `[SessionManager] ${resumeSessionId ? "Resuming" : "Creating"} Stagehand session ${newSessionId}...\n`,
    );

    // Create and initialize Stagehand instance using shared function
    const stagehand = await createStagehandInstance(
      config,
      {
        ...(resumeSessionId && { browserbaseSessionID: resumeSessionId }),
      },
      newSessionId,
    );

    // Get the page and browser from Stagehand
    const page = stagehand.page as unknown as Page;
    const browser = page.context().browser();

    if (!browser) {
      throw new Error("Failed to get browser from Stagehand page context");
    }

    const browserbaseSessionId = stagehand.browserbaseSessionID;

    process.stderr.write(
      `[SessionManager] Stagehand initialized with Browserbase session: ${browserbaseSessionId}\n`,
    );
    process.stderr.write(
      `[SessionManager] Browserbase Live Debugger URL: https://www.browserbase.com/sessions/${browserbaseSessionId}\n`,
    );

    // Set up disconnect handler
    browser.on("disconnected", () => {
      console.log(`[SessionManager] Browser disconnected: ${newSessionId}`);
      browsers.delete(newSessionId);

      if (activeSessionId === newSessionId) {
        console.log(
          `[SessionManager] Active session disconnected: ${newSessionId}`,
        );
        activeSessionId = null;
      }
    });

    // Add cookies to the context if they are provided in the config
    if (
      config.cookies &&
      Array.isArray(config.cookies) &&
      config.cookies.length > 0
    ) {
      await addCookiesToContext(
        page.context() as BrowserContext,
        config.cookies,
      );
    }

    const sessionObj: BrowserSession = {
      browser,
      page,
      sessionId: browserbaseSessionId!,
      stagehand,
    };

    browsers.set(newSessionId, sessionObj);

    console.log(`[SessionManager] Session created: ${newSessionId}`);
    setActiveSessionId(newSessionId);

    return sessionObj;
  } catch (creationError) {
    const errorMessage =
      creationError instanceof Error
        ? creationError.message
        : String(creationError);
    process.stderr.write(
      `[SessionManager] Creating session ${newSessionId} failed: ${errorMessage}\n`,
    );
    throw new Error(
      `Failed to create/connect session ${newSessionId}: ${errorMessage}`,
    );
  }
}

async function closeBrowserGracefully(
  session: BrowserSession | undefined | null,
  sessionIdToLog: string,
): Promise<void> {
  // Close Stagehand instance which handles browser cleanup
  if (session?.stagehand) {
    try {
      process.stderr.write(
        `[SessionManager] Closing Stagehand for session: ${sessionIdToLog}\n`,
      );
      await session.stagehand.close();
      process.stderr.write(
        `[SessionManager] Successfully closed Stagehand and browser for session: ${sessionIdToLog}\n`,
      );
    } catch (closeError) {
      process.stderr.write(
        `[SessionManager] WARN - Error closing Stagehand for session ${sessionIdToLog}: ${
          closeError instanceof Error ? closeError.message : String(closeError)
        }\n`,
      );
    }
  }
}

// Removed ensureDefaultSessionInternal - all sessions are treated equally now
/*
export async function ensureDefaultSessionInternal(
  config: Config,
): Promise<BrowserSession> {
  const sessionId = defaultSessionId;
  let needsReCreation = false;

  if (!defaultBrowserSession) {
    needsReCreation = true;
    process.stderr.write(
      `[SessionManager] Default session ${sessionId} not found, creating.\n`,
    );
  } else if (
    !defaultBrowserSession.browser.isConnected() ||
    defaultBrowserSession.page.isClosed()
  ) {
    needsReCreation = true;
    process.stderr.write(
      `[SessionManager] Default session ${sessionId} is stale, recreating.\n`,
    );
    await closeBrowserGracefully(defaultBrowserSession, sessionId);
    defaultBrowserSession = null;
    browsers.delete(sessionId);
  }

  if (needsReCreation) {
    try {
      defaultBrowserSession = await createNewBrowserSession(sessionId, config);
      return defaultBrowserSession;
    } catch (creationError) {
      // Error during initial creation or recreation
      process.stderr.write(
        `[SessionManager] Initial/Recreation attempt for default session ${sessionId} failed. Error: ${
          creationError instanceof Error
            ? creationError.message
            : String(creationError)
        }\n`,
      );
      // Attempt one more time after a failure
      process.stderr.write(
        `[SessionManager] Retrying creation of default session ${sessionId} after error...\n`,
      );
      try {
        defaultBrowserSession = await createNewBrowserSession(
          sessionId,
          config,
        );
        return defaultBrowserSession;
      } catch (retryError) {
        const finalErrorMessage =
          retryError instanceof Error ? retryError.message : String(retryError);
        process.stderr.write(
          `[SessionManager] Failed to recreate default session ${sessionId} after retry: ${finalErrorMessage}\n`,
        );
        throw new Error(
          `Failed to ensure default session ${sessionId} after initial error and retry: ${finalErrorMessage}`,
        );
      }
    }
  }

  // If we reached here, the existing default session is considered okay.
  setActiveSessionId(sessionId); // Ensure default is marked active
  return defaultBrowserSession!; // Non-null assertion: logic ensures it's not null here
}
*/

// Get a specific session by ID
export async function getSession(
  sessionId: string,
  config: Config,
  createIfMissing: boolean = true,
): Promise<BrowserSession | null> {
  console.log(
    `[SessionManager] Getting session: ${sessionId}, createIfMissing: ${createIfMissing}`,
  );

  // Check if session exists
  const sessionObj = browsers.get(sessionId);

  if (sessionObj) {
    // Validate the found session
    if (!sessionObj.browser.isConnected() || sessionObj.page.isClosed()) {
      console.log(
        `[SessionManager] Found stale session ${sessionId}, removing`,
      );
      await closeBrowserGracefully(sessionObj, sessionId);
      browsers.delete(sessionId);

      if (activeSessionId === sessionId) {
        console.log(`[SessionManager] Invalidated active session ${sessionId}`);
        activeSessionId = null;
      }

      // Fall through to create new session if needed
    } else {
      // Session is valid
      console.log(
        `[SessionManager] Using existing valid session: ${sessionId}`,
      );
      setActiveSessionId(sessionId);
      return sessionObj;
    }
  }

  // Session doesn't exist or was stale
  if (!createIfMissing) {
    console.log(
      `[SessionManager] Session not found and createIfMissing=false: ${sessionId}`,
    );
    return null;
  }

  // Create new session
  console.log(`[SessionManager] Creating new session: ${sessionId}`);
  return await createNewBrowserSession(sessionId, config);
}

/**
 * Clean up a session by removing it from tracking.
 * This is called after a browser is closed to ensure proper cleanup.
 * @param sessionId The session ID to clean up
 */
export async function cleanupSession(sessionId: string): Promise<void> {
  process.stderr.write(`[SessionManager] Cleaning up session: ${sessionId}\n`);

  // Get the session to close it gracefully
  const session = browsers.get(sessionId);
  if (session) {
    await closeBrowserGracefully(session, sessionId);
  }

  // Remove from browsers map
  browsers.delete(sessionId);

  // Clear active session if this was the active one
  if (activeSessionId === sessionId) {
    console.log(`[SessionManager] Cleaned up active session ${sessionId}`);
    activeSessionId = null;
  }
}

// Function to close all managed browser sessions gracefully
export async function closeAllSessions(): Promise<void> {
  process.stderr.write(`[SessionManager] Closing all sessions...\n`);
  const closePromises: Promise<void>[] = [];
  for (const [id, session] of browsers.entries()) {
    process.stderr.write(`[SessionManager] Closing session: ${id}\n`);
    closePromises.push(
      // Use the helper for consistent logging/error handling
      closeBrowserGracefully(session, id),
    );
  }
  try {
    await Promise.all(closePromises);
  } catch {
    // Individual errors are caught and logged by closeBrowserGracefully
    process.stderr.write(
      `[SessionManager] WARN - Some errors occurred during batch session closing. See individual messages.\n`,
    );
  }

  browsers.clear();
  activeSessionId = null; // No active session after closing all
  console.log(`[SessionManager] All sessions closed and cleared`);
}

/**
 * Closes a browser session and removes it from the session manager.
 * @param sessionId The ID of the session to close.
 */
export async function closeSession(sessionId: string): Promise<void> {
  console.log(`[SessionManager] Closing session: ${sessionId}`);

  const session = browsers.get(sessionId);
  if (session) {
    await closeBrowserGracefully(session, sessionId);
    browsers.delete(sessionId);

    if (activeSessionId === sessionId) {
      console.log(
        `[SessionManager] Closed active session, clearing active session ID`,
      );
      activeSessionId = null;
    }
  } else {
    console.log(`[SessionManager] Session not found for closing: ${sessionId}`);
  }
}
