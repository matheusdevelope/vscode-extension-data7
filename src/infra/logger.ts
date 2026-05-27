import * as vscode from "vscode";

const CHANNEL_NAME = "Data7";

let channel: vscode.OutputChannel | undefined;

/**
 * Initializes the shared OutputChannel and registers it for disposal with the extension context.
 * Must be called once during activation, before any log method is used.
 */
export function initLogger(context: vscode.ExtensionContext): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel(CHANNEL_NAME);
    context.subscriptions.push(channel);
  }
  return channel;
}

function ensureChannel(): vscode.OutputChannel {
  // Safety net for code paths that run before activate (e.g. tests):
  // create a detached channel that nobody disposes. Tests mock vscode so this is harmless.
  channel ??= vscode.window.createOutputChannel(CHANNEL_NAME);
  return channel;
}

function timestamp(): string {
  const now = new Date();
  const pad = (n: number): string => n.toString().padStart(2, "0");
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${now.getMilliseconds().toString().padStart(3, "0")}`;
}

function format(level: string, message: string): string {
  return `[${timestamp()}] [${level}] ${message}`;
}

function stringifyError(err: unknown): string {
  if (err instanceof Error) {
    return err.stack ?? `${err.name}: ${err.message}`;
  }
  if (typeof err === "string") {
    return err;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export const logger = {
  info(message: string): void {
    ensureChannel().appendLine(format("INFO", message));
  },
  warn(message: string): void {
    ensureChannel().appendLine(format("WARN", message));
  },
  error(message: string, err?: unknown): void {
    const ch = ensureChannel();
    ch.appendLine(format("ERROR", message));
    if (err !== undefined) {
      ch.appendLine(stringifyError(err));
    }
  },
  show(): void {
    ensureChannel().show(true);
  },
};
