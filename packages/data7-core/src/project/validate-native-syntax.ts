import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parseBasic } from "./parser";

/**
 * Build-time gate: the transpiler must emit parseable native Data7 Basic.
 * Semantic analysis of that output is owned by the source-level linter
 * (already run before Executar); walking it again dominated cold/hot build.
 */
export function assertTranspiledNativeSyntax(
  sources: readonly { readonly fileUri: string; readonly code: string }[],
): void {
  for (const source of sources) {
    const { errors } = parseBasic(source.code, { plugins: [] });
    if (errors.length === 0) continue;

    const filename = nativeSourceLabel(source.fileUri);
    const details = errors
      .map((error) => `[${error.loc.line}:${error.loc.column}] ${error.message}`)
      .join("\n");
    throw new Error(
      `O build foi abortado devido a erros de sintaxe nativa em ${filename}:\n${details}`,
    );
  }
}

function nativeSourceLabel(fileUri: string): string {
  if (fileUri.startsWith("file:")) {
    try {
      return path.basename(fileURLToPath(fileUri));
    } catch {
      /* fall through to slash split */
    }
  }
  const slash = fileUri.replace(/\\/g, "/").split("/").pop();
  return slash && slash.length > 0 ? slash : fileUri;
}
