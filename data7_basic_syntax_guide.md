# Guia de Sintaxe Completa — Data7 Basic (Revisado)

Este guia documenta de forma precisa as regras nativas, limitações e particularidades do dialeto **Data7 Basic**, atualizado com as especificações de arrays e matrizes fornecidas.

---

## 1. Organização de Arquivos, Escopos e Namespaces

### Namespaces e Imports

- **Declaração de Namespaces:** Todo código de um arquivo `.bas` costuma residir dentro de um `Namespace <Nome> ... End Namespace` (ou `end NameSpace`).
- **Importações:** A diretiva `Imports` é declarada antes do namespace. O compilador aceita tanto a importação de um único namespace por linha quanto a importação de múltiplos namespaces separados por vírgula em uma única diretiva:

```basic
' Importação unitária
Imports Collections
' Importações múltiplas em uma única linha
Imports Forms, mod_winapi
```

- **Principal.bas:** A unidade principal (`Principal.bas`) é injetada no escopo global da aplicação. Todos os tipos e membros ali contidos são visíveis de qualquer arquivo do projeto sem requerer `Imports`.

### Resolução de Identificadores

A precedência de escopos no compilador segue a ordem do mais específico ao mais geral:

1.  Contexto Local do Método/Função (variáveis e parâmetros locais).
2.  Membros da Classe Atual (e classe externa, em caso de classes aninhadas).
3.  Classe Base (`MyBase`).
4.  Membros do Namespace Atual.
5.  Namespaces importados no cabeçalho via `Imports`.
6.  Escopo Global (`Principal.bas` e classes globais da System Library como `THTTP`, `TJSONObject`).

---

## 2. Declaração de Variáveis, Constantes e Tipos de Dados

### Variáveis e Modificadores

- **Modificadores:** Declarações de variáveis com `Dim` e constantes com `Const` aceitam modificadores de acesso como `Public` e `Private`.
- **Declarações Múltiplas:** É permitido declarar e inicializar múltiplas variáveis na mesma linha separadas por vírgula:
  ```basic
  Public Dim result As String, i As Integer, _count As Integer = 10
  ```

### Inicialização de `Dim` no Escopo de Namespace (Pegadinha do Compilador)

- **Variáveis `Dim` no Namespace:** Se uma variável do tipo `Dim` for declarada diretamente sob o escopo de um namespace e receber um valor de inicialização direta (ex: `Dim AlwaysPrint As Boolean = False`), **ela não terá esse valor em tempo de execução**, pois é sempre inicializada vazia/default. O valor deve ser atribuído explicitamente durante a execução do código (ex: em uma subrotina de inicialização).
- **Constantes `Const`:** Com `Const`, esse comportamento não ocorre. O valor é atribuído durante o build e a constante está sempre pronta para uso.

### Passagem de Parâmetros

O modo padrão de passagem de parâmetros quando omitido depende do tipo de dados:

- **Tipos Primitivos e Variant:** Por padrão, são passados por valor (**`ByVal`**).
- **Tipos Complexos (Objetos):** Por padrão, são passados por referência (**`ByRef`**). Só se tornam `ByVal` se forem declarados explicitamente com o modificador `ByVal`.

```basic
Private Function Calcular(ByVal argName As String, ByRef lpRect As TRect) As Long
```

### Tipos Especiais: `TDateTime` vs `Exception`

- **`TDateTime`:** Funciona praticamente como um tipo primitivo (sendo uma extensão direta do tipo `Double`) e não herda de `TObject`.
- **`Exception`:** É um objeto real, uma classe global que herda de `TObject`.

### Verificação e Liberação de Valores

- **Tipos Complexos (Classes, Objetos):**
  - Verificação: Utiliza-se a palavra-chave `NULL` ou a função global `Assigned(meuObjeto)`.
  - Liberação: É obrigatório chamar o método `.Free()` para destruir o objeto. É boa prática zerar a variável atribuindo `NULL`.
- **Tipos Primitivos e Variants:**
  - Verificação: Utiliza-se a função global `IsEmpty(meuValor)`.
  - Liberação/Zerar: Atribui-se o valor `Unassigned` à variável.

---

## 3. Classes, Herança e Polimorfismo

### Classes e Construtores

- Classes são declaradas com `Class ... End Class`.
- O construtor é a subrotina `Sub New`. Chamadas para a classe pai usam `MyBase.New()`.
- O compilador suporta **classes aninhadas** (classes declaradas dentro de outras classes).

### Destrutores

- O destrutor das classes é sempre o método **`Free`**.
- _Nota:_ O método `Dispose` não é uma funcionalidade nativa do compilador, mas sim uma convenção de desenvolvedores. Caso seja implementado, ele deve ser invocado explicitamente dentro do próprio método `Free` antes de chamar `MyBase.Free()`.

```basic
Sub Free()
    ' Código de descarte específico da classe
    me.Dispose()
    MyBase.Free()
End Sub
```

### Modificador `ReadOnly`

- A linguagem suporta o modificador **`ReadOnly`** para campos de classe que podem ser apenas lidos e não modificados após a inicialização, e para propriedades que declarem apenas a cláusula `Get`.

```basic
Class MinhaClass
   ReadOnly MeuValor As Double
   Private _meuValorInteger
   Public MeuValorSetavel
   Property MinhaPropReadOnly As String
      Get
         Return "MeuValor"
      End Get
   End Property
End Class
```

### Propriedades Indexadas com Colchetes `[]`

- Uma propriedade indexada pode receber múltiplos parâmetros.
- **Sintaxe de Colchetes `[]`:** Se **todos** os parâmetros da definição da propriedade forem do tipo `Integer`, o acesso aos elementos pode ser feito utilizando colchetes `[]`:
  ```basic
  Property Item(pX As Integer, pY As Integer) As String
  ' Acesso:
  _minhaClass.Item[0, 34] = "NovoValor"
  ```
- **Sintaxe de Parênteses `()`:** Se a propriedade receber parâmetros de outros tipos (como `String`), o acesso deve obrigatoriamente usar parênteses `()`.
- Se a propriedade não receber parâmetros, o acesso é feito sem parênteses e sem colchetes.

### Modificadores de Métodos e Sobrescritas

- **`Shared`**: Define membros de classe estáticos.
- **`Shadows`**: Redefine um membro herdado ocultando a declaração da classe base, sem polimorfismo dinâmico.
- **`MustOverride Overridable`**: Define um método abstrato que deve obrigatoriamente ser sobrescrito pelas classes filhas.
- **`Overrides`**: Sobrescreve um método virtual/abstrato da classe pai.
- **`Overridable Overrides`**: Sobrescreve o método pai mantendo-o virtual para futuras subclasses.

---

## 4. Estruturas de Controle de Fluxo

### Condicionais

- O uso de `Then` em blocos condicionais multilinhas é **opcional**.
- Ele é **obrigatório** apenas em estruturas de linha única (inline).

### Loops e Select

- Loops suportados: `For ... Next`, `While ... End While`, e `Do While ... Loop`.
- **Select:** O compilador aceita o bloco condicional de escolha múltipla escrito de duas formas equivalentes:
  1.  Usando `Select Case`: `Select Case minhaExpressao ... End Select`
  2.  Omitindo a palavra `Case` no select: `Select minhaExpressao ... End Select`

### Bloco `With` Aninhado e Escopo

- O bloco `With` permite omissão do nome do objeto.
- Quando aninhados, a resolução de escopo prioriza o objeto do `With` interno, caindo para o `With` externo se o membro não for encontrado.

```basic
With New shape()
   .acrossLine = 1
   With New circle()
      ' .acrossLine refere-se ao circle (With interno)
      .acrossLine = 2
   End With
   ' .acrossLine refere-se ao shape novamente (With externo)
End With
```

---

## 5. Arrays e Matrizes (Nativos e Variants)

O compilador do Data7 Basic oferece suporte simplificado a vetores unidimensionais (arrays planos) e multidimensionais (matrizes).

### Arrays e Matrizes Nativos

- **Declaração:** São declarados informando o tamanho máximo de cada dimensão entre parênteses:
  ```basic
  Dim meuArrayDeStrings(10) As String
  Dim minhaMatriz(10, 2) As String
  ```
- **Acesso a Elementos:** O acesso para leitura e gravação em arrays nativos é feito obrigatoriamente usando colchetes `[]`:
  ```basic
  meuArrayDeStrings[0] = "Testes"
  minhaMatriz[0, 1] = "OutroTeste"
  ```
- **Propriedade e Funções de Tamanho:**
  - Propriedade `.Length`: Retorna o número total de elementos no array (ex: `meuArrayDeStrings.Length`).
  - Função `LBound(array)`: Retorna o índice inicial do array (geralmente `0`).

### Limitação de Redimensionamento (`ReDim`)

- O compilador aceita a palavra-chave **`ReDim`** para redimensionar arrays.
- **Limitação Crítica:** O compilador **não suporta** a palavra-chave `Preserve`. Como consequência, qualquer chamada a `ReDim` apaga completamente o conteúdo existente do array. Devido a isso, na prática, **todos os arrays nativos possuem tamanho fixo** definido no momento da declaração inicial.

### Arrays Variants Literais

- É possível declarar um array dinâmico atribuindo um literal delimitado por colchetes a uma variável do tipo `Variant`. Isso inicializa um array estruturado compatível com o ambiente nativo (Delphi):
  ```basic
  Dim _array As Variant = [1, 2, 3]
  ```
- **Acesso e Funções:**
  - O acesso também usa colchetes `[]` (ex: `_array[0]`).
  - Suporta o uso de ambas as funções globais **`LBound(array)`** e **`UBound(array)`** para encontrar os limites da coleção.

---

## 6. Conversão e Coerção de Tipos (Casting)

O compilador aceita duas formas de coerção explícita de tipos:

1.  **Operador `CType`:** `CType(expressao, Tipo)`.
2.  **Sintaxe de Encapsulamento por Tipo:** Chamada direta do tipo como se fosse uma função:
    ```basic
    TRecord(MyBase.Take(i)).MetodoDoRecord()
    ```

---

## 7. Tratamento de Exceções: Bug Conhecido do `Finally`

Existe um bug conhecido no compilador relacionado ao uso do bloco `Finally` opcional junto a uma variável de captura de exceção (`Catch ex As Exception`).

- **O Problema:** Quando o bloco `Finally` é declarado, o compilador faz com que o bloco `Catch` seja executado **sempre**, mesmo que nenhuma exceção tenha sido lançada no bloco `Try`.
- **A Solução/Contorno:** O desenvolvedor deve envolver o conteúdo do bloco `Catch` em uma verificação de atribuição usando a função `Assigned(ex)` ou comparando com `NULL`.

```basic
Try
    ' Código de execução
Catch ex As Exception
    If Assigned(ex) Then
        ' Tratamento de erro real (só roda se ex não for nula)
        console.log("Erro: " & ex._GetMessage())
    End If
Finally
    ' Executado sempre
    objeto.Free()
End Try
```

---

## 8. Caractere de Quebra de Linha

- O caractere oficial para quebra de linha física de código é unicamente o sublinhado **`_`**.
- Ele pode ser posicionado no final de qualquer linha de expressão para continuar a instrução na linha seguinte, seja no meio de concatenações de strings, chamadas encadeadas de métodos, assinaturas de funções ou listas de parâmetros.

```basic
Dim minhaStr As String = "teste " & _
    "resto"

Dim valor As String = MinhaClasse.ObterJson() _
    .GetString("propriedade")
```

---

## 9. Exemplo Completo Consolidado

Abaixo é apresentado o caso real consolidado unificado da sintaxe do **Data7 Basic**, contendo constantes, variáveis de namespace, enums nativos, structures, funções nativas de API externa, delegates, classes abstratas, classes derivadas, classes aninhadas, herança e polimorfismo (`MustOverride`, `Overrides`, `Shadows`, `Shared`), além de arrays planos, matrizes, arrays variants literais, propriedade indexada retornando `String`, casting dinâmico e o contorno para o bug do `Finally`.

```basic
Imports Collections
Imports Forms, mod_winapi
Imports mod_pipeline_record

Namespace ExemploConsolidado

   ' Constantes com modificadores
   Const SW_SHOW = 5
   Private Const MONITOR_DEFAULT = 1

   ' Variáveis do Namespace (inicializadas vazias por padrão, exigem atribuição posterior)
   Dim GlobalCounter As Integer = 0
   Private Dim IsActive As Boolean = False

   ' Enumeração Nativa
   Enum LogLevel
      Info = 0
      Warning = 1
      Errorr = 2 ' Error é palavra reservada
   End Enum

   ' Estrutura de Dados
   Structure TPoint
      x As Long
      y As Long
   End Structure

   ' Estrutura de Geometria contendo estruturas
   Structure TRect
      Left As Long
      Top As Long
      Right As Long
      Bottom As Long
   End Structure

   ' Declaração de Funções e Subrotinas da API do Windows (DLL Imports)
   Private Declare Function _GetForegroundWindow Lib "user32.dll" Alias "GetForegroundWindow" As Long
   Private Declare Function _GetWindowRect Lib "user32.dll" Alias "GetWindowRect" (hwnd As Long, ByRef lpRect As TRect) As Long
   Private Declare Sub _SetCursorPos Lib "user32.dll" Alias "SetCursorPos" (ByVal x As Long, ByVal y As Long)

   ' Declaração de Delegate
   Delegate Function CallbackVerificar(ByVal pX As Integer, ByRef pNum As Integer) As Boolean

   ' Classe Base Abstrata
   Class Shape
      Protected _name As String

      Sub New(ByVal pName As String)
         MyBase.New()
         me._name = pName
      End Sub

      ' Método Abstrato (deve ser sobrescrito)
      MustOverride Overridable Function Area() As Double
      End Function

      Overridable Sub LogInfo()
         console.log("Shape: " & me._name)
      End Sub

      Overridable Sub Free()
         MyBase.Free()
      End Sub
   End Class

   ' Classe Derivada com Classe Aninhada
   Class ContainerShape
      Inherits Shape

      ' Classe Aninhada (Inner Class)
      Public Class GeometryHelper
         Shared Function Multiplicar(ByVal pVal As Double, ByVal pFactor As Double) As Double
            Return pVal * pFactor
         End Function
      End Class

      Private _width As Double
      Private _height As Double
      Private _records As TRecordList

      ' Propriedade Indexada (Gera suporte a colchetes [] porque os parâmetros são inteiros)
      ' Não é permitido retornar Variant em uma property
      Property Grid(x As Integer, y As Integer) AS String
         Get
            Grid = me.ObterValorGrid(x, y)
         End Get
         Set(pValue As Variant)
            me.DefinirValorGrid(x, y, pValue)
         End Set
      End Property

      Sub New(ByVal pName As String, ByVal pW As Double, ByVal pH As Double)
         MyBase.New(pName)
         me._width = pW
         me._height = pH
         me._records = New TRecordList()
      End Sub

      ' Sobrescrita do Método Abstrato
      Overrides Function Area() As Double
         Return ContainerShape.GetArea(me._width, me._height)
      End Function

      Shared Function GetArea(pW As Double, pH As Double) AS Extended
         ' Acesso à classe aninhada e uso de Return
         GetArea = ContainerShape.GeometryHelper.Multiplicar(pW, pH)
      End Function

      ' Sobrescrita de Método Virtual da Classe Base
      Overrides Sub LogInfo()
         ' Chamada base
         MyBase.LogInfo()
         console.log("Area Calculada: " & CStr(me.Area()))
      End Sub

      ' Shadows: Oculta um método herdado
      Shadows Sub Free()
         ' Liberação mandatória do objeto interno
         If Assigned(me._records) Then
            me._records.Free()
            me._records = NULL
         End If
         MyBase.Free()
      End Sub

      Private Function ObterValorGrid(x As Integer, y As Integer) As Variant
         ' Exemplo de retorno via atribuição ao nome do método
         ObterValorGrid = "Valor_" & CStr(x) & "_" & CStr(y)
      End Function

      Private Sub DefinirValorGrid(x As Integer, y As Integer, pValue As Variant)
         ' Atribuição local
      End Sub
   End Class

   ' Subrotina no nível do Namespace (Free Function) demonstrando fluxo e o bug do Finally
   Public Sub TestarExecucao()
      Dim activeHwnd As Long
      Dim windowRect As TRect
      Dim shapeContainer As ContainerShape = NULL

      ' Atribuição em tempo de execução para variável do Namespace
      IsActive = True

      ' Chamada de API nativa (parâmetros por referência)
      activeHwnd = _GetForegroundWindow()
      _GetWindowRect(activeHwnd, windowRect)

      ' Instanciação
      shapeContainer = New ContainerShape("JanelaAtiva", 800, 600)

      ' Uso do Select (Omitindo a palavra Case no select)
      Select activeHwnd
         Case 0
            console.log("Nenhuma janela ativa localizada.")
         Case Else
            console.log("Janela ativa: " & CStr(activeHwnd) & _
                        " | Dimensões: L=" & CStr(windowRect.Left) & _
                        " T=" & CStr(windowRect.Top))
      End Select

      ' Arrays planos e matrizes nativos (tamanho fixo na prática)
      Dim meuArrayDeStrings(10) As String
      meuArrayDeStrings[0] = "Testes"
      console.log("Tamanho do array: " & CStr(meuArrayDeStrings.Length))
      console.log("LBound do array: " & CStr(LBound(meuArrayDeStrings)))
      console.log("Elemento 0: " & meuArrayDeStrings[0])

      Dim minhaMatriz(5, 2) As Integer
      minhaMatriz[0, 1] = 42

      ' Array Variant literal de tamanho fixo
      Dim arrayLiteral As Variant = [1, 2, 3]
      console.log("LBound literal: " & CStr(LBound(arrayLiteral)) & _
                  " | UBound literal: " & CStr(UBound(arrayLiteral)))
      console.log("Literal 0: " & CStr(arrayLiteral[0]))

      ' Exemplo do bug do Finally (Catch com verificação de Assigned)
      Dim erroOcorrido As Exception = NULL
      Try
         ' Casting com encapsulamento por tipo
         Dim areaTotal As Double = Shape(shapeContainer).Area()

         ' Acesso a propriedade indexada via colchetes []
         shapeContainer.Grid[2, 3] = "NovoValor"

         ' With Aninhado e Precedência de Escopo
         With shapeContainer
            .LogInfo()
            With windowRect
               ' .Left refere-se ao windowRect (With interno)
               console.log("Coordenada X da Janela: " & CStr(.Left))
            End With
            ' Acesso ao With externo (shapeContainer)
            console.log("Nome do shape: " & CStr(._name))
         End With

      Catch ex As Exception
         ' Bug do Finally: o Catch é acionado mesmo se não houver erro.
         ' O contorno é verificar Assigned(ex)
         If Assigned(ex) Then
            console.log("Erro capturado: " & ex._GetMessage())
         End If
      Finally
         ' Liberação mandatória do objeto
         If Assigned(shapeContainer) Then
            shapeContainer.Free()
            shapeContainer = NULL
         End If
      End Try

      ' Limpando tipos primitivos e variants
      Dim temporaria As Variant = "Dado"
      If Not IsEmpty(temporaria) Then
         temporaria = Unassigned
      End If
   End Sub

End Namespace
```
