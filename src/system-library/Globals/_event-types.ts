import type { SystemSymbolInfo } from "../types";
import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";

/**
 * Delegates / tipos de evento da VCL referenciados por propriedades de
 * controles e formulários (TControl/TWinControl/TForm/TCustomForm).
 *
 * Sem essas declarações, o linter emite `unknown-member` quando o usuário
 * declara `Dim x As TDragDropEvent` ou faz `Report.OnDockDrop = AddressOf X`
 * sabendo o tipo. Cada item é modelado como `class` (não como `delegate`)
 * porque o resolver de tipos do Data7 trata os dois de forma equivalente
 * quando o símbolo é apenas usado como type annotation.
 */

interface EventTypeSpec {
  readonly name: string;
  readonly description: string;
}

const eventTypes: readonly EventTypeSpec[] = [
  {
    name: "TDragDropEvent",
    description: "Delegate `(Sender As TObject, Source As TObject, X As Integer, Y As Integer)`.",
  },
  {
    name: "TDragOverEvent",
    description:
      "Delegate `(Sender, Source, X, Y, State As TDragState, ByRef Accept As Boolean)` para OnDragOver.",
  },
  {
    name: "TEndDragEvent",
    description:
      "Delegate `(Sender, Target As TObject, X, Y As Integer)` para OnEndDrag/OnEndDock.",
  },
  {
    name: "TUnDockEvent",
    description:
      "Delegate `(Sender, Client As TControl, NewTarget As TWinControl, ByRef Allow As Boolean)`.",
  },
  {
    name: "TStartDockEvent",
    description: "Delegate de início de docking `(Sender, ByRef DragObject)`.",
  },
  {
    name: "TGetSiteInfoEvent",
    description:
      "Delegate `(Sender, DockClient As TControl, ByRef InfluenceRect, MousePos, ByRef CanDock As Boolean)`.",
  },
  {
    name: "TCanResizeEvent",
    description:
      "Delegate `(Sender, ByRef NewWidth, NewHeight As Integer, ByRef Resize As Boolean)`.",
  },
  {
    name: "TConstrainedResizeEvent",
    description: "Delegate de restrição dinâmica de tamanho durante o redimensionamento.",
  },
  {
    name: "TContextPopupEvent",
    description:
      "Delegate `(Sender, MousePos As TPoint, ByRef Handled As Boolean)` para OnContextPopup.",
  },
  {
    name: "TAlignInsertBeforeEvent",
    description: "Delegate `(Sender, C1, C2 As TControl) As Boolean` — ordena controles em Align.",
  },
  {
    name: "TMouseWheelEvent",
    description:
      "Delegate `(Sender, Shift As TShiftState, WheelDelta As Integer, MousePos As TPoint, ByRef Handled As Boolean)`.",
  },
  {
    name: "TMouseWheelUpDownEvent",
    description:
      "Delegate `(Sender, Shift As TShiftState, MousePos As TPoint, ByRef Handled As Boolean)`.",
  },
  {
    name: "TMethod",
    description:
      "Tipo Delphi `record { Code, Data: Pointer }` — usado para apontar para métodos genéricos.",
  },
  {
    name: "TDragState",
    description: "Enumeração de estado de drag (dsDragEnter, dsDragLeave, dsDragMove).",
  },
];

const symbolsBuilt: SystemSymbolInfo[] = eventTypes.map((e) => ({
  name: e.name,
  kind: "class",
  type: e.name,
  isShared: false,
  isPrivate: false,
  range: { ...SYSTEM_RANGE },
  fileUri: SYSTEM_URI,
  description: e.description,
}));

export const symbols: SystemSymbolInfo[] = symbolsBuilt;
