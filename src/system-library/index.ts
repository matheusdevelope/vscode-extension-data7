import type { SymbolInfo } from "../analysis/symbol-indexer";

// ───────── Collections ─────────
import { symbols as sym_Collections_Collections } from "./Collections/Collections";
import { symbols as sym_Collections_StringList } from "./Collections/StringList";
import { symbols as sym_Collections_TStrings } from "./Collections/TStrings";
import { symbols as sym_Collections_TStringList } from "./Collections/TStringList";

// ───────── Data7 ─────────
import { symbols as sym_Data7_CodEmpresa } from "./Data7/CodEmpresa";
import { symbols as sym_Data7_CodFilial } from "./Data7/CodFilial";
import { symbols as sym_Data7_CodPeriodoCaixa } from "./Data7/CodPeriodoCaixa";
import { symbols as sym_Data7_CodUsuario } from "./Data7/CodUsuario";
import { symbols as sym_Data7_Criptografar } from "./Data7/Criptografar";
import { symbols as sym_Data7_Data7 } from "./Data7/Data7";
import { symbols as sym_Data7_Report } from "./Data7/Report";
import { symbols as sym_Data7_Descriptografar } from "./Data7/Descriptografar";
import { symbols as sym_Data7_NomeArquivoExecutavel } from "./Data7/NomeArquivoExecutavel";
import { symbols as sym_Data7_NomeUsuario } from "./Data7/NomeUsuario";
import { symbols as sym_Data7_Parametro } from "./Data7/Parametro";
import { symbols as sym_Data7_PesquisaPadrao } from "./Data7/PesquisaPadrao";
import { symbols as sym_Data7_ProximoCodigo } from "./Data7/ProximoCodigo";
import { symbols as sym_Data7_ProximoID } from "./Data7/ProximoID";
import { symbols as sym_Data7_ValorPorExtenso } from "./Data7/ValorPorExtenso";
import { symbols as sym_Data7_ValorPorExtensoLinha1 } from "./Data7/ValorPorExtensoLinha1";
import { symbols as sym_Data7_ValorPorExtensoLinha2 } from "./Data7/ValorPorExtensoLinha2";

// ───────── Drawing ─────────
import { symbols as sym_Drawing_Drawing } from "./Drawing/Drawing";
import { symbols as sym_Drawing_TCanvas } from "./Drawing/TCanvas";
import { symbols as sym_Drawing_TPen } from "./Drawing/TPen";
import { symbols as sym_Drawing_TBrushStyle } from "./Drawing/TBrushStyle";
import { symbols as sym_Drawing_TPenStyle } from "./Drawing/TPenStyle";

// ───────── Environment ─────────
import { symbols as sym_Environment_Environment } from "./Environment/Environment";
import { symbols as sym_Environment_Execute } from "./Environment/Execute";
import { symbols as sym_Environment_MachineName } from "./Environment/MachineName";
import { symbols as sym_Environment_UserName } from "./Environment/UserName";

// ───────── Forms — trunk classes (não-finais) ─────────
import { symbols as sym_Forms_TComponent } from "./Forms/TComponent";
import { symbols as sym_Forms_TControl } from "./Forms/TControl";
import { symbols as sym_Forms_TGraphicControl } from "./Forms/TGraphicControl";
import { symbols as sym_Forms_TShape } from "./Forms/TShape";
import { symbols as sym_Forms_TWinControl } from "./Forms/TWinControl";
import { symbols as sym_Forms_TScrollingWinControl } from "./Forms/TScrollingWinControl";
import { symbols as sym_Forms_TForm } from "./Forms/TForm";
import { symbols as sym_Forms_TFrame } from "./Forms/TFrame";
import { symbols as sym_Forms_TButtonControl } from "./Forms/TButtonControl";
import { symbols as sym_Forms_TCustomControl } from "./Forms/TCustomControl";
import { symbols as sym_Forms_TcxCustomEdit } from "./Forms/TcxCustomEdit";
import { symbols as sym_Forms_TcxCustomTextEdit } from "./Forms/TcxCustomTextEdit";
import { symbols as sym_Forms_TCustomEdit } from "./Forms/TCustomEdit";
import { symbols as sym_Forms_TCustomButtonedEdit } from "./Forms/TCustomButtonedEdit";
import { symbols as sym_Forms_TButtonedEdit } from "./Forms/TButtonedEdit";

// ───────── Forms — namespace + utility ─────────
import { symbols as sym_Forms_Forms } from "./Forms/Forms";
import { symbols as sym_Forms_MessageBox } from "./Forms/MessageBox";
import { symbols as sym_Forms_ProcessMessages } from "./Forms/ProcessMessages";
import { symbols as sym_Forms_TAlign } from "./Forms/TAlign";
import { symbols as sym_Forms_TAlignment } from "./Forms/TAlignment";
import { symbols as sym_Forms_TMargins } from "./Forms/TMargins";

// ───────── Forms — type aliases & intermediate classes ─────────
import { symbols as sym_Forms_aliases } from "./Forms/_aliases";

// ───────── Forms — enum types & constants ─────────
import { symbols as sym_Forms_TShiftState } from "./Forms/TShiftState";
import { symbols as sym_Forms_TModalResult } from "./Forms/TModalResult";
import { symbols as sym_Forms_TFormBorderStyle } from "./Forms/TFormBorderStyle";
import { symbols as sym_Forms_TBorderStyle } from "./Forms/TBorderStyle";
import { symbols as sym_Forms_TDefaultMonitor } from "./Forms/TDefaultMonitor";
import { symbols as sym_Forms_TFormStyle } from "./Forms/TFormStyle";
import { symbols as sym_Forms_TPopupMode } from "./Forms/TPopupMode";
import { symbols as sym_Forms_TPosition } from "./Forms/TPosition";
import { symbols as sym_Forms_TPrintScale } from "./Forms/TPrintScale";
import { symbols as sym_Forms_TRoundedCornerType } from "./Forms/TRoundedCornerType";
import { symbols as sym_Forms_TEditorType } from "./Forms/TEditorType";
import { symbols as sym_Forms_TGridDrawState } from "./Forms/TGridDrawState";

// ───────── Forms — interfaces / event types / grid-related ─────────
import { symbols as sym_Forms_IFormVisualManager } from "./Forms/IFormVisualManager";
import { symbols as sym_Forms_TMonitorDpiChangedEvent } from "./Forms/TMonitorDpiChangedEvent";
import { symbols as sym_Forms_TCloseEvent } from "./Forms/TCloseEvent";
import { symbols as sym_Forms_TCloseQueryEvent } from "./Forms/TCloseQueryEvent";
import { symbols as sym_Forms_GridConfigs } from "./Forms/GridConfigs";
import { symbols as sym_Forms_TEditLink } from "./Forms/TEditLink";
import { symbols as sym_Forms_GridEditorLink } from "./Forms/GridEditorLink";
import { symbols as sym_Forms_gridEvents } from "./Forms/_grid-events";
import { symbols as sym_Forms_gridTypes } from "./Forms/_grid-types";

// ───────── Forms — bevel / shape / state / anchor / progress / bidi (control-related enums) ─────────
import { symbols as sym_Forms_TBevelShape } from "./Forms/TBevelShape";
import { symbols as sym_Forms_TBevelStyle } from "./Forms/TBevelStyle";
import { symbols as sym_Forms_TBevelKind } from "./Forms/TBevelKind";
import { symbols as sym_Forms_TShapeType } from "./Forms/TShapeType";
import { symbols as sym_Forms_TWindowState } from "./Forms/TWindowState";
import { symbols as sym_Forms_TAnchorKind } from "./Forms/TAnchorKind";
import { symbols as sym_Forms_TBorderIcon } from "./Forms/TBorderIcon";
import { symbols as sym_Forms_TCloseAction } from "./Forms/TCloseAction";
import { symbols as sym_Forms_TLabelPosition } from "./Forms/TLabelPosition";
import { symbols as sym_Forms_TProgressBarOrientation } from "./Forms/TProgressBarOrientation";
import { symbols as sym_Forms_TProgressBarState } from "./Forms/TProgressBarState";
import { symbols as sym_Forms_TProgressBarStyle } from "./Forms/TProgressBarStyle";
import { symbols as sym_Forms_TBiDiMode } from "./Forms/TBiDiMode";

// ───────── Forms — visual leaf classes ─────────
import { symbols as sym_Forms_Form } from "./Forms/Form";
import { symbols as sym_Forms_FormButtons } from "./Forms/FormButtons";
import { symbols as sym_Forms_Topbar } from "./Forms/Topbar";
import { symbols as sym_Forms_Calendar } from "./Forms/Calendar";
import { symbols as sym_Forms_PageControl } from "./Forms/PageControl";
import { symbols as sym_Forms_TabSheet } from "./Forms/TabSheet";
import { symbols as sym_Forms_Panel } from "./Forms/Panel";
import { symbols as sym_Forms_CustomControl } from "./Forms/CustomControl";
import { symbols as sym_Forms_ControlGroup } from "./Forms/ControlGroup";
import { symbols as sym_Forms_Grid } from "./Forms/Grid";
import { symbols as sym_Forms_Imagem } from "./Forms/Imagem";
import { symbols as sym_Forms_Rectangle } from "./Forms/Rectangle";
import { symbols as sym_Forms_Ellipse } from "./Forms/Ellipse";
import { symbols as sym_Forms_Line } from "./Forms/Line";
import { symbols as sym_Forms_Border } from "./Forms/Border";
import { symbols as sym_Forms_FlatButton } from "./Forms/FlatButton";
import { symbols as sym_Forms_CommandButton } from "./Forms/CommandButton";
import { symbols as sym_Forms_ButtonOk } from "./Forms/ButtonOk";
import { symbols as sym_Forms_ButtonCancel } from "./Forms/ButtonCancel";
import { symbols as sym_Forms_ProgressBar } from "./Forms/ProgressBar";
import { symbols as sym_Forms_Timer } from "./Forms/Timer";
import { symbols as sym_Forms_StaticText } from "./Forms/StaticText";
import { symbols as sym_Forms_TBoundLabel } from "./Forms/TBoundLabel";
import { symbols as sym_Forms_TLabeledEdit } from "./Forms/TLabeledEdit";
import { symbols as sym_Forms_TextBox } from "./Forms/TextBox";
import { symbols as sym_Forms_PasswordTextBox } from "./Forms/PasswordTextBox";
import { symbols as sym_Forms_DateTextBox } from "./Forms/DateTextBox";
import { symbols as sym_Forms_NumberTextBox } from "./Forms/NumberTextBox";
import { symbols as sym_Forms_ValueTextBox } from "./Forms/ValueTextBox";
import { symbols as sym_Forms_MemoTextBox } from "./Forms/MemoTextBox";
import { symbols as sym_Forms_SearchTextBox } from "./Forms/SearchTextBox";
import { symbols as sym_Forms_ButtonTextBox } from "./Forms/ButtonTextBox";
import { symbols as sym_Forms_HComboBox } from "./Forms/HComboBox";
import { symbols as sym_Forms_CheckBox } from "./Forms/CheckBox";

// ───────── Globals ─────────
import { symbols as sym_Globals_alBottom } from "./Globals/alBottom";
import { symbols as sym_Globals_alClient } from "./Globals/alClient";
import { symbols as sym_Globals_alLeft } from "./Globals/alLeft";
import { symbols as sym_Globals_alNone } from "./Globals/alNone";
import { symbols as sym_Globals_alRight } from "./Globals/alRight";
import { symbols as sym_Globals_alTop } from "./Globals/alTop";
import { symbols as sym_Globals_Base64ToFile } from "./Globals/Base64ToFile";
import { symbols as sym_Globals_CDbl } from "./Globals/CDbl";
import { symbols as sym_Globals_Char } from "./Globals/Char";
import { symbols as sym_Globals_CInt } from "./Globals/CInt";
import { symbols as sym_Globals_CStr } from "./Globals/CStr";
import { symbols as sym_Globals_DateTime } from "./Globals/DateTime";
import { symbols as sym_Globals_FileToBase64 } from "./Globals/FileToBase64";
import { symbols as sym_Globals_InStr } from "./Globals/InStr";
import { symbols as sym_Globals_LCase } from "./Globals/LCase";
import { symbols as sym_Globals_Left } from "./Globals/Left";
import { symbols as sym_Globals_Mid } from "./Globals/Mid";
import { symbols as sym_Globals_RGB } from "./Globals/RGB";
import { symbols as sym_Globals_Space } from "./Globals/Space";
import { symbols as sym_Globals_taCenter } from "./Globals/taCenter";
import { symbols as sym_Globals_taLeftJustify } from "./Globals/taLeftJustify";
import { symbols as sym_Globals_taRightJustify } from "./Globals/taRightJustify";
import { symbols as sym_Globals_THTTP } from "./Globals/THTTP";
import { symbols as sym_Globals_Timer } from "./Globals/Timer";
import { symbols as sym_Globals_TJSONArray } from "./Globals/TJSONArray";
import { symbols as sym_Globals_TJSONObject } from "./Globals/TJSONObject";
import { symbols as sym_Globals_TLSv1 } from "./Globals/TLSv1";
import { symbols as sym_Globals_TLSv1_1 } from "./Globals/TLSv1_1";
import { symbols as sym_Globals_TLSv1_2 } from "./Globals/TLSv1_2";
import { symbols as sym_Globals_TLSv1_3 } from "./Globals/TLSv1_3";
import { symbols as sym_Globals_TObject } from "./Globals/TObject";
import { symbols as sym_Globals_TPersistent } from "./Globals/TPersistent";
import { symbols as sym_Globals_TryStrToInt } from "./Globals/TryStrToInt";
import { symbols as sym_Globals_UCase } from "./Globals/UCase";
import { symbols as sym_Globals_ZipFile } from "./Globals/ZipFile";
// Globals — tipos comuns Delphi (TColor, TCursor, TPoint, TRect, TFontStyle, TMouseButton + event delegates)
import { symbols as sym_Globals_TColor } from "./Globals/TColor";
import { symbols as sym_Globals_TCursor } from "./Globals/TCursor";
import { symbols as sym_Globals_TPoint } from "./Globals/TPoint";
import { symbols as sym_Globals_TRect } from "./Globals/TRect";
import { symbols as sym_Globals_TFontStyle } from "./Globals/TFontStyle";
import { symbols as sym_Globals_TMouseButton } from "./Globals/TMouseButton";
import { symbols as sym_Globals_TNotifyEvent } from "./Globals/TNotifyEvent";
import { symbols as sym_Globals_TMouseEvent } from "./Globals/TMouseEvent";
import { symbols as sym_Globals_TKeyEvent } from "./Globals/TKeyEvent";
import { symbols as sym_Globals_TKeyPressEvent } from "./Globals/TKeyPressEvent";
import { symbols as sym_Globals_eventTypes } from "./Globals/_event-types";

// ───────── IO ─────────
import { symbols as sym_IO_Directory } from "./IO/Directory";
import { symbols as sym_IO_File } from "./IO/File";
import { symbols as sym_IO_IO } from "./IO/IO";

// ───────── Net ─────────
import { symbols as sym_Net_Net } from "./Net/Net";
import { symbols as sym_Net_TFTP } from "./Net/TFTP";

// ───────── Primitives ─────────
import { symbols as sym_Primitives_Primitive } from "./Primitives/TPrimitive";
import { symbols as sym_Primitives_Boolean } from "./Primitives/Boolean";
import { symbols as sym_Primitives_Double } from "./Primitives/Double";
import { symbols as sym_Primitives_Extended } from "./Primitives/Extended";
import { symbols as sym_Primitives_Integer } from "./Primitives/Integer";
import { symbols as sym_Primitives_Single } from "./Primitives/Single";
import { symbols as sym_Primitives_String } from "./Primitives/String";
import { symbols as sym_Primitives_TDateTime } from "./Primitives/TDateTime";

// ───────── SQL ─────────
import { symbols as sym_SQL_Command } from "./SQL/Command";
import { symbols as sym_SQL_Connection } from "./SQL/Connection";
import { symbols as sym_SQL_SQL } from "./SQL/SQL";
import { symbols as sym_SQL_TFDParam } from "./SQL/TFDParam";
import { symbols as sym_SQL_TField } from "./SQL/TField";
import { symbols as sym_SQL_aliases } from "./SQL/_aliases";

// ───────── System ─────────
import { symbols as sym_System_IOUtils } from "./System/IOUtils";
import { symbols as sym_System_System } from "./System/System";

// ───────── System.Classes ─────────
import { symbols as sym_SystemClasses_SystemClasses } from "./System.Classes/System.Classes";
import { symbols as sym_SystemClasses_TObject } from "./System.Classes/TObject";
import { symbols as sym_SystemClasses_TPersistent } from "./System.Classes/TPersistent";

// ───────── XML ─────────
import { symbols as sym_XML_IXMLNode } from "./XML/IXMLNode";
import { symbols as sym_XML_IXMLNodeList } from "./XML/IXMLNodeList";
import { symbols as sym_XML_TXMLDocument } from "./XML/TXMLDocument";
import { symbols as sym_XML_XML } from "./XML/XML";

export const SYSTEM_SYMBOLS: SymbolInfo[] = [
  // Collections
  ...sym_Collections_Collections,
  ...sym_Collections_StringList,
  ...sym_Collections_TStrings,
  ...sym_Collections_TStringList,
  // Data7
  ...sym_Data7_CodEmpresa,
  ...sym_Data7_CodFilial,
  ...sym_Data7_CodPeriodoCaixa,
  ...sym_Data7_CodUsuario,
  ...sym_Data7_Criptografar,
  ...sym_Data7_Data7,
  ...sym_Data7_Report,
  ...sym_Data7_Descriptografar,
  ...sym_Data7_NomeArquivoExecutavel,
  ...sym_Data7_NomeUsuario,
  ...sym_Data7_Parametro,
  ...sym_Data7_PesquisaPadrao,
  ...sym_Data7_ProximoCodigo,
  ...sym_Data7_ProximoID,
  ...sym_Data7_ValorPorExtenso,
  ...sym_Data7_ValorPorExtensoLinha1,
  ...sym_Data7_ValorPorExtensoLinha2,
  // Drawing
  ...sym_Drawing_Drawing,
  ...sym_Drawing_TCanvas,
  ...sym_Drawing_TPen,
  ...sym_Drawing_TBrushStyle,
  ...sym_Drawing_TPenStyle,
  // Environment
  ...sym_Environment_Environment,
  ...sym_Environment_Execute,
  ...sym_Environment_MachineName,
  ...sym_Environment_UserName,
  // Forms — trunks
  ...sym_Forms_TComponent,
  ...sym_Forms_TControl,
  ...sym_Forms_TGraphicControl,
  ...sym_Forms_TShape,
  ...sym_Forms_TWinControl,
  ...sym_Forms_TScrollingWinControl,
  ...sym_Forms_TForm,
  ...sym_Forms_TFrame,
  ...sym_Forms_TButtonControl,
  ...sym_Forms_TCustomControl,
  ...sym_Forms_TcxCustomEdit,
  ...sym_Forms_TcxCustomTextEdit,
  ...sym_Forms_TCustomEdit,
  ...sym_Forms_TCustomButtonedEdit,
  ...sym_Forms_TButtonedEdit,
  // Forms — utility
  ...sym_Forms_Forms,
  ...sym_Forms_MessageBox,
  ...sym_Forms_ProcessMessages,
  ...sym_Forms_TAlign,
  ...sym_Forms_TAlignment,
  ...sym_Forms_TMargins,
  // Forms — type aliases & intermediate classes
  ...sym_Forms_aliases,
  // Forms — enum types & constants
  ...sym_Forms_TShiftState,
  ...sym_Forms_TModalResult,
  ...sym_Forms_TFormBorderStyle,
  ...sym_Forms_TBorderStyle,
  ...sym_Forms_TDefaultMonitor,
  ...sym_Forms_TFormStyle,
  ...sym_Forms_TPopupMode,
  ...sym_Forms_TPosition,
  ...sym_Forms_TPrintScale,
  ...sym_Forms_TRoundedCornerType,
  ...sym_Forms_TEditorType,
  ...sym_Forms_TGridDrawState,
  // Forms — interfaces / event types / grid-related
  ...sym_Forms_IFormVisualManager,
  ...sym_Forms_TMonitorDpiChangedEvent,
  ...sym_Forms_TCloseEvent,
  ...sym_Forms_TCloseQueryEvent,
  ...sym_Forms_GridConfigs,
  ...sym_Forms_TEditLink,
  ...sym_Forms_GridEditorLink,
  ...sym_Forms_gridEvents,
  ...sym_Forms_gridTypes,
  // Forms — bevel / shape / state / anchor / progress / bidi
  ...sym_Forms_TBevelShape,
  ...sym_Forms_TBevelStyle,
  ...sym_Forms_TBevelKind,
  ...sym_Forms_TShapeType,
  ...sym_Forms_TWindowState,
  ...sym_Forms_TAnchorKind,
  ...sym_Forms_TBorderIcon,
  ...sym_Forms_TCloseAction,
  ...sym_Forms_TLabelPosition,
  ...sym_Forms_TProgressBarOrientation,
  ...sym_Forms_TProgressBarState,
  ...sym_Forms_TProgressBarStyle,
  ...sym_Forms_TBiDiMode,
  // Forms — visual leaves
  ...sym_Forms_Form,
  ...sym_Forms_FormButtons,
  ...sym_Forms_Topbar,
  ...sym_Forms_Calendar,
  ...sym_Forms_PageControl,
  ...sym_Forms_TabSheet,
  ...sym_Forms_Panel,
  ...sym_Forms_CustomControl,
  ...sym_Forms_ControlGroup,
  ...sym_Forms_Grid,
  ...sym_Forms_Imagem,
  ...sym_Forms_Rectangle,
  ...sym_Forms_Ellipse,
  ...sym_Forms_Line,
  ...sym_Forms_Border,
  ...sym_Forms_FlatButton,
  ...sym_Forms_CommandButton,
  ...sym_Forms_ButtonOk,
  ...sym_Forms_ButtonCancel,
  ...sym_Forms_ProgressBar,
  ...sym_Forms_Timer,
  ...sym_Forms_StaticText,
  ...sym_Forms_TBoundLabel,
  ...sym_Forms_TLabeledEdit,
  ...sym_Forms_TextBox,
  ...sym_Forms_PasswordTextBox,
  ...sym_Forms_DateTextBox,
  ...sym_Forms_NumberTextBox,
  ...sym_Forms_ValueTextBox,
  ...sym_Forms_MemoTextBox,
  ...sym_Forms_SearchTextBox,
  ...sym_Forms_ButtonTextBox,
  ...sym_Forms_HComboBox,
  ...sym_Forms_CheckBox,
  // Globals
  ...sym_Globals_alBottom,
  ...sym_Globals_alClient,
  ...sym_Globals_alLeft,
  ...sym_Globals_alNone,
  ...sym_Globals_alRight,
  ...sym_Globals_alTop,
  ...sym_Globals_Base64ToFile,
  ...sym_Globals_CDbl,
  ...sym_Globals_Char,
  ...sym_Globals_CInt,
  ...sym_Globals_CStr,
  ...sym_Globals_DateTime,
  ...sym_Globals_FileToBase64,
  ...sym_Globals_InStr,
  ...sym_Globals_LCase,
  ...sym_Globals_Left,
  ...sym_Globals_Mid,
  ...sym_Globals_RGB,
  ...sym_Globals_Space,
  ...sym_Globals_taCenter,
  ...sym_Globals_taLeftJustify,
  ...sym_Globals_taRightJustify,
  ...sym_Globals_THTTP,
  ...sym_Globals_Timer,
  ...sym_Globals_TJSONArray,
  ...sym_Globals_TJSONObject,
  ...sym_Globals_TLSv1,
  ...sym_Globals_TLSv1_1,
  ...sym_Globals_TLSv1_2,
  ...sym_Globals_TLSv1_3,
  ...sym_Globals_TObject,
  ...sym_Globals_TPersistent,
  ...sym_Globals_TryStrToInt,
  ...sym_Globals_UCase,
  ...sym_Globals_ZipFile,
  // Globals — tipos comuns Delphi
  ...sym_Globals_TColor,
  ...sym_Globals_TCursor,
  ...sym_Globals_TPoint,
  ...sym_Globals_TRect,
  ...sym_Globals_TFontStyle,
  ...sym_Globals_TMouseButton,
  ...sym_Globals_TNotifyEvent,
  ...sym_Globals_TMouseEvent,
  ...sym_Globals_TKeyEvent,
  ...sym_Globals_TKeyPressEvent,
  ...sym_Globals_eventTypes,
  // IO
  ...sym_IO_Directory,
  ...sym_IO_File,
  ...sym_IO_IO,
  // Net
  ...sym_Net_Net,
  ...sym_Net_TFTP,
  // Primitives
  ...sym_Primitives_Primitive,
  ...sym_Primitives_Boolean,
  ...sym_Primitives_Double,
  ...sym_Primitives_Extended,
  ...sym_Primitives_Integer,
  ...sym_Primitives_Single,
  ...sym_Primitives_String,
  ...sym_Primitives_TDateTime,
  // SQL
  ...sym_SQL_Command,
  ...sym_SQL_Connection,
  ...sym_SQL_SQL,
  ...sym_SQL_TFDParam,
  ...sym_SQL_TField,
  ...sym_SQL_aliases,
  // System
  ...sym_System_IOUtils,
  ...sym_System_System,
  // System.Classes
  ...sym_SystemClasses_SystemClasses,
  ...sym_SystemClasses_TObject,
  ...sym_SystemClasses_TPersistent,
  // XML
  ...sym_XML_IXMLNode,
  ...sym_XML_IXMLNodeList,
  ...sym_XML_TXMLDocument,
  ...sym_XML_XML,
];

// -----------------------------------------------------------------------------
// Pre-built lookup indexes.
//
// Iterating SYSTEM_SYMBOLS with `.find/.filter/.some` per provider invocation
// is quadratic on the keystroke hot path (performance.mdc). These maps are built
// once at module load and reused for the lifetime of the extension.
// -----------------------------------------------------------------------------

const byNameLower = new Map<string, SymbolInfo[]>();
const byContainerLower = new Map<string, SymbolInfo[]>();
const classesByNameLower = new Map<string, SymbolInfo[]>();
const namespacesAndClassesByNameLower = new Map<string, SymbolInfo[]>();

for (const symbol of SYSTEM_SYMBOLS) {
  const nameLower = symbol.name.toLowerCase();
  const bucket = byNameLower.get(nameLower);
  if (bucket) bucket.push(symbol);
  else byNameLower.set(nameLower, [symbol]);

  if (symbol.containerName) {
    const containerLower = symbol.containerName.toLowerCase();
    const cBucket = byContainerLower.get(containerLower);
    if (cBucket) cBucket.push(symbol);
    else byContainerLower.set(containerLower, [symbol]);
  }

  if (symbol.kind === "class") {
    const cls = classesByNameLower.get(nameLower);
    if (cls) cls.push(symbol);
    else classesByNameLower.set(nameLower, [symbol]);
  }
  if (symbol.kind === "namespace" || symbol.kind === "class") {
    const nc = namespacesAndClassesByNameLower.get(nameLower);
    if (nc) nc.push(symbol);
    else namespacesAndClassesByNameLower.set(nameLower, [symbol]);
  }
}

/** O(1) lookup of system symbols by simple name. Returns an empty array when not found. */
export function lookupSystemByName(name: string): readonly SymbolInfo[] {
  return byNameLower.get(name.toLowerCase()) ?? [];
}

/** O(1) lookup of system symbols by `containerName`. Returns an empty array when not found. */
export function lookupSystemByContainer(containerName: string): readonly SymbolInfo[] {
  return byContainerLower.get(containerName.toLowerCase()) ?? [];
}

/** O(1) lookup of `kind === 'class'` system symbols by simple name. */
export function lookupSystemClassByName(name: string): readonly SymbolInfo[] {
  return classesByNameLower.get(name.toLowerCase()) ?? [];
}

/** O(1) lookup of `kind === 'class' | 'namespace'` system symbols by simple name. */
export function lookupSystemNamespaceOrClassByName(name: string): readonly SymbolInfo[] {
  return namespacesAndClassesByNameLower.get(name.toLowerCase()) ?? [];
}
