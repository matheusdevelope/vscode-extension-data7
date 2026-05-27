# Namespace `Data7`

> Documentação gerada automaticamente pela extensão **Data7 Dev Studio**.
> Reflete o estado atual da System Library reconhecida pelo linter / IntelliSense.

## 1. Visão geral

Namespace global contendo utilitários fornecidos pelo ERP Data7.

**Como importar:**

```basic
Imports Data7
```

## 2. Árvore de herança das classes

```
Form  (Forms)
└─ Report
```

## 3. Classes (com membros próprios)

> Cada classe lista apenas seus membros **próprios**. Membros herdados podem ser consultados nas classes ancestrais via os links da cadeia de herança no topo de cada seção.

#### `Report`

**Herda de:** `Form`

**Cadeia completa:** `Form` → `TForm` → `TScrollingWinControl` → `TWinControl` → `TControl` → `TComponent` → `TPersistent` → `TObject` → `System.Classes.TObject`

Relatório padrão do Data7 (TfrmFormulario derivado). Permite exibir/imprimir/exportar relatórios cadastrados, com suporte a parâmetros nomeados via AddParam.

**Propriedades:**

| Nome | Tipo | Descrição |
|---|---|---|
| `Action` | `Variant` | Ação VCL associada herdada de TControl. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `Caption` | `Variant` | Caption (legenda) herdado de TForm — use `Title`/`Titulo`. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `CodRelatorio` | `Integer` | Código do cadastro de relatório no ERP. |
| `Color` | `Variant` | Cor de fundo herdada de TControl — não aplicável ao relatório. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `ConfirmacaoImpressaoStringGrid` | `Variant` | Grid de confirmação de impressão exposto pelo cadastro. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `Constraints` | `Variant` | Restrições de tamanho herdadas de TControl. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `CustomHint` | `Variant` | Hint personalizado herdado de TControl. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `CustomTitleBar` | `Variant` | Barra de título customizada herdada de TCustomForm. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `GlassFrame` | `Variant` | Glass frame Aero herdado de TCustomForm. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `HorzScrollBar` | `Variant` | Barra de rolagem horizontal herdada de TScrollingWinControl. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `Icon` | `Variant` | Ícone do formulário herdado de TCustomForm. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `ID` | `Long` | Identificador interno do relatório (sobrescreve o `ID` herdado, ampliado para Int64). |
| `ItemNotaFiscal` | `String` | Texto do item para impressão de nota fiscal modelo 1. |
| `ItemNotaFiscalEletronica` | `String` | Texto do item para impressão de NF-e. |
| `ItemNotaFiscalEletronicaContingencia` | `String` | Texto do item para impressão de NF-e em contingência. |
| `Menu` | `Variant` | Menu principal herdado de TCustomForm. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `ObjectMenuItem` | `Variant` | Item de menu OLE herdado de TCustomForm. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `Observers` | `Variant` | Lista de observadores VCL herdada de TComponent. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `Padding` | `Variant` | Padding interno herdado de TWinControl. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `PopupMenu` | `Variant` | Menu popup herdado de TControl. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `Title` | `String` | Título exibido na barra do relatório. |
| `Titulo` | `String` | Alias português de `Title`. |
| `Touch` | `Variant` | Touch manager herdado de TControl. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `VertScrollBar` | `Variant` | Barra de rolagem vertical herdada de TScrollingWinControl. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `WindowMenu` | `Variant` | Menu MDI herdado de TForm. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |

**Métodos:**

| Nome | Retorno | Parâmetros | Descrição |
|---|---|---|---|
| `_GetParent` | `TWinControl` | `()` | Acessor interno (getter) da propriedade Parent. |
| `_SetParent` | `Void` | `(Value As TWinControl)` | Acessor interno (setter) da propriedade Parent. |
| `AddParam` | `Void` | `(pName As String, pValue As Variant)` | Adiciona/atualiza um parâmetro nomeado utilizado pela query do relatório. |
| `ExportToPdf` | `Void` | `(pLayoutIndex As Integer, pFilePath As String)` | Exporta o relatório para um arquivo PDF no caminho informado, usando o layout indicado. |
| `New` | [`Report`](#report) | `(AOwner As TComponent)` | Construtor padrão do relatório recebendo o Owner. |
| `Print` | `Void` | `()` | Imprime o relatório diretamente, sem exibir a tela de confirmação. |
| `Show` | `Boolean` | `()` | Abre a janela de relatório com confirmação do usuário. Retorna True se o usuário confirmou a impressão. |

**Eventos:**

| Nome | Delegate | Assinatura | Descrição |
|---|---|---|---|
| `OnGesture` | `Variant` | `(...)` | Evento de gestos herdado de TControl. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |
| `OnShowFormEnvioWhatsappEvent` | `Variant` | `(...)` | Evento de exibição do envio por WhatsApp. Não traduzido pelo compilador Data7 — uso emite diagnóstico unsupported-member. |

## 7. Funções e procedimentos do namespace

| Nome | Retorno | Parâmetros | Descrição |
|---|---|---|---|
| `CodPeriodoCaixa` | `Integer` | `()` | Retorna o código do período caixa atual. |
| `Criptografar` | `String` | `(pText As String)` | Criptografa uma string usando a chave criptográfica padrão do ERP. |
| `Descriptografar` | `String` | `(pText As String)` | Descriptografa uma string usando a chave criptográfica padrão do ERP. |
| `Parametro` | `String` | `(pNomeParametro As String)` | Retorna o valor fixo do parâmetro informado. |
| `PesquisaPadrao` | `Integer` | `(pNomeTabela As String, pNomeCampo As String, pNomeSchema As String = "")` | Busca a pesquisa padrão vinculada ao campo da tabela informada. |
| `ProximoCodigo` | `Integer` | `(pNomeSequenciador As String)` | Retorna o próximo código do sequenciador informado. |
| `ProximoID` | `String` | `()` | Retorna o próximo ID geral. Sequenciador: Geral.GeralID |
| `ValorPorExtenso` | `String` | `(pValue As Double)` | Irá transformar um número em seu valor por extenso. |
| `ValorPorExtensoLinha1` | `String` | `(pValue As Double, pStart As Integer, pEnd As Integer)` | Irá transformar um número em seu valor por extenso com possibilidade de informar o início e fim do caracter. |
| `ValorPorExtensoLinha2` | `String` | `(pValue As Double, pStart As Integer, pEnd As Integer)` | Irá transformar um número em seu valor por extenso com possibilidade de informar o início e fim do caracter. |

---

_1 classes/tipos, 0 delegates, 10 funções, ~34 membros próprios em classes, 0 constantes associadas a tipos enumerados._

_Snapshot `2616b20d9001` — gerado em 2026-05-27T17:44:11.154Z pela extensão Data7 Dev Studio._
