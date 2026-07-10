import type { SystemSymbolInfo } from "../types";
import { buildClassSymbols, param } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = buildClassSymbols({
  className: "StringList",
  namespaceContainer: "Collections",
  inheritsFrom: "Collections.TStringList",
  description:
    "Classe nativa para manipulação de listas de strings, pares chave-valor e textos longos.",
  properties: [
    { name: "Count", type: "Integer", description: "Quantidade de elementos na lista." },
    {
      name: "Text",
      type: "String",
      description: "Todo o conteúdo do StringList concatenado e separado por quebras de linha.",
    },
    {
      name: "NameValueSeparator",
      type: "String",
      description: 'Caractere separador de chaves e valores (padrão é "=").',
    },
    {
      name: "LineBreak",
      type: "String",
      description: "Caractere separador de quebras de linha para a propriedade Text.",
    },
    {
      name: "Capacity",
      type: "Integer",
      description: "Capacidade máxima de Strings que poderão ser adicionadas à lista.",
    },
    {
      name: "CommaText",
      type: "String",
      description: "Lista formatada/obtida por meio de uma string separada por vírgulas.",
    },
    {
      name: "OwnsObjects",
      type: "Boolean",
      description: "Especifica se a lista possui a propriedade dos objetos armazenados.",
    },
    {
      name: "Sorted",
      type: "Boolean",
      description: "Ordena a lista de strings por ordem ascendente.",
    },
  ],
  methods: [
    {
      name: "Add",
      returns: "Integer",
      params: [param("pText", "String")],
      description: "Adiciona uma string na lista e retorna o índice adicionado.",
    },
    {
      name: "AddObject",
      returns: "Integer",
      params: [param("pText", "String"), param("pObj", "TObject")],
      description: "Adiciona uma string associada a um objeto na lista.",
    },
    {
      name: "Strings",
      returns: "String",
      params: [param("pIndex", "Integer")],
      description: "Retorna a string presente no índice especificado.",
    },
    {
      name: "Objects",
      returns: "TObject",
      params: [param("pIndex", "Integer")],
      description: "Retorna o objeto associado no índice especificado.",
    },
    {
      name: "Clear",
      returns: "Void",
      params: [],
      description: "Esvazia a lista inteira.",
    },
    {
      name: "Delete",
      returns: "Void",
      params: [param("pIndex", "Integer")],
      description: "Remove o elemento do índice indicado da lista.",
    },
    {
      name: "IndexOfName",
      returns: "Integer",
      params: [param("pName", "String")],
      description: "Localiza o índice do par Nome=Valor cujo nome corresponde ao parâmetro.",
    },
    {
      name: "IndexOf",
      returns: "Integer",
      params: [param("pValue", "String")],
      description:
        "Retorna o índice da primeira ocorrência da string especificada na lista, ou -1 se não for encontrada.",
    },
    {
      name: "Values",
      returns: "String",
      params: [param("pName", "String")],
      description: "Retorna o valor associado à chave em um par Nome=Valor.",
    },
    {
      name: "Insert",
      returns: "Void",
      params: [param("pIndex", "Integer"), param("pText", "String")],
      description: "Insere uma linha no índice indicado.",
    },
    {
      name: "Equals",
      returns: "Boolean",
      params: [param("pText", "String")],
      description: "Compara duas strings.",
    },
    {
      name: "IndexOfObject",
      returns: "Integer",
      params: [param("pObj", "TObject")],
      description: "Retorna o índice da primeira ocorrência do objeto especificado na lista.",
    },
    {
      name: "AddStrings",
      returns: "Void",
      params: [param("pList", "StringList")],
      description: "Adiciona strings de outro objeto StringList à lista.",
    },
    {
      name: "Append",
      returns: "Void",
      params: [param("pText", "String")],
      description: "Adiciona uma string à lista de strings.",
    },
    {
      name: "Assign",
      returns: "Void",
      params: [param("pSource", "TObject")],
      description: "Copia o conteúdo de outro objeto compatível para esta lista.",
    },
    {
      name: "BeginUpdate",
      returns: "Void",
      params: [],
      description:
        "Chame BeginUpdate antes de modificar diretamente as sequências de caracteres na lista.",
    },
    {
      name: "EndUpdate",
      returns: "Void",
      params: [],
      description: "Chame EndUpdate para finalizar modificações na lista de strings.",
    },
    {
      name: "Exchange",
      returns: "Void",
      params: [param("pIndex1", "Integer"), param("pIndex2", "Integer")],
      description: "Utilize o Exchange para reorganizar as sequências de caracteres na lista.",
    },
    {
      name: "InsertObject",
      returns: "Void",
      params: [param("pIndex", "Integer"), param("pText", "String"), param("pObj", "TObject")],
      description: "Insere uma string na lista na posição especificada e a associa a um objeto.",
    },
    {
      name: "SaveToFile",
      returns: "Void",
      params: [param("pFileName", "String")],
      description: "Salva as strings em um arquivo de texto.",
    },
    {
      name: "LoadFromFile",
      returns: "Void",
      params: [param("pFileName", "String")],
      description: "Preenche uma lista de strings com os dados de um arquivo físico.",
    },
    {
      name: "Move",
      returns: "Void",
      params: [param("pCurIndex", "Integer"), param("pNewIndex", "Integer")],
      description: "Altera a posição de uma sequência na lista.",
    },
    {
      name: "Names",
      returns: "String",
      params: [param("pIndex", "Integer")],
      description: "Retorna a parte de nome de um par chave-valor no índice indicado.",
    },
  ],
});
