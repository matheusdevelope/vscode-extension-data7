# Namespace `System`

> Documentação gerada automaticamente pela extensão **Data7 Dev Studio**.
> Reflete o estado atual da System Library reconhecida pelo linter / IntelliSense.

## 1. Visão geral

Namespace básico do RTL Delphi — funções de memória, matemática, strings, conversão de tipos e constantes Variant.

**Como importar:**

```basic
Imports System
```

## 3. Classes (com membros próprios)

> Cada classe lista apenas seus membros **próprios**. Membros herdados podem ser consultados nas classes ancestrais via os links da cadeia de herança no topo de cada seção.

#### `IOUtils`

Utilitários para manipulação do sistema de arquivos.

**Métodos:**

| Nome | Retorno | Parâmetros | Descrição |
|---|---|---|---|
| `DirectoryExists` | `Boolean` | `(pPath As String)` | Verifica se o diretório especificado existe no disco. |
| `FileExists` | `Boolean` | `(pPath As String)` | Verifica se o arquivo especificado existe no disco. |

#### `TDateTime`

Alias para Double que armazena data e hora.

**Propriedades:**

| Nome | Tipo | Descrição |
|---|---|---|
| `Day` | `Integer` | Retorna o dia do mês correspondente da data. |
| `Day` | `Integer` | Retorna o dia do mês. |
| `Hour` | `Integer` | Retorna a hora correspondente. |
| `Hour` | `Integer` | Retorna a hora correspondente. |
| `IsDate` | `Boolean` | Retorna True se o valor contiver somente data válida. |
| `IsDateTime` | `Boolean` | Retorna True se o valor contiver data e hora válidas. |
| `IsTime` | `Boolean` | Retorna True se o valor contiver somente hora válida. |
| `Minute` | `Integer` | Retorna o minuto correspondente. |
| `Minute` | `Integer` | Retorna os minutos correspondentes. |
| `Month` | `Integer` | Retorna o mês correspondente da data. |
| `Month` | `Integer` | Retorna o mês correspondente. |
| `Second` | `Integer` | Retorna o segundo correspondente. |
| `Second` | `Integer` | Retorna os segundos correspondentes. |
| `Year` | `Integer` | Retorna o ano correspondente da data. |
| `Year` | `Integer` | Retorna o ano correspondente. |

**Métodos:**

| Nome | Retorno | Parâmetros | Descrição |
|---|---|---|---|
| `AddDays` | [`TDateTime`](#tdatetime) | `(pDays As Double)` | Adiciona ou subtrai dias da data especificada. |
| `AddHours` | [`TDateTime`](#tdatetime) | `(pHours As Double)` | Adiciona ou subtrai horas da data especificada. |
| `AddMinutes` | [`TDateTime`](#tdatetime) | `(pMinutes As Double)` | Adiciona ou subtrai minutos da data especificada. |
| `AddMonths` | [`TDateTime`](#tdatetime) | `(pMonths As Integer)` | Adiciona ou subtrai meses da data especificada. |
| `AddSeconds` | [`TDateTime`](#tdatetime) | `(pSeconds As Double)` | Adiciona ou subtrai segundos da data especificada. |
| `AddYears` | [`TDateTime`](#tdatetime) | `(pYears As Integer)` | Adiciona ou subtrai anos da data especificada. |
| `Date` | `Date` | `()` | Retorna apenas a porção de data. |
| `EncodeTime` | [`TDateTime`](#tdatetime) | `(pHour As Integer, pMin As Integer, pSec As Integer, pMSec As Integer)` | Codifica horas, minutos, segundos e milissegundos em um objeto TDateTime. |
| `ToString` | `String` | `()` | Converte o valor de data e hora para string formatada. |
| `ToString` | `String` | `(pFormat As String = "")` | Formata a data/hora em formato string baseado no padrão informado (ex: "dd/mm/yyyy hh:nn:ss"). |
| `ToString` | `String` | `(Optional pFormat As String)` | Converte a data/hora para String utilizando um formato opcional (ex: "dd/mm/yyyy hh:nn:ss"). |

## 6. Aliases / classes intermediárias (sem membros próprios)

> Classes da cadeia de herança real (Delphi/VCL/DevExpress/TMS/Data7) que existem para que tipos como `Dim x As TBotao` sejam reconhecidos. Todos os seus membros são herdados.

| Tipo | Herda de | Descrição |
|---|---|---|
| `HMODULE` | `-` | Handle de módulo carregado. |
| `HRESULT` | `-` | Código HRESULT padrão (COM). |
| `Longint` | `-` | Alias para inteiro com sinal de 32 bits. |
| `LongWord` | `-` | Alias para inteiro sem sinal de 32 bits. |
| `Real` | `-` | Alias para Double (número real). |
| `THandle` | `-` | Handle nativo do sistema operacional. |
| `TTextLineBreakStyle` | `-` | Estilo de quebra de linha em texto. |
| `TThreadFunc` | `-` | Tipo da função executada por uma thread (Pointer). |
| `TVarType` | `-` | Código do tipo de Variant (ver var*). |
| `UCS4String` | `-` | String composta por UCS-4 chars. |
| `UTF8String` | `-` | String codificada em UTF-8. |

## 7. Funções e procedimentos do namespace

| Nome | Retorno | Parâmetros | Descrição |
|---|---|---|---|
| `Abs` | `Extended` | `(X As Extended)` | Retorna o valor absoluto de X. |
| `AllocMem` | `Pointer` | `(Size As Cardinal)` | Aloca um bloco de memória zerado do tamanho informado. |
| `ArcTan` | `Extended` | `(X As Extended)` | Retorna o arco-tangente de X (em radianos). |
| `BeginThread` | `Integer` | `(SecurityAttributes As Pointer, StackSize As Cardinal, ThreadFunc As TThreadFunc, Parameter As Pointer, CreationFlags As Cardinal, ByRef ThreadId As Cardinal)` | Cria uma nova thread de sistema executando ThreadFunc. |
| `Chr` | `Char` | `(X As Byte)` | Retorna o caractere correspondente ao código informado. |
| `Copy` | `String` | `(S As String, Index As Integer, Count As Integer)` | Retorna uma substring de S iniciando em Index com Count caracteres. |
| `Cos` | `Extended` | `(X As Extended)` | Retorna o cosseno de X (X em radianos). |
| `Dec` | `Void` | `(ByRef X As Integer, Optional N As Integer)` | Decrementa X em 1 (ou em N). |
| `Delete` | `Void` | `(ByRef S As String, Index As Integer, Count As Integer)` | Remove Count caracteres de S a partir da posição Index. |
| `Dispose` | `Void` | `(P As Pointer)` | Libera memória dinâmica alocada por New. |
| `EndThread` | `Void` | `(ExitCode As Integer)` | Finaliza a thread atual com o código de saída informado. |
| `Exp` | `Extended` | `(X As Extended)` | Retorna e (base natural) elevado a X. |
| `FillChar` | `Void` | `(ByRef X As Pointer, Count As Integer, Value As Byte)` | Preenche Count bytes a partir de X com o valor informado. |
| `Frac` | `Extended` | `(X As Extended)` | Retorna a parte fracionária de X. |
| `FreeMem` | `Void` | `(P As Pointer, Optional Size As Integer)` | Libera um bloco de memória alocado por GetMem/AllocMem. |
| `GetMem` | `Void` | `(ByRef P As Pointer, Size As Integer)` | Aloca um bloco de memória do tamanho informado e retorna o ponteiro em P. |
| `Hi` | `Byte` | `(X As Integer)` | Retorna o byte mais significativo (alto) de X. |
| `High` | `Integer` | `(X As Variant)` | Retorna o maior valor ordinal/index possível para X. |
| `Inc` | `Void` | `(ByRef X As Integer, Optional N As Integer)` | Incrementa X em 1 (ou em N). |
| `Insert` | `Void` | `(Substr As String, ByRef Dest As String, Index As Integer)` | Insere Substr em Dest na posição Index. |
| `Int` | `Extended` | `(X As Extended)` | Retorna a parte inteira de X (como Extended). |
| `Length` | `Integer` | `(S As String)` | Retorna o comprimento (em caracteres) da string informada. |
| `Ln` | `Extended` | `(X As Extended)` | Retorna o logaritmo natural de X. |
| `Lo` | `Byte` | `(X As Integer)` | Retorna o byte menos significativo (baixo) de X. |
| `Low` | `Integer` | `(X As Variant)` | Retorna o menor valor ordinal/index possível para X. |
| `Move` | `Void` | `(Source As Pointer, ByRef Dest As Pointer, Count As Integer)` | Copia Count bytes de Source para Dest. |
| `New` | `Void` | `(ByRef P As Pointer)` | Aloca memória dinâmica para o tipo apontado por P. |
| `Odd` | `Boolean` | `(X As Integer)` | Retorna True se X é ímpar. |
| `Ord` | `Integer` | `(X As Variant)` | Retorna o valor ordinal de X. |
| `Pos` | `Integer` | `(Substr As String, Str As String)` | Retorna a posição (1-based) da primeira ocorrência de Substr em Str. |
| `Power` | `Extended` | `(Base As Extended, Exponent As Extended)` | Retorna Base elevado a Exponent. |
| `Pred` | `Integer` | `(X As Integer)` | Retorna o predecessor ordinal de X. |
| `Random` | `Integer` | `(Optional X As Integer)` | Sem argumentos retorna um Double em [0,1). Com X retorna um inteiro em [0,X). |
| `Randomize` | `Void` | `()` | Inicializa o gerador de números aleatórios com base no relógio do sistema. |
| `Round` | `Long` | `(X As Extended)` | Arredonda X para o inteiro mais próximo (banker's rounding). |
| `Sin` | `Extended` | `(X As Extended)` | Retorna o seno de X (X em radianos). |
| `SizeOf` | `Integer` | `(X As Variant)` | Retorna o tamanho em bytes de X. |
| `Sqr` | `Extended` | `(X As Extended)` | Retorna o quadrado de X. |
| `Sqrt` | `Extended` | `(X As Extended)` | Retorna a raiz quadrada de X. |
| `Str` | `Void` | `(X As Variant, ByRef S As String)` | Converte um valor numérico X em sua representação como string em S. |
| `Succ` | `Integer` | `(X As Integer)` | Retorna o sucessor ordinal de X. |
| `Trunc` | `Integer` | `(X As Extended)` | Trunca X para Integer (descarta a parte fracionária). |
| `Upcase` | `Char` | `(C As Char)` | Converte um caractere para maiúsculo. |
| `Val` | `Void` | `(S As String, ByRef V As Integer, ByRef Code As Integer)` | Converte a string S em valor numérico V. Em Code retorna 0 quando bem-sucedido ou a posição do caractere inválido. |

---

_13 classes/tipos, 0 delegates, 44 funções, ~28 membros próprios em classes, 0 constantes associadas a tipos enumerados._

_Snapshot `2616b20d9001` — gerado em 2026-05-27T21:04:59.247Z pela extensão Data7 Dev Studio._
