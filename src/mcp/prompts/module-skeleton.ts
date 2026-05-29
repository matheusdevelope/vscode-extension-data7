/**
 * Prompt `data7_module_skeleton` — generates the canonical skeleton of
 * a Data7 Basic module file. Follows the conventions from
 * `12-convencoes-idiomaticas.md`: `'@Module` header, blocks of Imports
 * (System Library first, then workspace), `Namespace <name>` matching
 * the file name, and one class with a private field, a constructor and
 * a method.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function buildSkeleton(
  moduleName: string,
  namespaceName: string,
  className: string,
  baseClass: string | undefined,
): string {
  const inherits = baseClass ? `      Inherits ${baseClass}\n\n` : "";
  return [
    "'@Module",
    `'@Description: ${moduleName} — descrição do módulo.`,
    "",
    "' System Library",
    "Imports Collections",
    "",
    `Namespace ${namespaceName}`,
    "",
    `   Class ${className}`,
    inherits ? inherits.trimEnd() : "",
    "      Private _initialized As Boolean",
    "",
    `      Sub New()`,
    baseClass ? "         MyBase.New()" : "         ' construtor padrão",
    "         me._initialized = True",
    "      End Sub",
    "",
    "      Function Describe() As String",
    `         Describe = "${className}"`,
    "      End Function",
    "",
    "      Sub Free()",
    baseClass ? "         MyBase.Free()" : "         ' nada a liberar",
    "      End Sub",
    "",
    "   End Class",
    "",
    "End Namespace",
  ]
    .filter((line) => line !== "")
    .map((line) => line)
    .join("\n");
}

export function registerModuleSkeleton(server: McpServer): void {
  server.registerPrompt(
    "data7_module_skeleton",
    {
      title: "Esqueleto canônico de módulo Data7 Basic",
      description:
        "Gera um arquivo `.bas` com '@Module header, Imports blocks, Namespace e uma classe inicial. Use para começar um novo módulo do zero.",
      argsSchema: {
        moduleName: z
          .string()
          .min(1)
          .describe('Nome do módulo. Convenção: prefixo mod_. Exemplo: "mod_payments".'),
        namespaceName: z
          .string()
          .min(1)
          .describe("Nome do namespace (geralmente igual ao moduleName)."),
        className: z.string().min(1).describe('Nome da classe inicial. Exemplo: "TPayment".'),
        baseClass: z
          .string()
          .optional()
          .describe('Classe base opcional (para Inherits). Exemplo: "TRecord".'),
      },
    },
    (args) => {
      const skeleton = buildSkeleton(
        args.moduleName,
        args.namespaceName,
        args.className,
        args.baseClass,
      );
      return {
        description: `Esqueleto canônico para ${args.moduleName}.`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `Use o esqueleto abaixo como ponto de partida para o módulo ${args.moduleName}. ` +
                `Preserve o '@Module header, os blocos de Imports e a estrutura Namespace/Class.\n\n` +
                "```basic\n" +
                skeleton +
                "\n```",
            },
          },
        ],
      };
    },
  );
}
