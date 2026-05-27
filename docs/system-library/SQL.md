# Namespace `SQL`

> Documentação gerada automaticamente pela extensão **Data7 Dev Studio**.
> Reflete o estado atual da System Library reconhecida pelo linter / IntelliSense.

## 1. Visão geral

Lista de strings com a instrução SQL.

**Como importar:**

```basic
Imports SQL
```

## 2. Árvore de herança das classes

```
TObject  (externo)
├─ Command
├─ Connection
├─ TFDDataSet
└─ TFDParam
```

## 3. Classes (com membros próprios)

> Cada classe lista apenas seus membros **próprios**. Membros herdados podem ser consultados nas classes ancestrais via os links da cadeia de herança no topo de cada seção.

#### `Command`

**Herda de:** `TObject`

**Cadeia completa:** `TObject` → `System.Classes.TObject`

Classe para execução de queries e comandos SQL no ERP.

**Propriedades:**

| Nome | Tipo | Descrição |
|---|---|---|
| `Active` | `Boolean` | Abre ou fecha o conjunto de dados (equivale a Open/Close). |
| `ActiveStoredUsage` | [`TFDStoredActivationUsage`](#tfdstoredactivationusage) | Controla a persistência do estado Active em design/runtime. |
| `ActualDetailFields` | `String` | DetailFields resolvido em runtime. |
| `Adapter` | `Variant` | Adapter de comando customizado. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `AfterApplyUpdates` | [`TFDAfterApplyUpdatesEvent`](#tfdafterapplyupdatesevent) | Disparado após aplicar updates do cache. |
| `AfterCancel` | [`TDataSetNotifyEvent`](#tdatasetnotifyevent) | Disparado após Cancel reverter alterações. |
| `AfterClose` | [`TDataSetNotifyEvent`](#tdatasetnotifyevent) | Disparado após Close. |
| `AfterDelete` | [`TDataSetNotifyEvent`](#tdatasetnotifyevent) | Disparado após excluir o registro corrente. |
| `AfterEdit` | [`TDataSetNotifyEvent`](#tdatasetnotifyevent) | Disparado após entrar em modo de edição. |
| `AfterExecute` | [`TFDDataSetEvent`](#tfddatasetevent) | Disparado após a execução do comando. |
| `AfterGetRecord` | [`TFDDataSetEvent`](#tfddatasetevent) | Disparado após buscar cada registro individual. |
| `AfterGetRecords` | [`TFDDataSetEvent`](#tfddatasetevent) | Disparado após buscar registros do servidor. |
| `AfterInsert` | [`TDataSetNotifyEvent`](#tdatasetnotifyevent) | Disparado após inserir um registro. |
| `AfterOpen` | [`TDataSetNotifyEvent`](#tdatasetnotifyevent) | Disparado após Open executar com sucesso. |
| `AfterPost` | [`TDataSetNotifyEvent`](#tdatasetnotifyevent) | Disparado após Post gravar o registro. |
| `AfterRefresh` | [`TDataSetNotifyEvent`](#tdatasetnotifyevent) | Disparado após Refresh. |
| `AfterRowRequest` | [`TFDDataSetEvent`](#tfddatasetevent) | Disparado após receber a linha requisitada. |
| `AfterScroll` | [`TDataSetNotifyEvent`](#tdatasetnotifyevent) | Disparado após mover o cursor. |
| `AggFields` | `Variant` | Campos agregados. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `Aggregates` | `Variant` | Agregações declarativas. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `AggregatesActive` | `Boolean` | Habilita as agregações declaradas. |
| `AutoCalcFields` | `Boolean` | Habilita o cálculo automático dos campos calculados. |
| `BaseView` | `Variant` | View base do DataSet. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `BeforeApplyUpdates` | [`TFDDataSetEvent`](#tfddatasetevent) | Disparado antes de aplicar updates do cache. |
| `BeforeCancel` | [`TDataSetNotifyEvent`](#tdatasetnotifyevent) | Disparado antes de Cancel reverter alterações. |
| `BeforeClose` | [`TDataSetNotifyEvent`](#tdatasetnotifyevent) | Disparado antes de Close executar. |
| `BeforeDelete` | [`TDataSetNotifyEvent`](#tdatasetnotifyevent) | Disparado antes de excluir o registro corrente. |
| `BeforeEdit` | [`TDataSetNotifyEvent`](#tdatasetnotifyevent) | Disparado antes de entrar em modo de edição. |
| `BeforeExecute` | [`TFDDataSetEvent`](#tfddatasetevent) | Disparado antes de executar o comando (Execute/ExecSQL). |
| `BeforeGetRecords` | [`TFDDataSetEvent`](#tfddatasetevent) | Disparado antes de buscar registros do servidor. |
| `BeforeInsert` | [`TDataSetNotifyEvent`](#tdatasetnotifyevent) | Disparado antes de inserir um registro. |
| `BeforeOpen` | [`TDataSetNotifyEvent`](#tdatasetnotifyevent) | Disparado antes de Open executar. |
| `BeforePost` | [`TDataSetNotifyEvent`](#tdatasetnotifyevent) | Disparado antes de Post gravar o registro. |
| `BeforeRefresh` | [`TDataSetNotifyEvent`](#tdatasetnotifyevent) | Disparado antes de Refresh. |
| `BeforeRowRequest` | [`TFDDataSetEvent`](#tfddatasetevent) | Disparado antes de requisitar uma linha. |
| `BeforeScroll` | [`TDataSetNotifyEvent`](#tdatasetnotifyevent) | Disparado antes de mover o cursor. |
| `BlockReadSize` | `Integer` | Tamanho do bloco de leitura em lote. |
| `Bof` | `Boolean` | Indica que o cursor está antes do primeiro registro. |
| `Bookmark` | `Variant` | Marcador de posição atual. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `CachedUpdates` | `Boolean` | Habilita o modo de updates em cache (delta local). |
| `CanModify` | `Boolean` | Indica se o conjunto permite alteração. |
| `CanRefresh` | `Boolean` | Indica se Refresh é suportado. |
| `ChangeAlerter` | `Variant` | Notificador de alterações no banco. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `ChangeAlertName` | `String` | Nome do alerta configurado. |
| `ChangeCount` | `Integer` | Quantidade de alterações no cache. |
| `ClientCursor` | `Boolean` | Habilita cursor cliente em memória. |
| `CloneSource` | [`TFDDataSet`](#tfddataset) | DataSet de origem quando este é um clone. |
| `CodigoTabela` | `Integer` | Código de tabela do ERP (extensão Data7). |
| `Command` | `Variant` | Comando FireDAC subjacente. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `CommandText` | `String` | Define ou obtém a instrução SQL a ser executada. |
| `ComObject` | `Variant` | Interface IInterface para integração COM/Automation. |
| `ComponentCount` | `Integer` | Número de subcomponentes pertencentes a este componente. |
| `ComponentIndex` | `Integer` | Posição deste componente na lista do Owner. |
| `ComponentState` | `Variant` | Estado atual do componente (csLoading, csReading, ...). Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `ComponentStyle` | `Variant` | Características personalizadas do componente. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `Connection` | `Variant` | Conexão (TFDConnection) associada ao comando. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `ConnectionName` | `String` | Nome lógico da Connection associada. |
| `Constraints` | `Variant` | Constraints (regras) declaradas no DataSet. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `ConstraintsEnabled` | `Boolean` | Habilita a validação das constraints definidas. |
| `Count` | `Integer` | Quantidade total de registros (extensão Data7). |
| `Data` | `Variant` | Snapshot serializável do DataSet. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `DataSetField` | `Variant` | Campo aninhado de DataSet. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `DataSource` | `Variant` | DataSource conectado. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `DatsManager` | `Variant` | Gerenciador de DataS internos. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `Delta` | `Variant` | Conjunto de alterações pendentes (delta). Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `Designer` | `Variant` | Interface de designer. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `DesignInfo` | `Integer` | Inteiro usado pelo designer para guardar posição/tamanho. |
| `DetailFields` | `String` | Campos chave do DataSet detail. |
| `Encoder` | `Variant` | Codificador interno de valores. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `Eof` | `Boolean` | Indica que o cursor está após o último registro. |
| `Exists` | `Boolean` | Indica se há ao menos um registro. |
| `FetchOptions` | `Variant` | Opções de Fetch. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `FieldCount` | `Integer` | Quantidade de campos no DataSet. |
| `FieldDefList` | `Variant` | Lista compactada de definições de campo. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `FieldDefs` | `Variant` | Definições dos campos físicos. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `FieldList` | `Variant` | Lista de campos resolvidos. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `FieldOptions` | `Variant` | Opções de comportamento dos campos. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `Fields` | `Variant` | Coleção TFields. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `Filter` | `String` | Expressão de filtro local aplicada ao DataSet. |
| `FilterChanges` | [`TFDUpdateRecordTypes`](#tfdupdaterecordtypes) | Filtra quais registros do delta de cache são visíveis. |
| `Filtered` | `Boolean` | Habilita ou desabilita o filtro local. |
| `FilteredData` | `Variant` | Dados após aplicação do filtro. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `FilterOptions` | [`TFilterOptions`](#tfilteroptions) | Opções de comparação do filtro (case insensitive, etc.). |
| `FormatOptions` | `Variant` | Opções de formatação de dados. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `Found` | `Boolean` | Indica se a última pesquisa encontrou registro. |
| `GroupingLevel` | `Integer` | Nível de agrupamento atual. |
| `IndexDefs` | `Variant` | Definições de índices. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `Indexes` | `Variant` | Definições de índices em memória. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `IndexesActive` | `Boolean` | Habilita os índices em memória. |
| `IndexFieldCount` | `Integer` | Quantidade de campos do índice ativo. |
| `IndexFieldNames` | `String` | Lista de campos para indexação ad-hoc. |
| `IndexName` | `String` | Nome do índice ativo. |
| `IsUniDirectional` | `Boolean` | Indica navegação somente para frente. |
| `KeyExclusive` | `Boolean` | Comparações de chave usam strict exclusive. |
| `KeyFieldCount` | `Integer` | Quantidade de campos-chave da pesquisa. |
| `LocalIndexName` | `String` | Nome do índice em memória ativo. |
| `LocalSQL` | `Variant` | Engine de LocalSQL anexo. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `MacroCount` | `Integer` | Quantidade de macros declaradas. |
| `Macros` | `Variant` | Coleção de macros SQL (TFDMacros). Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `MasterFields` | `String` | Campos chave do DataSet master. |
| `MasterLink` | `Variant` | Link master-detail. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `MasterSource` | `Variant` | DataSource pai em relacionamento master-detail. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `Modified` | `Boolean` | Indica registro modificado pendente de Post. |
| `Name` | `String` | Nome do componente no projeto. |
| `ObjectView` | `Boolean` | Acessa campos como objetos hierárquicos (ADT/Array). |
| `Observers` | `Variant` | Lista de observadores VCL. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `OptionsIntf` | `Variant` | Interface de opções estendidas. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `Owner` | `TComponent` | Componente responsável por liberá-lo. |
| `ParamCount` | `Integer` | Quantidade de parâmetros declarados. |
| `Params` | `Variant` | Coleção de parâmetros (TFDParams). Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `ParentDataSet` | [`TFDDataSet`](#tfddataset) | DataSet pai em datasets aninhados. |
| `PointedConnection` | `Variant` | Connection efetivamente em uso. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `Prepared` | `Boolean` | Indica se a query está preparada no servidor. |
| `ReadOnly` | `Boolean` | Indica se o conjunto de dados é somente leitura. |
| `RecNo` | `Integer` | Número do registro atual. |
| `RecordCount` | `Integer` | Quantidade total de registros no DataSet. |
| `RecordSize` | `Integer` | Tamanho em bytes do registro. |
| `ResourceOptions` | `Variant` | Opções de uso de recursos. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `RowError` | `Variant` | Erro associado à linha atual. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `RowsAffected` | `Integer` | Indica a quantidade de registros afetados pela última execução. |
| `SavePoint` | `Long` | Marcação para rollback parcial. |
| `SchemaAdapter` | `Variant` | Schema adapter compartilhado. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `SecurityOptions` | `Variant` | Opções de segurança/credenciais. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `ServerEditRequest` | `Variant` | Requisição de edição no servidor. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `SourceEOF` | `Boolean` | Indica fim de leitura na fonte. |
| `SourceView` | `Variant` | View origem. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `SparseArrays` | `Boolean` | Usa arrays esparsos para campos array. |
| `SQL` | `TStrings` | Lista de strings com a instrução SQL. |
| `State` | `Variant` | Estado atual do DataSet (dsBrowse, dsEdit, ...). Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `StoredFieldKinds` | `Variant` | Tipos de campos armazenados. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `Table` | `Variant` | Storage interno em forma de tabela. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `Tag` | `Integer` | Inteiro de uso livre associado ao componente. |
| `Text` | `String` | Conteúdo SQL como string única. |
| `Transaction` | `Variant` | Transação leitora associada. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `UpdateObject` | `Variant` | Componente de update customizado. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `UpdateOptions` | `Variant` | Opções de aplicação de updates. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `UpdatesPending` | `Boolean` | Indica se há updates pendentes. |
| `UpdateTransaction` | `Variant` | Transação de escrita usada em ApplyUpdates. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `VCLComObject` | `Pointer` | Acesso à instância COM/VCL associada ao componente. |

**Métodos:**

| Nome | Retorno | Parâmetros | Descrição |
|---|---|---|---|
| `Close` | `Void` | `()` | Fecha o cursor de resultados e libera recursos da query. |
| `ExecSQL` | `Integer` | `(pDescricao As String = "", pTituloJanela As String = "", pNomeJanela As String = "")` | Executa uma instrução DML/DDL no banco e retorna a quantidade de registros afetados. |
| `Field` | [`TField`](#tfield) | `(pFieldName As String)` | Retorna o objeto TField para leitura/escrita da coluna indicada. |
| `First` | `Void` | `()` | Move o cursor para o primeiro registro do conjunto de dados. |
| `IsEmpty` | `Boolean` | `()` | Retorna True caso não existam registros no conjunto de dados. |
| `Last` | `Void` | `()` | Move o cursor para o último registro do conjunto de dados. |
| `New` | [`Command`](#command) | `()` | Construtor padrão sem parâmetros. |
| `Next` | `Void` | `()` | Move o cursor para o próximo registro do conjunto de dados. |
| `Open` | `Void` | `(pDescricao As String = "", pTituloJanela As String = "", pNomeJanela As String = "")` | Abre a query e popula o cursor de resultados. Parâmetros opcionais controlam o feedback ao usuário em janelas longas. |
| `Param` | [`TFDParam`](#tfdparam) | `(pParamName As String)` | Retorna o objeto TFDParam para definição do valor de um parâmetro em runtime. |
| `Prior` | `Void` | `()` | Move o cursor para o registro anterior do conjunto de dados. |
| `RowsAffected` | `Integer` | `()` | Retorna a quantidade de registros afetados pela última execução (variante função do property). |
| `SaveToFile` | `Void` | `(pFileName As String, pSalvarEmXML As Boolean = True)` | Salva os registros do conjunto de dados em um arquivo (padrão XML; aceita binário Data7). |
| `TCommandSQL_GetEOF` | `Boolean` | `()` | Acessor interno usado pelo runtime para resolver a propriedade Eof. |

**Eventos:**

| Nome | Delegate | Assinatura | Descrição |
|---|---|---|---|
| `OnCalcFields` | [`TDataSetNotifyEvent`](#tdatasetnotifyevent) | `(...)` | Disparado para calcular campos calculados. |
| `OnCommandChanged` | `TNotifyEvent` | `(Sender As TObject)` | Disparado quando o texto SQL muda. |
| `OnDeleteError` | `TMethod` | `(Sender As TObject)` | Disparado quando Delete falha. |
| `OnEditError` | `TMethod` | `(Sender As TObject)` | Disparado quando Edit/Post falha. |
| `OnError` | [`TFDErrorEvent`](#tfderrorevent) | `(...)` | Tratamento centralizado de erros. |
| `OnExecuteError` | `TMethod` | `(Sender As TObject)` | Tratamento de erros de execução. |
| `OnFilterRecord` | [`TFilterRecordEvent`](#tfilterrecordevent) | `(...)` | Callback de filtro programático por registro. |
| `OnMasterSetValues` | [`TFDDataSetEvent`](#tfddatasetevent) | `(...)` | Disparado ao propagar valores do master. |
| `OnNewRecord` | [`TDataSetNotifyEvent`](#tdatasetnotifyevent) | `(...)` | Disparado ao criar um novo registro. |
| `OnPostError` | `TMethod` | `(Sender As TObject)` | Disparado quando Post falha. |
| `OnReconcileError` | `TMethod` | `(Sender As TObject)` | Disparado para reconciliar erros após ApplyUpdates. |
| `OnUpdateError` | `TMethod` | `(Sender As TObject)` | Disparado quando ApplyUpdates encontra erro. |
| `OnUpdateRecord` | `TMethod` | `(Sender As TObject)` | Customização da atualização de registros. |

#### `Connection`

**Herda de:** `TObject`

**Cadeia completa:** `TObject` → `System.Classes.TObject`

Classe global que representa a conexão atual com o banco de dados.

**Métodos:**

| Nome | Retorno | Parâmetros | Descrição |
|---|---|---|---|
| `Commit` | `Void` | `(pDescricao As String = "")` | Confirma a transação ativa e persiste todas as alterações realizadas desde StartTransaction. |
| `DefaultSchema` | `String` | `()` | Retorna o schema padrão usado para resolver nomes de objetos no banco. |
| `InTransaction` | `Boolean` | `()` | Retorna True quando há uma transação ativa nesta conexão. |
| `RDBMS` | `String` | `()` | Retorna o tipo de RDBMS ativo no ERP (ex: ASA, MSSQL, POSTGRESQL). |
| `Rollback` | `Void` | `()` | Descarta todas as alterações da transação ativa e a finaliza. |
| `StartTransaction` | `Void` | `(pDescricao As String = "")` | Inicia uma transação na conexão atual. Permite informar uma descrição opcional registrada nos logs. |

#### `TFDParam`

**Herda de:** `TObject`

**Cadeia completa:** `TObject` → `System.Classes.TObject`

Representa um parâmetro em uma consulta SQL.

**Propriedades:**

| Nome | Tipo | Descrição |
|---|---|---|
| `AsBoolean` | `Boolean` | Obtém ou define o valor do parâmetro como Boolean. |
| `AsDateTime` | `TDateTime` | Obtém ou define o valor do parâmetro como TDateTime. |
| `AsFloat` | `Double` | Obtém ou define o valor do parâmetro como Double/Float. |
| `AsInteger` | `Integer` | Obtém ou define o valor do parâmetro como Integer. |
| `AsString` | `String` | Obtém ou define o valor do parâmetro como String. |

#### `TField`

Representa um campo retornado de uma consulta de banco de dados.

**Propriedades:**

| Nome | Tipo | Descrição |
|---|---|---|
| `AsBoolean` | `Boolean` | Valor do campo convertido em Boolean. |
| `AsDate` | `TDateTime` | Valor do campo convertido em TDateTime (somente data). |
| `AsDateTime` | `TDateTime` | Valor do campo convertido em TDateTime (data e hora). |
| `AsFloat` | `Double` | Valor do campo convertido em Double/Float. |
| `AsInteger` | `Integer` | Valor do campo convertido em Integer. |
| `AsString` | `String` | Valor do campo convertido em String. |

## 6. Aliases / classes intermediárias (sem membros próprios)

> Classes da cadeia de herança real (Delphi/VCL/DevExpress/TMS/Data7) que existem para que tipos como `Dim x As TBotao` sejam reconhecidos. Todos os seus membros são herdados.

| Tipo | Herda de | Descrição |
|---|---|---|
| `TDataSetNotifyEvent` | `-` | Delegate de evento `(DataSet As TDataSet)` usado por Before*/After*. |
| `TFDAfterApplyUpdatesEvent` | `-` | Delegate `(DataSet As TFDDataSet, AErrors As Integer)` disparado após ApplyUpdates. |
| `TFDDataSet` | `TObject` | Ancestral comum dos DataSets FireDAC. Aqui presente como tipo nomeado (membros expostos em SQL.Command). |
| `TFDDataSetEvent` | `-` | Delegate de evento FireDAC `(DataSet As TFDDataSet, AEventKind As TFDEventKind)` usado por Before/AfterExecute, BeforeGetRecords, etc. |
| `TFDErrorEvent` | `-` | Delegate `(ASender As TObject, AInitiator As IFDStanObject, ByRef AException As Exception)` para o evento OnError. |
| `TFDStoredActivationUsage` | `-` | Conjunto de flags que controla a persistência do estado Active. |
| `TFDUpdateRecordTypes` | `-` | Conjunto de tipos de registro filtrados pelo cache de updates (urInserted/urModified/urDeleted/urUnmodified). |
| `TFilterOptions` | `-` | Conjunto de opções do filtro local (case-insensitive, no-partial-compare, …). |
| `TFilterRecordEvent` | `-` | Delegate de evento `(DataSet As TDataSet, ByRef Accept As Boolean)` usado por OnFilterRecord. |
| `TRDBMS` | `-` | Identificador do RDBMS conectado (ASA, MSSQL, POSTGRESQL, ORACLE, MySQL, FB, SQLITE…). |

---

_14 classes/tipos, 0 delegates, 0 funções, ~183 membros próprios em classes, 0 constantes associadas a tipos enumerados._

_Snapshot `2616b20d9001` — gerado em 2026-05-27T21:04:59.243Z pela extensão Data7 Dev Studio._
