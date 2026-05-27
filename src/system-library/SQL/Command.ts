import type { SystemSymbolInfo } from "../types";
import { buildClassSymbols, type MethodSpec, type PropSpec, UNSUP_NOTE } from "../symbol-helpers";

/**
 * SQL.Command — wrapper Data7 sobre a hierarquia FireDAC `TFDQuery` →
 * `TFDCustomQuery` → `TFDDataSet` → `TDataSet` → `TComponent` → `TObject`.
 *
 * Como o projeto não modela cada uma dessas classes intermediárias
 * separadamente, todos os membros visíveis ao usuário ficam declarados aqui.
 *
 * Tipos FireDAC referenciados pelas propriedades (`TFDDataSetEvent`,
 * `TFilterOptions`, `TFDUpdateRecordTypes`, …) estão definidos em
 * `system-library/SQL/_aliases.ts`.
 *
 * Itens marcados `isUnsupported: true` aparecem no autocomplete original
 * (FireDAC/VCL) mas o compilador Data7 não traduz seu uso. O linter emite
 * o diagnóstico `unsupported-member` quando esses membros são referenciados
 * em `.bas` (ver `src/diagnostic-codes.ts`).
 */

// ───────── Properties (FireDAC + TDataSet + TComponent + extensões Data7) ─────────
const properties: readonly PropSpec[] = [
  // Identidade / runtime (TComponent)
  { name: "Name", type: "String", description: "Nome do componente no projeto." },
  { name: "Tag", type: "Integer", description: "Inteiro de uso livre associado ao componente." },
  {
    name: "ComObject",
    type: "Variant",
    description: "Interface IInterface para integração COM/Automation.",
  },
  {
    name: "ComponentCount",
    type: "Integer",
    description: "Número de subcomponentes pertencentes a este componente.",
  },
  {
    name: "ComponentIndex",
    type: "Integer",
    description: "Posição deste componente na lista do Owner.",
  },
  {
    name: "ComponentState",
    type: "Variant",
    description: "Estado atual do componente (csLoading, csReading, ...)." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "ComponentStyle",
    type: "Variant",
    description: "Características personalizadas do componente." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "DesignInfo",
    type: "Integer",
    description: "Inteiro usado pelo designer para guardar posição/tamanho.",
  },
  { name: "Owner", type: "TComponent", description: "Componente responsável por liberá-lo." },
  {
    name: "VCLComObject",
    type: "Pointer",
    description: "Acesso à instância COM/VCL associada ao componente.",
  },
  {
    name: "Observers",
    type: "Variant",
    description: "Lista de observadores VCL." + UNSUP_NOTE,
    isUnsupported: true,
  },

  // TFDQuery — controle de ativação
  {
    name: "ActiveStoredUsage",
    type: "TFDStoredActivationUsage",
    description: "Controla a persistência do estado Active em design/runtime.",
  },
  {
    name: "Active",
    type: "Boolean",
    description: "Abre ou fecha o conjunto de dados (equivale a Open/Close).",
  },
  {
    name: "AutoCalcFields",
    type: "Boolean",
    description: "Habilita o cálculo automático dos campos calculados.",
  },

  // TFDQuery — eventos Before*/After*
  {
    name: "BeforeOpen",
    type: "TDataSetNotifyEvent",
    description: "Disparado antes de Open executar.",
  },
  {
    name: "AfterOpen",
    type: "TDataSetNotifyEvent",
    description: "Disparado após Open executar com sucesso.",
  },
  {
    name: "BeforeClose",
    type: "TDataSetNotifyEvent",
    description: "Disparado antes de Close executar.",
  },
  { name: "AfterClose", type: "TDataSetNotifyEvent", description: "Disparado após Close." },
  {
    name: "BeforeInsert",
    type: "TDataSetNotifyEvent",
    description: "Disparado antes de inserir um registro.",
  },
  {
    name: "AfterInsert",
    type: "TDataSetNotifyEvent",
    description: "Disparado após inserir um registro.",
  },
  {
    name: "BeforeEdit",
    type: "TDataSetNotifyEvent",
    description: "Disparado antes de entrar em modo de edição.",
  },
  {
    name: "AfterEdit",
    type: "TDataSetNotifyEvent",
    description: "Disparado após entrar em modo de edição.",
  },
  {
    name: "BeforePost",
    type: "TDataSetNotifyEvent",
    description: "Disparado antes de Post gravar o registro.",
  },
  {
    name: "AfterPost",
    type: "TDataSetNotifyEvent",
    description: "Disparado após Post gravar o registro.",
  },
  {
    name: "BeforeCancel",
    type: "TDataSetNotifyEvent",
    description: "Disparado antes de Cancel reverter alterações.",
  },
  {
    name: "AfterCancel",
    type: "TDataSetNotifyEvent",
    description: "Disparado após Cancel reverter alterações.",
  },
  {
    name: "BeforeDelete",
    type: "TDataSetNotifyEvent",
    description: "Disparado antes de excluir o registro corrente.",
  },
  {
    name: "AfterDelete",
    type: "TDataSetNotifyEvent",
    description: "Disparado após excluir o registro corrente.",
  },
  {
    name: "BeforeScroll",
    type: "TDataSetNotifyEvent",
    description: "Disparado antes de mover o cursor.",
  },
  {
    name: "AfterScroll",
    type: "TDataSetNotifyEvent",
    description: "Disparado após mover o cursor.",
  },
  {
    name: "BeforeRefresh",
    type: "TDataSetNotifyEvent",
    description: "Disparado antes de Refresh.",
  },
  { name: "AfterRefresh", type: "TDataSetNotifyEvent", description: "Disparado após Refresh." },
  {
    name: "OnCalcFields",
    type: "TDataSetNotifyEvent",
    description: "Disparado para calcular campos calculados.",
  },
  {
    name: "OnNewRecord",
    type: "TDataSetNotifyEvent",
    description: "Disparado ao criar um novo registro.",
  },

  // TFDQuery — eventos de erro
  {
    name: "OnDeleteError",
    type: "TMethod",
    description: "Disparado quando Delete falha.",
  },
  {
    name: "OnEditError",
    type: "TMethod",
    description: "Disparado quando Edit/Post falha.",
  },
  {
    name: "OnPostError",
    type: "TMethod",
    description: "Disparado quando Post falha.",
  },

  // Filtro / opções
  {
    name: "FieldOptions",
    type: "Variant",
    description: "Opções de comportamento dos campos." + UNSUP_NOTE,
    isUnsupported: true,
  },
  { name: "Filtered", type: "Boolean", description: "Habilita ou desabilita o filtro local." },
  {
    name: "FilterOptions",
    type: "TFilterOptions",
    description: "Opções de comparação do filtro (case insensitive, etc.).",
  },
  { name: "Filter", type: "String", description: "Expressão de filtro local aplicada ao DataSet." },
  {
    name: "OnFilterRecord",
    type: "TFilterRecordEvent",
    description: "Callback de filtro programático por registro.",
  },
  {
    name: "ObjectView",
    type: "Boolean",
    description: "Acessa campos como objetos hierárquicos (ADT/Array).",
  },
  {
    name: "Constraints",
    type: "Variant",
    description: "Constraints (regras) declaradas no DataSet." + UNSUP_NOTE,
    isUnsupported: true,
  },

  // Cache / updates
  {
    name: "CachedUpdates",
    type: "Boolean",
    description: "Habilita o modo de updates em cache (delta local).",
  },
  {
    name: "FilterChanges",
    type: "TFDUpdateRecordTypes",
    description: "Filtra quais registros do delta de cache são visíveis.",
  },
  {
    name: "Indexes",
    type: "Variant",
    description: "Definições de índices em memória." + UNSUP_NOTE,
    isUnsupported: true,
  },
  { name: "IndexesActive", type: "Boolean", description: "Habilita os índices em memória." },
  { name: "IndexName", type: "String", description: "Nome do índice ativo." },
  {
    name: "IndexFieldNames",
    type: "String",
    description: "Lista de campos para indexação ad-hoc.",
  },
  {
    name: "Aggregates",
    type: "Variant",
    description: "Agregações declarativas." + UNSUP_NOTE,
    isUnsupported: true,
  },
  { name: "AggregatesActive", type: "Boolean", description: "Habilita as agregações declaradas." },
  {
    name: "ConstraintsEnabled",
    type: "Boolean",
    description: "Habilita a validação das constraints definidas.",
  },

  // Master-detail
  {
    name: "MasterSource",
    type: "Variant",
    description: "DataSource pai em relacionamento master-detail." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "MasterFields",
    type: "String",
    description: "Campos chave do DataSet master.",
  },
  {
    name: "DetailFields",
    type: "String",
    description: "Campos chave do DataSet detail.",
  },
  {
    name: "OnUpdateRecord",
    type: "TMethod",
    description: "Customização da atualização de registros.",
  },
  {
    name: "OnUpdateError",
    type: "TMethod",
    description: "Disparado quando ApplyUpdates encontra erro.",
  },
  {
    name: "OnReconcileError",
    type: "TMethod",
    description: "Disparado para reconciliar erros após ApplyUpdates.",
  },

  // FireDAC — eventos específicos
  {
    name: "BeforeExecute",
    type: "TFDDataSetEvent",
    description: "Disparado antes de executar o comando (Execute/ExecSQL).",
  },
  {
    name: "AfterExecute",
    type: "TFDDataSetEvent",
    description: "Disparado após a execução do comando.",
  },
  {
    name: "BeforeApplyUpdates",
    type: "TFDDataSetEvent",
    description: "Disparado antes de aplicar updates do cache.",
  },
  {
    name: "AfterApplyUpdates",
    type: "TFDAfterApplyUpdatesEvent",
    description: "Disparado após aplicar updates do cache.",
  },
  {
    name: "BeforeGetRecords",
    type: "TFDDataSetEvent",
    description: "Disparado antes de buscar registros do servidor.",
  },
  {
    name: "AfterGetRecords",
    type: "TFDDataSetEvent",
    description: "Disparado após buscar registros do servidor.",
  },
  {
    name: "AfterGetRecord",
    type: "TFDDataSetEvent",
    description: "Disparado após buscar cada registro individual.",
  },
  {
    name: "BeforeRowRequest",
    type: "TFDDataSetEvent",
    description: "Disparado antes de requisitar uma linha.",
  },
  {
    name: "AfterRowRequest",
    type: "TFDDataSetEvent",
    description: "Disparado após receber a linha requisitada.",
  },
  {
    name: "OnMasterSetValues",
    type: "TFDDataSetEvent",
    description: "Disparado ao propagar valores do master.",
  },

  // LocalSQL / ChangeAlerter
  {
    name: "LocalSQL",
    type: "Variant",
    description: "Engine de LocalSQL anexo." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "ChangeAlerter",
    type: "Variant",
    description: "Notificador de alterações no banco." + UNSUP_NOTE,
    isUnsupported: true,
  },
  { name: "ChangeAlertName", type: "String", description: "Nome do alerta configurado." },

  // Conexão
  { name: "ConnectionName", type: "String", description: "Nome lógico da Connection associada." },
  {
    name: "Connection",
    type: "Variant",
    description: "Conexão (TFDConnection) associada ao comando." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "Transaction",
    type: "Variant",
    description: "Transação leitora associada." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "UpdateTransaction",
    type: "Variant",
    description: "Transação de escrita usada em ApplyUpdates." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "SchemaAdapter",
    type: "Variant",
    description: "Schema adapter compartilhado." + UNSUP_NOTE,
    isUnsupported: true,
  },

  // Parâmetros / formatação
  {
    name: "Params",
    type: "Variant",
    description: "Coleção de parâmetros (TFDParams)." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "FetchOptions",
    type: "Variant",
    description: "Opções de Fetch." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "FormatOptions",
    type: "Variant",
    description: "Opções de formatação de dados." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "ResourceOptions",
    type: "Variant",
    description: "Opções de uso de recursos." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "SecurityOptions",
    type: "Variant",
    description: "Opções de segurança/credenciais." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "UpdateOptions",
    type: "Variant",
    description: "Opções de aplicação de updates." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "UpdateObject",
    type: "Variant",
    description: "Componente de update customizado." + UNSUP_NOTE,
    isUnsupported: true,
  },

  // Erros e mudança de comando
  { name: "OnError", type: "TFDErrorEvent", description: "Tratamento centralizado de erros." },
  { name: "OnExecuteError", type: "TMethod", description: "Tratamento de erros de execução." },
  {
    name: "OnCommandChanged",
    type: "TNotifyEvent",
    description: "Disparado quando o texto SQL muda.",
  },

  // SQL e macros
  { name: "SQL", type: "TStrings", description: "Lista de strings com a instrução SQL." },
  {
    name: "Macros",
    type: "Variant",
    description: "Coleção de macros SQL (TFDMacros)." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "CommandText",
    type: "String",
    description: "Define ou obtém a instrução SQL a ser executada.",
  },
  {
    name: "CodigoTabela",
    type: "Integer",
    description: "Código de tabela do ERP (extensão Data7).",
  },
  {
    name: "ReadOnly",
    type: "Boolean",
    description: "Indica se o conjunto de dados é somente leitura.",
  },
  {
    name: "RowsAffected",
    type: "Integer",
    description: "Indica a quantidade de registros afetados pela última execução.",
  },
  { name: "MacroCount", type: "Integer", description: "Quantidade de macros declaradas." },
  { name: "Text", type: "String", description: "Conteúdo SQL como string única." },
  { name: "ParamCount", type: "Integer", description: "Quantidade de parâmetros declarados." },

  // Mais associados
  {
    name: "DataSource",
    type: "Variant",
    description: "DataSource conectado." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "Prepared",
    type: "Boolean",
    description: "Indica se a query está preparada no servidor.",
  },
  {
    name: "Adapter",
    type: "Variant",
    description: "Adapter de comando customizado." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "DatsManager",
    type: "Variant",
    description: "Gerenciador de DataS internos." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "Command",
    type: "Variant",
    description: "Comando FireDAC subjacente." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "PointedConnection",
    type: "Variant",
    description: "Connection efetivamente em uso." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "ServerEditRequest",
    type: "Variant",
    description: "Requisição de edição no servidor." + UNSUP_NOTE,
    isUnsupported: true,
  },

  // TFDDataSet — campos de estado
  { name: "ActualDetailFields", type: "String", description: "DetailFields resolvido em runtime." },
  { name: "ChangeCount", type: "Integer", description: "Quantidade de alterações no cache." },
  { name: "ClientCursor", type: "Boolean", description: "Habilita cursor cliente em memória." },
  {
    name: "CloneSource",
    type: "TFDDataSet",
    description: "DataSet de origem quando este é um clone.",
  },
  {
    name: "Data",
    type: "Variant",
    description: "Snapshot serializável do DataSet." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "Delta",
    type: "Variant",
    description: "Conjunto de alterações pendentes (delta)." + UNSUP_NOTE,
    isUnsupported: true,
  },
  { name: "Exists", type: "Boolean", description: "Indica se há ao menos um registro." },
  {
    name: "RowError",
    type: "Variant",
    description: "Erro associado à linha atual." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "FilteredData",
    type: "Variant",
    description: "Dados após aplicação do filtro." + UNSUP_NOTE,
    isUnsupported: true,
  },
  { name: "GroupingLevel", type: "Integer", description: "Nível de agrupamento atual." },
  { name: "UpdatesPending", type: "Boolean", description: "Indica se há updates pendentes." },
  {
    name: "IndexDefs",
    type: "Variant",
    description: "Definições de índices." + UNSUP_NOTE,
    isUnsupported: true,
  },
  { name: "LocalIndexName", type: "String", description: "Nome do índice em memória ativo." },
  {
    name: "IndexFieldCount",
    type: "Integer",
    description: "Quantidade de campos do índice ativo.",
  },
  {
    name: "KeyExclusive",
    type: "Boolean",
    description: "Comparações de chave usam strict exclusive.",
  },
  {
    name: "KeyFieldCount",
    type: "Integer",
    description: "Quantidade de campos-chave da pesquisa.",
  },
  {
    name: "MasterLink",
    type: "Variant",
    description: "Link master-detail." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "OptionsIntf",
    type: "Variant",
    description: "Interface de opções estendidas." + UNSUP_NOTE,
    isUnsupported: true,
  },
  { name: "ParentDataSet", type: "TFDDataSet", description: "DataSet pai em datasets aninhados." },
  { name: "SavePoint", type: "Long", description: "Marcação para rollback parcial." },
  { name: "SourceEOF", type: "Boolean", description: "Indica fim de leitura na fonte." },
  {
    name: "SourceView",
    type: "Variant",
    description: "View origem." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "Table",
    type: "Variant",
    description: "Storage interno em forma de tabela." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "BaseView",
    type: "Variant",
    description: "View base do DataSet." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "Encoder",
    type: "Variant",
    description: "Codificador interno de valores." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "AggFields",
    type: "Variant",
    description: "Campos agregados." + UNSUP_NOTE,
    isUnsupported: true,
  },

  // TDataSet — estado de navegação
  {
    name: "Bof",
    type: "Boolean",
    description: "Indica que o cursor está antes do primeiro registro.",
  },
  {
    name: "Bookmark",
    type: "Variant",
    description: "Marcador de posição atual." + UNSUP_NOTE,
    isUnsupported: true,
  },
  { name: "CanModify", type: "Boolean", description: "Indica se o conjunto permite alteração." },
  { name: "CanRefresh", type: "Boolean", description: "Indica se Refresh é suportado." },
  {
    name: "DataSetField",
    type: "Variant",
    description: "Campo aninhado de DataSet." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "Designer",
    type: "Variant",
    description: "Interface de designer." + UNSUP_NOTE,
    isUnsupported: true,
  },
  { name: "Eof", type: "Boolean", description: "Indica que o cursor está após o último registro." },
  { name: "BlockReadSize", type: "Integer", description: "Tamanho do bloco de leitura em lote." },
  { name: "FieldCount", type: "Integer", description: "Quantidade de campos no DataSet." },
  {
    name: "FieldDefs",
    type: "Variant",
    description: "Definições dos campos físicos." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "FieldDefList",
    type: "Variant",
    description: "Lista compactada de definições de campo." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "Fields",
    type: "Variant",
    description: "Coleção TFields." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "FieldList",
    type: "Variant",
    description: "Lista de campos resolvidos." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "Found",
    type: "Boolean",
    description: "Indica se a última pesquisa encontrou registro.",
  },
  {
    name: "IsUniDirectional",
    type: "Boolean",
    description: "Indica navegação somente para frente.",
  },
  {
    name: "Modified",
    type: "Boolean",
    description: "Indica registro modificado pendente de Post.",
  },
  {
    name: "StoredFieldKinds",
    type: "Variant",
    description: "Tipos de campos armazenados." + UNSUP_NOTE,
    isUnsupported: true,
  },
  {
    name: "RecordCount",
    type: "Integer",
    description: "Quantidade total de registros no DataSet.",
  },
  { name: "RecNo", type: "Integer", description: "Número do registro atual." },
  { name: "RecordSize", type: "Integer", description: "Tamanho em bytes do registro." },
  { name: "SparseArrays", type: "Boolean", description: "Usa arrays esparsos para campos array." },
  {
    name: "State",
    type: "Variant",
    description: "Estado atual do DataSet (dsBrowse, dsEdit, ...)." + UNSUP_NOTE,
    isUnsupported: true,
  },
  // Total resultado / paginação (extensão Data7)
  {
    name: "Count",
    type: "Integer",
    description: "Quantidade total de registros (extensão Data7).",
  },
];

// ───────── Methods (incluindo overloads de Open/ExecSQL) ─────────
const methods: readonly MethodSpec[] = [
  // Construtor "estilo Data7" (Sub New)
  {
    name: "New",
    returns: "Command",
    params: [],
    description: "Construtor padrão sem parâmetros.",
  },

  // Abertura / execução
  {
    name: "Open",
    returns: "Void",
    params: [
      {
        name: "pDescricao",
        type: "String",
        isOptional: true,
        defaultValue: '""',
      },
      {
        name: "pTituloJanela",
        type: "String",
        isOptional: true,
        defaultValue: '""',
      },
      {
        name: "pNomeJanela",
        type: "String",
        isOptional: true,
        defaultValue: '""',
      },
    ],
    description:
      "Abre a query e popula o cursor de resultados. Parâmetros opcionais controlam o feedback ao usuário em janelas longas.",
  },
  {
    name: "ExecSQL",
    returns: "Integer",
    params: [
      {
        name: "pDescricao",
        type: "String",
        isOptional: true,
        defaultValue: '""',
      },
      {
        name: "pTituloJanela",
        type: "String",
        isOptional: true,
        defaultValue: '""',
      },
      {
        name: "pNomeJanela",
        type: "String",
        isOptional: true,
        defaultValue: '""',
      },
    ],
    description:
      "Executa uma instrução DML/DDL no banco e retorna a quantidade de registros afetados.",
  },
  {
    name: "IsEmpty",
    returns: "Boolean",
    params: [],
    description: "Retorna True caso não existam registros no conjunto de dados.",
  },
  {
    name: "RowsAffected",
    returns: "Integer",
    params: [],
    description:
      "Retorna a quantidade de registros afetados pela última execução (variante função do property).",
  },
  {
    name: "Close",
    returns: "Void",
    params: [],
    description: "Fecha o cursor de resultados e libera recursos da query.",
  },

  // Navegação
  {
    name: "Next",
    returns: "Void",
    params: [],
    description: "Move o cursor para o próximo registro do conjunto de dados.",
  },
  {
    name: "First",
    returns: "Void",
    params: [],
    description: "Move o cursor para o primeiro registro do conjunto de dados.",
  },
  {
    name: "Last",
    returns: "Void",
    params: [],
    description: "Move o cursor para o último registro do conjunto de dados.",
  },
  {
    name: "Prior",
    returns: "Void",
    params: [],
    description: "Move o cursor para o registro anterior do conjunto de dados.",
  },

  // Acessores
  {
    name: "Field",
    returns: "TField",
    params: [{ name: "pFieldName", type: "String" }],
    description: "Retorna o objeto TField para leitura/escrita da coluna indicada.",
  },
  {
    name: "Param",
    returns: "TFDParam",
    params: [{ name: "pParamName", type: "String" }],
    description: "Retorna o objeto TFDParam para definição do valor de um parâmetro em runtime.",
  },

  // Persistência
  {
    name: "SaveToFile",
    returns: "Void",
    params: [
      { name: "pFileName", type: "String" },
      { name: "pSalvarEmXML", type: "Boolean", isOptional: true, defaultValue: "True" },
    ],
    description:
      "Salva os registros do conjunto de dados em um arquivo (padrão XML; aceita binário Data7).",
  },

  // Acessor interno EOF
  {
    name: "TCommandSQL_GetEOF",
    returns: "Boolean",
    params: [],
    description: "Acessor interno usado pelo runtime para resolver a propriedade Eof.",
  },
];

export const symbols: SystemSymbolInfo[] = buildClassSymbols({
  className: "Command",
  namespaceContainer: "SQL",
  inheritsFrom: "TObject",
  description: "Classe para execução de queries e comandos SQL no ERP.",
  properties,
  methods,
});
