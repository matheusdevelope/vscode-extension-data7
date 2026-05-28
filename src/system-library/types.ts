import type { SymbolInfo } from "../analysis/symbol-indexer";

/**
 * Canonical list of container names used inside the system library.
 * Any value used as `containerName` on a system symbol must appear here so
 * that typos are caught at compile time (see project_context.md §2.5).
 *
 * Conventions:
 *  - Namespace names match the folder under `src/system-library/`.
 *  - Class names are the simple Data7 type identifier (e.g. `Form`,
 *    `TextBox`, `TWinControl`). The linter and resolver match by short name
 *    and by qualified `Namespace.Type` form interchangeably.
 */
export type SystemContainer =
  // ───────── Namespaces ─────────
  | "Data7"
  | "System"
  | "System.Classes"
  | "Environment"
  | "IO"
  | "Collections"
  | "XML"
  | "Forms"
  | "SQL"
  | "Drawing"
  | "Excel"
  | "Net"

  // ───────── Globals & primitives ─────────
  | "TPrimitive"
  | "String"
  | "Integer"
  | "Double"
  | "Boolean"
  | "TDateTime"
  | "Date"
  | "Single"
  | "Extended"
  | "TObject"
  | "TPersistent"
  | "THTTP"
  | "TJSONObject"
  | "TJSONArray"
  | "TPoint"
  | "TRect"

  // ───────── Globals — delegates / event types VCL ─────────
  | "TMethod"
  | "TDragState"
  | "TDragDropEvent"
  | "TDragOverEvent"
  | "TEndDragEvent"
  | "TUnDockEvent"
  | "TStartDockEvent"
  | "TGetSiteInfoEvent"
  | "TCanResizeEvent"
  | "TConstrainedResizeEvent"
  | "TContextPopupEvent"
  | "TAlignInsertBeforeEvent"
  | "TMouseWheelEvent"
  | "TMouseWheelUpDownEvent"

  // ───────── System.Classes ─────────
  | "System.Classes.TObject"
  | "System.Classes.TPersistent"

  // ───────── IO ─────────
  | "IOUtils"
  | "Directory"
  | "File"
  | "ZipFile"

  // ───────── Collections ─────────
  | "TStrings"
  | "TStringList"
  | "StringList"

  // ───────── XML ─────────
  | "TXMLDocument"
  | "IXMLNode"
  | "IXMLNodeList"

  // ───────── SQL ─────────
  | "Connection"
  | "Command"
  | "TField"
  | "TFDParam"
  | "TFDDataSet"
  | "TFDStoredActivationUsage"
  | "TFilterOptions"
  | "TFDUpdateRecordTypes"
  | "TRDBMS"
  | "TDataSetNotifyEvent"
  | "TFilterRecordEvent"
  | "TFDDataSetEvent"
  | "TFDAfterApplyUpdatesEvent"
  | "TFDErrorEvent"

  // ───────── Data7 ─────────
  | "Report"

  // ───────── Net ─────────
  | "TFTP"

  // ───────── Drawing ─────────
  | "TCanvas"
  | "TPen"

  // ───────── Forms — trunk classes (não-finais) ─────────
  | "TComponent"
  | "TControl"
  | "TGraphicControl"
  | "TShape"
  | "TWinControl"
  | "TScrollingWinControl"
  | "TForm"
  | "TFrame"
  | "TButtonControl"
  | "TCustomControl"
  | "TcxCustomEdit"
  | "TcxCustomTextEdit"
  | "TCustomEdit"
  | "TCustomButtonedEdit"
  | "TButtonedEdit"

  // ───────── Forms — non-visual / utility components ─────────
  | "Timer"
  | "MessageBox"
  | "TMargins"
  | "TAlign"
  | "TAlignment"
  | "TBoundLabel"
  | "TLabeledEdit"
  | "TBorderIcons"

  // ───────── Forms — visual leaf classes ─────────
  | "Form"
  | "FormButtons"
  | "Topbar"
  | "Calendar"
  | "PageControl"
  | "TabSheet"
  | "Panel"
  | "CustomControl"
  | "ControlGroup"
  | "Grid"
  | "Imagem"
  | "Rectangle"
  | "Ellipse"
  | "Line"
  | "Border"
  | "FlatButton"
  | "CommandButton"
  | "ButtonOk"
  | "ButtonCancel"
  | "ProgressBar"
  | "StaticText"
  | "TextBox"
  | "PasswordTextBox"
  | "DateTextBox"
  | "NumberTextBox"
  | "ValueTextBox"
  | "MemoTextBox"
  | "SearchTextBox"
  | "ButtonTextBox"
  | "HComboBox"
  | "CheckBox"

  // ───────── Forms — qualified aliases (compat) ─────────
  | "Forms.Form"
  | "Forms.Grid"
  | "Forms.Imagem";

export interface SystemSymbolInfo extends Omit<SymbolInfo, "containerName"> {
  containerName?: SystemContainer;
}
