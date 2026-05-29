/**
 * Prompt `data7_form_skeleton` — generates a working screen (tela)
 * skeleton in Data7 Basic, following the production idiom extracted from
 * the `mod_card_grouper` framework (`mod_form.TFormBase`): a class that
 * owns a private `Forms.Form`, builds the control tree in `_build`,
 * lays out regions with `Align`, wires events to handler methods, and
 * exposes `Show()` / `Free()`.
 *
 * See `docs/linguagem-basic/14-construindo-telas.md` for the full idiom
 * and `docs/exemple/forms/` for canonical examples.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

interface BuildOptions {
  readonly className: string;
  readonly namespaceName: string;
  readonly title: string;
  readonly layout: "simple" | "header-content-footer" | "list";
  readonly withButton: boolean;
}

function buildSkeleton(opts: BuildOptions): string {
  if (opts.layout === "list") return buildListSkeleton(opts);

  const lines: string[] = [];
  lines.push("Imports Forms");
  lines.push("");
  lines.push(`Namespace ${opts.namespaceName}`);
  lines.push("");
  lines.push(`   Class ${opts.className}`);
  lines.push("");
  if (opts.withButton) {
    lines.push("      ' evento público — o chamador assina via tela.OnConfirmEvent = handler");
    lines.push("      OnConfirmEvent As TNotifyEvent");
    lines.push("");
  }
  lines.push("      Private _form As Forms.Form");
  if (opts.layout === "header-content-footer") {
    lines.push("      Private _header As Forms.PageControl");
    lines.push("      Private _content As Forms.PageControl");
    lines.push("      Private _footer As Forms.PageControl");
  } else {
    lines.push("      Private _content As Forms.PageControl");
  }
  if (opts.withButton) {
    lines.push("      Private _confirm As Forms.CommandButton");
  }
  lines.push("");
  lines.push(`      Sub New(pTitle As String = "${opts.title}")`);
  lines.push("         me._build(pTitle)");
  lines.push("      End Sub");
  lines.push("");
  lines.push("      Private Sub _build(pTitle As String)");
  lines.push("         me._form = New Forms.Form()");
  lines.push("         me._form.Caption = pTitle");
  lines.push("");
  if (opts.layout === "header-content-footer") {
    lines.push("         me._header = New Forms.PageControl(me._form)");
    lines.push("         me._header.Align = alTop");
    lines.push("         me._header.Height = 40");
    lines.push("");
    lines.push("         me._footer = New Forms.PageControl(me._form)");
    lines.push("         me._footer.Align = alBottom");
    lines.push("         me._footer.Height = 32");
    lines.push("");
    lines.push("         ' conteúdo POR ÚLTIMO com alClient para preencher o miolo");
    lines.push("         me._content = New Forms.PageControl(me._form)");
    lines.push("         me._content.Align = alClient");
  } else {
    lines.push("         me._content = New Forms.PageControl(me._form)");
    lines.push("         me._content.Align = alClient");
  }
  if (opts.withButton) {
    const parent = "me._content";
    lines.push("");
    lines.push(`         me._confirm = New Forms.CommandButton(${parent})`);
    lines.push('         me._confirm.Caption = "Confirmar"');
    lines.push("         me._confirm.Align = alBottom");
    lines.push("         me._confirm.Height = 28");
    lines.push("         me._confirm.OnClick = me._handleConfirm");
  }
  lines.push("      End Sub");
  lines.push("");
  if (opts.withButton) {
    lines.push("      ' handler do clique — assinatura de TNotifyEvent: Sub (Sender As TObject)");
    lines.push("      Private Sub _handleConfirm(pSender As TObject)");
    lines.push("         If me.OnConfirmEvent <> NULL Then me.OnConfirmEvent(me)");
    lines.push("      End Sub");
    lines.push("");
  }
  lines.push("      Function Show() As Boolean");
  lines.push("         me._form.Show()");
  lines.push("         Show = True");
  lines.push("      End Function");
  lines.push("");
  lines.push("      Sub Free()");
  lines.push("         me._form.Free()");
  lines.push("         MyBase.Free()");
  lines.push("      End Sub");
  lines.push("");
  lines.push("   End Class");
  lines.push("");
  lines.push("End Namespace");
  return lines.join("\n");
}

/**
 * Listing screen idiom (the most common ERP screen): a toolbar at the top
 * with a "Atualizar" button + a Grid filling the rest. Faithful to the
 * Forms API (`Grid.Cells`, `FixedRows`, `ColCount`/`RowCount`).
 */
function buildListSkeleton(opts: BuildOptions): string {
  const lines: string[] = [];
  lines.push("Imports Forms");
  lines.push("");
  lines.push(`Namespace ${opts.namespaceName}`);
  lines.push("");
  lines.push(`   Class ${opts.className}`);
  lines.push("");
  lines.push("      Private _form As Forms.Form");
  lines.push("      Private _toolbar As Forms.PageControl");
  lines.push("      Private _atualizar As Forms.CommandButton");
  lines.push("      Private _grid As Forms.Grid");
  lines.push("");
  lines.push(`      Sub New(pTitle As String = "${opts.title}")`);
  lines.push("         me._build(pTitle)");
  lines.push("         me._carregar()");
  lines.push("      End Sub");
  lines.push("");
  lines.push("      Private Sub _build(pTitle As String)");
  lines.push("         me._form = New Forms.Form()");
  lines.push("         me._form.Caption = pTitle");
  lines.push("");
  lines.push("         ' barra de ações no topo");
  lines.push("         me._toolbar = New Forms.PageControl(me._form)");
  lines.push("         me._toolbar.Align = alTop");
  lines.push("         me._toolbar.Height = 36");
  lines.push("");
  lines.push("         me._atualizar = New Forms.CommandButton(me._toolbar)");
  lines.push('         me._atualizar.Caption = "Atualizar"');
  lines.push("         me._atualizar.Align = alLeft");
  lines.push("         me._atualizar.OnClick = me._handleAtualizar");
  lines.push("");
  lines.push("         ' grid preenche o restante");
  lines.push("         me._grid = New Forms.Grid(me._form)");
  lines.push("         me._grid.Align = alClient");
  lines.push("         me._grid.FixedRows = 1");
  lines.push("      End Sub");
  lines.push("");
  lines.push("      ' Preenche o grid. Substitua pelos dados reais (ex.: de um SQL.Command).");
  lines.push("      Private Sub _carregar()");
  lines.push("         me._grid.ColCount = 2");
  lines.push("         me._grid.RowCount = 1   ' apenas o cabeçalho por enquanto");
  lines.push('         me._grid.Cells(0, 0) = "Código"');
  lines.push('         me._grid.Cells(1, 0) = "Descrição"');
  lines.push("      End Sub");
  lines.push("");
  lines.push("      Private Sub _handleAtualizar(pSender As TObject)");
  lines.push("         me._carregar()");
  lines.push("      End Sub");
  lines.push("");
  lines.push("      Function Show() As Boolean");
  lines.push("         me._form.Show()");
  lines.push("         Show = True");
  lines.push("      End Function");
  lines.push("");
  lines.push("      Sub Free()");
  lines.push("         me._form.Free()");
  lines.push("         MyBase.Free()");
  lines.push("      End Sub");
  lines.push("");
  lines.push("   End Class");
  lines.push("");
  lines.push("End Namespace");
  return lines.join("\n");
}

export function registerFormSkeleton(server: McpServer): void {
  server.registerPrompt(
    "data7_form_skeleton",
    {
      title: "Esqueleto de tela (Form) Data7 Basic",
      description:
        "Gera o esqueleto de uma tela funcional seguindo o idioma de produção: classe que possui um Forms.Form privado, monta a árvore de controles em _build com layout Align, fia eventos e expõe Show/Free.",
      argsSchema: {
        className: z.string().min(1).describe('Nome da classe da tela. Exemplo: "TFormCadastro".'),
        namespaceName: z.string().min(1).describe('Namespace do módulo. Exemplo: "mod_cadastro".'),
        title: z.string().optional().describe('Título da janela (Caption). Default: "Minha Tela".'),
        layout: z
          .enum(["simple", "header-content-footer", "list"])
          .optional()
          .describe(
            "Layout: 'simple' (só conteúdo alClient), 'header-content-footer' (3 regiões) ou 'list' (barra de ações no topo + Grid preenchendo — tela de listagem de ERP). Default: simple.",
          ),
        withButton: z
          .boolean()
          .optional()
          .describe(
            "Quando true, adiciona um CommandButton com OnClick + evento próprio OnConfirmEvent. Default: false.",
          ),
      },
    },
    (args) => {
      const code = buildSkeleton({
        className: args.className,
        namespaceName: args.namespaceName,
        title: args.title ?? "Minha Tela",
        layout: args.layout ?? "simple",
        withButton: args.withButton ?? false,
      });
      return {
        description: `Esqueleto de tela para ${args.className}.`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `Crie a tela ${args.className} usando o esqueleto abaixo, fiel ao idioma de ` +
                "produção do Data7 (Form privado + _build + layout Align + Show/Free). " +
                "Adicione os controles do conteúdo conforme a necessidade do domínio.\n\n" +
                "```basic\n" +
                code +
                "\n```",
            },
          },
        ],
      };
    },
  );
}
