# Namespace `Drawing`

> Documentação gerada automaticamente pela extensão **Data7 Dev Studio**.
> Reflete o estado atual da System Library reconhecida pelo linter / IntelliSense.

## 1. Visão geral

Namespace nativo do Data7 para recursos gráficos e de desenho (TCanvas, TPen, etc.).

**Como importar:**

```basic
Imports Drawing
```

## 2. Árvore de herança das classes

```
TObject  (externo)
├─ TCanvas
└─ TPen
```

## 3. Classes (com membros próprios)

> Cada classe lista apenas seus membros **próprios**. Membros herdados podem ser consultados nas classes ancestrais via os links da cadeia de herança no topo de cada seção.

#### `TCanvas`

**Herda de:** `TObject`

**Cadeia completa:** `TObject` → `System.Classes.TObject`

Representa a área de desenho de um componente gráfico.

**Propriedades:**

| Nome | Tipo | Descrição |
|---|---|---|
| `Pen` | [`TPen`](#tpen) | Obtém ou define as configurações da caneta de contorno. |

**Métodos:**

| Nome | Retorno | Parâmetros | Descrição |
|---|---|---|---|
| `MoveTo` | `Void` | `(pX As Integer, pY As Integer)` | Move a posição atual da caneta para as coordenadas informadas. |
| `Rectangle` | `Void` | `(pX1 As Integer, pY1 As Integer, pX2 As Integer, pY2 As Integer)` | Desenha um retângulo no canvas utilizando a caneta ativa. |

#### `TPen`

**Herda de:** `TObject`

**Cadeia completa:** `TObject` → `System.Classes.TObject`

Gerencia a largura e cor das linhas desenhadas no Canvas.

**Propriedades:**

| Nome | Tipo | Descrição |
|---|---|---|
| `Color` | `Integer` | Cor da linha da caneta. |
| `Width` | `Integer` | Largura/espessura da caneta. |

## 4. Tipos enumerados (com constantes)

> Tipos sem membros próprios cuja função é agrupar um conjunto fechado de constantes acessíveis globalmente.

### `TBrushStyle`

Padrão de preenchimento de uma TBrush (cor sólida ou hachura). Usado em Canvas.Brush.Style e TShape.Brush.Style.

| Constante | Descrição |
|---|---|
| `bsBDiagonal` | Hachura diagonal (back — desce da esquerda para a direita). |
| `bsClear` | Sem preenchimento (transparente). |
| `bsCross` | Hachura em cruz (horizontal + vertical). |
| `bsDiagCross` | Hachura em xis (diagonal cross). |
| `bsFDiagonal` | Hachura diagonal (forward — sobe da esquerda para a direita). |
| `bsHorizontal` | Hachura horizontal. |
| `bsSolid` | Preenchimento sólido com Brush.Color. |
| `bsVertical` | Hachura vertical. |

### `TPenStyle`

Estilo de traço de uma TPen. Usado em Canvas.Pen.Style e TShape.Pen.Style.

| Constante | Descrição |
|---|---|
| `psAlternate` | Pixels alternados (mais fino que psDot). |
| `psClear` | Sem linha (invisível). |
| `psDash` | Linha tracejada (—  —  —). |
| `psDashDot` | Linha traço-ponto (— · — ·). |
| `psDashDotDot` | Linha traço-ponto-ponto (— · · — · ·). |
| `psDot` | Linha pontilhada (· · ·). |
| `psInsideFrame` | Linha dentro do contorno da forma (somente com largura > 1). |
| `psSolid` | Linha contínua (sólida). |
| `psUserStyle` | Estilo customizado definido pelo usuário (combinações de dashes). |

---

_4 classes/tipos, 0 delegates, 0 funções, ~5 membros próprios em classes, 17 constantes associadas a tipos enumerados._

_Snapshot `2616b20d9001` — gerado em 2026-05-27T21:04:59.210Z pela extensão Data7 Dev Studio._
