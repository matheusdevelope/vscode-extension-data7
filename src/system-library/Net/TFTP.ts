import type { SystemSymbolInfo } from "../types";
import { buildClassSymbols } from "../symbol-helpers";

/**
 * `Net.TFTP` — cliente FTP do ERP Data7.
 *
 * Documentação canônica do ERP:
 *   docs/Documentação Data7/Net/Net.TFTP.html
 *
 * Inventário oficial (rodapé da página):
 *   - 8 Subs (ChangeDir, Connect, Delete, Disconnect, Get, List, Put, Rename)
 *   - 6 Properties (Host, Passive, Password, Port, TransferType, UserName)
 *   - 1 Function marcada como deprecated/struck-through: `Connected` →
 *     emitida com `isUnsupported: true` (linter avisa quando acessada).
 *
 * As assinaturas de parâmetros refletem a semântica de FTP descrita em cada
 * sub-página `Net.TFTP.<member>.html`. Onde a documentação não explicita um
 * nome, usamos o termo descritivo (`directory`, `remoteFile`, `localFile`).
 */
export const symbols: SystemSymbolInfo[] = buildClassSymbols({
  className: "TFTP",
  namespaceContainer: "Net",
  description: "Cliente FTP. Possui métodos e propriedades para conectar-se a um servidor FTP.",
  properties: [
    {
      name: "Host",
      type: "String",
      description: "Obtém ou define o nome do servidor FTP.",
    },
    {
      name: "Passive",
      type: "Boolean",
      description: "Define se o modo de conexão com o servidor FTP será passivo.",
    },
    {
      name: "Password",
      type: "String",
      description: "Define a senha do usuário para autenticação no servidor FTP.",
    },
    {
      name: "Port",
      type: "Integer",
      description: "Obtém ou define a porta de conexão do servidor FTP. Padrão: 21.",
    },
    {
      name: "TransferType",
      type: "Integer",
      description:
        "Define o tipo de transferência (ASCII / Binário). Use os valores conforme " +
        "documentação do ERP.",
    },
    {
      name: "UserName",
      type: "String",
      description: "Define o nome do usuário para autenticação no servidor FTP.",
    },
    {
      name: "Connected",
      type: "Boolean",
      description:
        "Indica se o cliente está conectado ao servidor FTP. Marcada como obsoleta na " +
        "documentação do ERP (item riscado).",
      isUnsupported: true,
    },
  ],
  methods: [
    {
      name: "Connect",
      returns: "Void",
      params: [],
      description: "Conecta-se ao servidor FTP usando `Host`, `Port`, `UserName` e `Password`.",
    },
    {
      name: "Disconnect",
      returns: "Void",
      params: [],
      description: "Desconecta-se do servidor FTP.",
    },
    {
      name: "ChangeDir",
      returns: "Void",
      params: [{ name: "directory", type: "String" }],
      description: "Seleciona o diretório informado no parâmetro como diretório de trabalho.",
    },
    {
      name: "List",
      returns: "String",
      params: [],
      description:
        "Lista arquivos e diretórios do diretório atual no servidor FTP. " +
        "Use `ChangeDir` antes para especificar um caminho.",
    },
    {
      name: "Get",
      returns: "Void",
      params: [
        { name: "remoteFile", type: "String" },
        { name: "localFile", type: "String" },
      ],
      description: "Copia um arquivo do servidor FTP para o computador local.",
    },
    {
      name: "Put",
      returns: "Void",
      params: [
        { name: "localFile", type: "String" },
        { name: "remoteFile", type: "String" },
      ],
      description: "Envia um arquivo do computador local para o servidor FTP.",
    },
    {
      name: "Delete",
      returns: "Void",
      params: [{ name: "remoteFile", type: "String" }],
      description: "Exclui um arquivo do servidor FTP.",
    },
    {
      name: "Rename",
      returns: "Void",
      params: [
        { name: "oldName", type: "String" },
        { name: "newName", type: "String" },
      ],
      description: "Renomeia um arquivo no servidor FTP.",
    },
  ],
});
