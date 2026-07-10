import type { SystemSymbolInfo } from "../types";
import { defineEnum } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = defineEnum({
  name: "TModalResult",
  containerName: "Forms",
  description:
    "Representa o valor de retorno de um diálogo modal. Use estes mrXxx em ButtonOk/ButtonCancel.ModalResult ou retorne diretamente em Form.ShowModal.",
  values: [
    ["mrNone", "Sem resultado (0) — diálogo permanece aberto."],
    ["mrOk", "Resultado Ok (1) — confirmação do usuário."],
    ["mrCancel", "Resultado Cancel (2) — cancelamento pelo usuário."],
    ["mrAbort", "Resultado Abort (3) — operação abortada."],
    ["mrRetry", "Resultado Retry (4) — tentar novamente."],
    ["mrIgnore", "Resultado Ignore (5) — ignorar e continuar."],
    ["mrYes", "Resultado Yes (6) — sim."],
    ["mrNo", "Resultado No (7) — não."],
    ["mrAll", "Resultado All (8) — aplicar a tudo."],
    ["mrNoToAll", "Resultado NoToAll (9) — não para todos os itens."],
    ["mrYesToAll", "Resultado YesToAll (10) — sim para todos os itens."],
    ["mrClose", "Resultado Close (11) — fechar."],
  ],
});
