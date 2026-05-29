# 14 — Construindo telas (Forms)

> Como montar uma tela (formulário) em Data7 Basic. Este capítulo extrai o **idioma real de produção** observado no framework do projeto de referência [`mod_card_grouper`](./mod_card_grouper) (módulos `mod_form`, `mod_topbar`, `mod_labeled_container`) e o apresenta de forma autocontida.
>
> Pré-requisitos: [05-classes.md](./05-classes.md) (classes, herança, `MyBase`), [06-delegates.md](./06-delegates.md) (eventos e o padrão `extra As Variant`), [09-system-library.md](./09-system-library.md) (namespace `Forms`).

## Visão geral do modelo

O Data7 herda o modelo visual do Delphi/VCL: uma tela é uma árvore de **controles** enraizada em um `Forms.Form`. Cada controle:

- É criado com `New Forms.<Controle>(<pai>)` — o **pai** (parent) é passado no construtor.
- Posiciona-se por **ancoragem** (`Align = alClient | alTop | alBottom | alLeft | alRight | alNone`) ou por coordenadas (`Top`, `Left`, `Width`, `Height`).
- Expõe **eventos** como propriedades atribuíveis (`OnClick`, `OnShow`, `OnChange`, …) que recebem uma referência de método.

Não há designer visual nem arquivo `.dfm` no fluxo Data7 Basic: **a tela é construída por código**, tipicamente no construtor de uma classe que encapsula o `Form`.

## Esqueleto canônico

A forma idiomática é uma classe que **possui** um `Form` privado e o monta em um método `_build`, chamado pelo construtor:

```basic
Imports Forms

Namespace mod_minha_tela

   Class TMinhaTela

      Private _form As Forms.Form
      Private _content As Forms.PageControl

      Sub New(pTitle As String = "Minha Tela")
         me._build(pTitle)
      End Sub

      Private Sub _build(pTitle As String)
         me._form = New Forms.Form()
         me._form.Caption = pTitle

         me._content = New Forms.PageControl(me._form)
         me._content.Align = alClient
      End Sub

      Function Show() As Boolean
         me._form.Show()
         Show = True
      End Function

      Sub Free()
         me._form.Free()
         MyBase.Free()
      End Sub

   End Class

End Namespace
```

**Pontos do idioma**:

- O `Form` é **privado** (`Private _form As Forms.Form`). A classe expõe operações (`Show`, `Close`), não o `Form` cru — encapsulamento.
- A montagem fica em `_build`, separada do `New`, para manter o construtor legível.
- `Free()` libera o `Form` e chama `MyBase.Free()` por último (ver [12-convencoes-idiomaticas.md § 5](./12-convencoes-idiomaticas.md)).

## Layout por ancoragem (`Align`)

A ancoragem é a forma preferida de layout — adapta-se ao redimensionamento sem cálculo manual. As constantes vivem em `Globals/` (sempre visíveis, sem `Imports`):

| Constante  | Efeito                                                       |
| ---------- | ------------------------------------------------------------ |
| `alClient` | Ocupa todo o espaço restante do pai.                         |
| `alTop`    | Cola no topo; ocupa toda a largura; altura fixa (`Height`).  |
| `alBottom` | Cola na base; ocupa toda a largura; altura fixa.             |
| `alLeft`   | Cola à esquerda; ocupa toda a altura; largura fixa (`Width`).|
| `alRight`  | Cola à direita; ocupa toda a altura; largura fixa.           |
| `alNone`   | Posição livre via `Top`/`Left`/`Width`/`Height`.             |

Padrão "header / conteúdo / footer" (extraído de `mod_form.TFormBase._build`):

```basic
me._header = New Forms.PageControl(me._form)
me._header.Align = alTop
me._header.Height = 40

me._footer = New Forms.PageControl(me._form)
me._footer.Align = alBottom
me._footer.Height = 32

' O conteúdo entra POR ÚLTIMO com alClient para preencher o miolo
me._content = New Forms.PageControl(me._form)
me._content.Align = alClient
```

> **Ordem importa**: controles `alTop`/`alBottom` consomem espaço na ordem de criação. Crie o `alClient` por último para ele preencher o que sobrou.

## Hierarquia de pais

O **pai** define onde o controle é desenhado e quem o libera. Passe sempre o container correto no construtor:

```basic
' painel dentro do conteúdo
Dim painel As Forms.Panel = New Forms.Panel(me._content)
painel.Align = alTop
painel.Height = 80

' rótulo + botão dentro do painel
Dim titulo As Forms.StaticText = New Forms.StaticText(painel)
titulo.Caption = "Cadastro"
titulo.Align = alTop

Dim botao As Forms.CommandButton = New Forms.CommandButton(painel)
botao.Align = alBottom
botao.Height = 28
```

## Eventos

Há dois lados: **consumir** o evento de um controle nativo e **expor** um evento próprio da sua classe.

### Consumir evento de um controle

Atribua uma referência de método (sem `()`) à propriedade do evento. O handler tem a assinatura do delegate do evento (ver [06-delegates.md](./06-delegates.md)).

```basic
Private Sub _build(pTitle As String)
   me._form = New Forms.Form()
   me._form.Caption = pTitle

   Dim salvar As Forms.CommandButton = New Forms.CommandButton(me._form)
   salvar.Align = alBottom
   salvar.OnClick = me._handleSalvar      ' referência de método, sem ()
End Sub

Private Sub _handleSalvar(pSender As TObject)
   ' lógica do clique
End Sub
```

`OnClick` espera um `TNotifyEvent` — assinatura `Sub (Sender As TObject)`. Aridade incompatível dispara o diagnóstico [`event-signature-mismatch`](./13-diagnostic-codes.md#event-signature-mismatch).

### Expor evento próprio

Declare um campo do tipo do delegate e dispare com a guarda `<> NULL` (extraído de `mod_form`):

```basic
Class TMinhaTela

   OnSalvarEvent As TNotifyEvent      ' evento público

   Private Sub _handleSalvar(pSender As TObject)
      ' dispara o evento da classe, se alguém assinou
      If me.OnSalvarEvent <> NULL Then me.OnSalvarEvent(me)
   End Sub

End Class
```

E o consumidor assina:

```basic
Dim tela As New TMinhaTela("Cadastro")
tela.OnSalvarEvent = handlerDoChamador
tela.Show()
```

> **Sem captura de closure**: o handler não captura variáveis do escopo. Para passar contexto, use o padrão `extra As Variant` dos delegates ([06-delegates.md](./06-delegates.md)) ou guarde estado em campos da classe.

## Ciclo de vida

```basic
Dim tela As New TMinhaTela("Processar retorno")
tela.Show()      ' exibe a janela (modal ou não, conforme o Form)
tela.Free()      ' libera recursos
```

O par `Show()` / `Free()` é obrigatório. Para código defensivo (a janela pode levantar exceção), use `Try/Finally`:

```basic
Dim tela As New TMinhaTela("Cadastro")
Try
   tela.Show()
Finally
   tela.Free()
End Try
```

Ou o açúcar `Using` (ver [10-acucares-atuais.md](./10-acucares-atuais.md)):

```basic
Using tela As New TMinhaTela("Cadastro")
   tela.Show()
End Using
```

## Controles mais usados

| Controle               | Para quê                                                       | Consulte                                         |
| ---------------------- | -------------------------------------------------------------- | ------------------------------------------------ |
| `Forms.Form`           | Janela raiz.                                                   | `data7://system-library/Forms` ou `describe_symbol Forms.Form` |
| `Forms.PageControl`    | Container/aba — base do layout header/content/footer.          | `describe_symbol Forms.PageControl`              |
| `Forms.Panel`          | Painel agrupador simples.                                     | `describe_symbol Forms.Panel`                    |
| `Forms.CustomControl`  | Container genérico leve.                                       | `describe_symbol Forms.CustomControl`            |
| `Forms.StaticText`     | Rótulo (label).                                               | `describe_symbol Forms.StaticText`               |
| `Forms.TextBox`        | Caixa de texto de linha única.                                 | `describe_symbol Forms.TextBox`                  |
| `Forms.CommandButton`  | Botão de comando.                                             | `describe_symbol Forms.CommandButton`            |
| `Forms.Grid`           | Grade de dados (a maior API — ~200 membros).                   | `describe_symbol Forms.Grid`                     |
| `Forms.Line`           | Linha divisória (com `Pen.Color` via `RGB(...)`).              | `describe_symbol Forms.Line`                     |
| `Forms.MessageBox`     | Diálogos (`Confirmation`, `Information`, …).                    | `describe_symbol Forms.MessageBox`               |

> A lista completa de ~150 controles está em `data7://system-library/Forms`. Para um controle específico, prefira a tool `data7_describe_symbol` (devolve só os membros daquele controle, ~1 k tokens) em vez de carregar o namespace inteiro (~71 k tokens).

## Controles ricos: padrões essenciais

### `Grid` — colunas e células

O `Grid` é endereçado por `(coluna, linha)` via a propriedade indexada `Cells`. A primeira linha costuma ser cabeçalho (`FixedRows = 1`):

```basic
me._grid = New Forms.Grid(me._content)
me._grid.Align = alClient
me._grid.FixedRows = 1
me._grid.ColCount = 3
me._grid.RowCount = 3          ' 1 cabeçalho + 2 dados

me._grid.Cells(0, 0) = "Código"   ' cabeçalho
me._grid.Cells(1, 0) = "Nome"
me._grid.Cells(0, 1) = "1"        ' primeira linha de dados
me._grid.Cells(1, 1) = "Se7e Sistemas"
```

`Cells(c, r)` lê **e** escreve (`Dim nome As String = me._grid.Cells(1, 1)`). `Clear()` esvazia o grid. A API completa (`ColWidth`, `SetColAlignment`, eventos de edição, etc.) tem ~200 membros — consulte `data7_describe_symbol Forms.Grid`.

### `TextBox` / `NumberTextBox` — valor e mudança

Editores expõem `.Text` (String) e o evento `OnChange` (`TNotifyEvent`), herdados da cadeia `TcxCustomEdit`:

```basic
me._nome = New Forms.TextBox(me._content)
me._nome.Align = alTop
me._nome.OnChange = me._handleChange

Private Sub _handleChange(pSender As TObject)
   If me._nome.Text <> "" Then
      ' valor válido
   End If
End Sub
```

`NumberTextBox` (entrada numérica com calculadora) compartilha a mesma cadeia — `.Text` e `OnChange` funcionam igual.

### `PageControl` + `TabSheet` — abas

Cada aba é uma `TabSheet` criada com o `PageControl` como pai; o conteúdo da aba usa a própria `TabSheet` como pai:

```basic
me._abas = New Forms.PageControl(me._form)
me._abas.Align = alClient

me._abaDados = New Forms.TabSheet(me._abas)
me._abaDados.Caption = "Dados"

' controles da aba "Dados" são filhos de me._abaDados
Dim titulo As Forms.StaticText = New Forms.StaticText(me._abaDados)
titulo.Caption = "Informações do cliente"
titulo.Align = alTop
```

## Membros `unsupported` em controles

Muitos controles herdam propriedades VCL que o compilador Data7 **não traduz** (`Constraints`, `Padding`, `Anchors` em certos controles, etc.). Usá-las dispara [`unsupported-member`](./13-diagnostic-codes.md#unsupported-member). Antes de setar uma propriedade herdada incomum, confirme com `data7_describe_symbol` se ela não está marcada como não suportada.

## Exemplos canônicos

Veja exemplos completos e versionados em [`docs/exemple/forms/`](../exemple/README.md):

| Exemplo | Cobre |
|---|---|
| `forms/01-formulario-minimo` | Form + um conteúdo `alClient`. |
| `forms/02-layout-header-content-footer` | O padrão de 3 regiões com `Line` divisória. |
| `forms/03-form-com-eventos` | Botão com `OnClick` + evento próprio `OnSalvarEvent`. |
| `forms/04-grid-basico` | Colocação de um `Grid` no conteúdo. |
| `forms/05-grid-com-dados` | Grid com cabeçalho fixo + preenchimento via `Cells(col, row)`, `ColCount`/`RowCount`/`FixedRows`. |
| `forms/06-textbox-validacao` | `TextBox` + `NumberTextBox` com `OnChange` lendo `.Text` para validar. |
| `forms/07-abas-pagecontrol` | `PageControl` + `TabSheet` (abas com `Caption`, conteúdo por aba). |

## Cross-references

- [05-classes.md](./05-classes.md) — herança, `MyBase`, propriedades.
- [06-delegates.md](./06-delegates.md) — `TNotifyEvent`, padrão `extra As Variant`.
- [09-system-library.md](./09-system-library.md) — namespace `Forms` e globais (`alClient`, `RGB`).
- [12-convencoes-idiomaticas.md](./12-convencoes-idiomaticas.md) — `Free()` herdado, `Try/Finally` para recursos.
- [`mod_card_grouper/data7_modules/mod_form.bas`](./mod_card_grouper) — o framework real de onde este idioma foi extraído.
