import type { SystemSymbolInfo } from "../types";
import { buildClassSymbols } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "System.IOUtils",
    kind: "namespace",
    type: "System.IOUtils",
    isShared: true,
    isPrivate: false,
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    fileUri: "system://library",
    description:
      "Namespace nativo Delphi para operacoes de arquivo, diretorio e manipulacao de caminhos.",
  },
  {
    name: "IOUtils",
    kind: "class",
    type: "IOUtils",
    isShared: true,
    isPrivate: false,
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    fileUri: "system://library",
    containerName: "System",
    description: "Utilitários para manipulação do sistema de arquivos.",
  },
  {
    name: "FileExists",
    kind: "method",
    type: "Boolean",
    isShared: true,
    isPrivate: false,
    parameters: [
      {
        name: "pPath",
        type: "String",
        isByRef: false,
        isOptional: false,
      },
    ],
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    fileUri: "system://library",
    containerName: "IOUtils",
    description: "Verifica se o arquivo especificado existe no disco.",
  },
  {
    name: "DirectoryExists",
    kind: "method",
    type: "Boolean",
    isShared: true,
    isPrivate: false,
    parameters: [
      {
        name: "pPath",
        type: "String",
        isByRef: false,
        isOptional: false,
      },
    ],
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    fileUri: "system://library",
    containerName: "IOUtils",
    description: "Verifica se o diretório especificado existe no disco.",
  },
  ...buildClassSymbols({
    className: "TFile",
    namespaceContainer: "System.IOUtils",
    isShared: true,
    description:
      "Classe estatica do namespace Delphi System.IOUtils para operacoes comuns com arquivos.",
    methods: [
      {
        name: "Exists",
        returns: "Boolean",
        params: [{ name: "Path", type: "String" }],
        description: "Retorna True quando o arquivo informado existe.",
      },
      {
        name: "Delete",
        returns: "Void",
        params: [{ name: "Path", type: "String" }],
        description: "Remove o arquivo informado.",
      },
      {
        name: "Copy",
        returns: "Void",
        params: [
          { name: "SourceFileName", type: "String" },
          { name: "DestFileName", type: "String" },
          { name: "Overwrite", type: "Boolean", isOptional: true },
        ],
        description: "Copia um arquivo para outro caminho.",
      },
      {
        name: "Move",
        returns: "Void",
        params: [
          { name: "SourceFileName", type: "String" },
          { name: "DestFileName", type: "String" },
        ],
        description: "Move ou renomeia um arquivo.",
      },
      {
        name: "ReadAllText",
        returns: "String",
        params: [{ name: "Path", type: "String" }],
        description: "Le todo o conteudo textual de um arquivo.",
      },
      {
        name: "WriteAllText",
        returns: "Void",
        params: [
          { name: "Path", type: "String" },
          { name: "Contents", type: "String" },
        ],
        description: "Escreve texto em um arquivo, substituindo o conteudo existente.",
      },
      {
        name: "AppendAllText",
        returns: "Void",
        params: [
          { name: "Path", type: "String" },
          { name: "Contents", type: "String" },
        ],
        description: "Acrescenta texto ao fim de um arquivo.",
      },
      {
        name: "ReadAllBytes",
        returns: "Variant",
        params: [{ name: "Path", type: "String" }],
        description: "Le todo o conteudo binario de um arquivo.",
      },
      {
        name: "WriteAllBytes",
        returns: "Void",
        params: [
          { name: "Path", type: "String" },
          { name: "Bytes", type: "Variant" },
        ],
        description: "Escreve conteudo binario em um arquivo.",
      }
    ],
  }),
  ...buildClassSymbols({
    className: "TPath",
    namespaceContainer: "System.IOUtils",
    isShared: true,
    description: "Classe estatica do namespace Delphi System.IOUtils para manipulacao de caminhos.",
    methods: [
      {
        name: "Combine",
        returns: "String",
        params: [
          { name: "Path1", type: "String" },
          { name: "Path2", type: "String" },
        ],
        description: "Combina dois segmentos de caminho.",
      },
      {
        name: "GetTempPath",
        returns: "String",
        params: [],
        description: "Retorna o diretorio temporario do sistema.",
      },
      {
        name: "GetTempFileName",
        returns: "String",
        params: [],
        description: "Cria e retorna um nome de arquivo temporario.",
      },
      {
        name: "GetFileName",
        returns: "String",
        params: [{ name: "FileName", type: "String" }],
        description: "Retorna o nome do arquivo de um caminho.",
      },
      {
        name: "GetFileNameWithoutExtension",
        returns: "String",
        params: [{ name: "FileName", type: "String" }],
        description: "Retorna o nome do arquivo sem extensao.",
      },
      {
        name: "GetDirectoryName",
        returns: "String",
        params: [{ name: "FileName", type: "String" }],
        description: "Retorna o diretorio de um caminho.",
      },
      {
        name: "GetExtension",
        returns: "String",
        params: [{ name: "FileName", type: "String" }],
        description: "Retorna a extensao de um caminho.",
      },
      {
        name: "ChangeExtension",
        returns: "String",
        params: [
          { name: "Path", type: "String" },
          { name: "Extension", type: "String" },
        ],
        description: "Altera a extensao de um caminho.",
      },
      {
        name: "HasExtension",
        returns: "Boolean",
        params: [{ name: "Path", type: "String" }],
        description: "Retorna True quando o caminho possui extensao.",
      },
      {
        name: "IsPathRooted",
        returns: "Boolean",
        params: [{ name: "Path", type: "String" }],
        description: "Retorna True quando o caminho possui raiz.",
      },
      {
        name: "GetFullPath",
        returns: "String",
        params: [{ name: "Path", type: "String" }],
        description: "Retorna o caminho absoluto equivalente.",
      },
      {
        name: "MatchesPattern",
        returns: "Boolean",
        params: [{ name: "FileName", type: "String" }, { name: "Pattern", type: "String" }, { name: "CaseSensitive", type: "Boolean" }],
        description: "Retorna True se o nome der match com o Pattern",
      },
    ],
  }),
];
