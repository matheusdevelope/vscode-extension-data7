import "../../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { uglifyBuildModules } from "../../../project/optimizer";

describe("uglifyBuildModules", () => {
  test("is a no-op when disabled", () => {
    const code = `
Namespace App
  Class TApp
    Public Sub Run()
    End Sub
  End Class
End Namespace
`;
    const result = uglifyBuildModules(
      [{ moduleName: "Principal", fileUri: "Principal.bas", code }],
      { enabled: false },
    );
    assert.equal(result.modules.get("Principal"), code);
  });

  test("renames user namespaces, types, members and locals to short names", () => {
    const result = uglifyBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "Principal.bas",
          code: `
Namespace App
  Class TApp
    Public Sub Run()
      Dim counter As Integer = 1
      System.Console.WriteLine(counter)
    End Sub
  End Class
End Namespace

Sub Main()
  Dim instance As New App.TApp()
  instance.Run()
End Sub
`,
        },
      ],
      { enabled: true },
    );

    const principal = result.modules.get("Principal") ?? "";
    assert.doesNotMatch(principal, /\bNamespace App\b/);
    assert.doesNotMatch(principal, /\bClass TApp\b/);
    assert.doesNotMatch(principal, /\bSub Run\b/);
    assert.doesNotMatch(principal, /\bDim counter\b/i);
    assert.doesNotMatch(principal, /\bDim instance\b/i);
    assert.match(principal, /\bSub Main\b/i);
    assert.match(principal, /System\.Console\.WriteLine/i);
    // Short names: single letter namespace/type/member/locals.
    assert.match(principal, /\bNamespace [a-z]\b/);
    assert.match(principal, /\bClass [a-z]\b/);
  });

  test("preserves System Library member names and keep-name declarations", () => {
    const result = uglifyBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "Principal.bas",
          code: `
Namespace App
  Class TApp
    ' @data7:keep-name
    Public Sub PublicApi()
      Dim form As New Forms.TForm()
      form.Show()
    End Sub

    Public Sub InternalHelper()
    End Sub
  End Class
End Namespace

Sub Main()
  Dim app As New App.TApp()
  app.PublicApi()
  app.InternalHelper()
End Sub
`,
        },
      ],
      { enabled: true },
    );

    const principal = result.modules.get("Principal") ?? "";
    assert.match(principal, /\bSub PublicApi\b/i);
    assert.doesNotMatch(principal, /\bSub InternalHelper\b/i);
    assert.match(principal, /\.Show\s*\(/i);
    assert.match(principal, /Forms\.TForm/i);
  });

  test("keeps New and Free method names", () => {
    const result = uglifyBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "Principal.bas",
          code: `
Namespace App
  Class TApp
    Public Sub New()
    End Sub
    Public Sub Free()
    End Sub
    Public Sub Run()
    End Sub
  End Class
End Namespace

Sub Main()
  Dim app As New App.TApp()
  app.Run()
  app.Free()
End Sub
`,
        },
      ],
      { enabled: true },
    );

    const principal = result.modules.get("Principal") ?? "";
    assert.match(principal, /\bSub New\b/i);
    assert.match(principal, /\bSub Free\b/i);
    assert.doesNotMatch(principal, /\bSub Run\b/);
  });

  test("renames bare delegate/param invokes and type-cast calls", () => {
    const result = uglifyBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "Principal.bas",
          code: `
Namespace App
  Delegate Function FindDel(item As TTObject, index As Integer, extra As Variant) As Boolean

  Class TTObject
    Public Function ToString() As String
      Return "x"
    End Function
  End Class

  Class TList
    Public Function IndexOf(pHandler As FindDel, extra As Variant) As Integer
      If pHandler(Me, 0, extra) Then
        Return 1
      End If
      Return -1
    End Function

    Private Sub TriggerEvent(pMethod As FindDel, pDelegate As FindDel)
      If pMethod <> Null Then pMethod(Me, 0, Null)
      If pDelegate <> Null Then pDelegate(Me, 0, Null)
    End Sub

    Public Function Describe(item As Variant) As String
      Dim text As String = TTObject(item).ToString()
      Return text
    End Function
  End Class
End Namespace

Sub Main()
End Sub
`,
        },
      ],
      { enabled: true },
    );

    const principal = result.modules.get("Principal") ?? "";
    assert.doesNotMatch(principal, /\bpHandler\b/i);
    assert.doesNotMatch(principal, /\bpMethod\b/i);
    assert.doesNotMatch(principal, /\bpDelegate\b/i);
    assert.doesNotMatch(principal, /\bTTObject\s*\(/i);
    assert.doesNotMatch(principal, /\bClass TTObject\b/i);
    // Cast-like call and class declaration share the same short type name.
    assert.match(principal, /\bClass [a-z0-9]+\b/i);
  });

  test("renames types used in MemberAccess chains (Namespace.Type.Member)", () => {
    const result = uglifyBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "Principal.bas",
          code: `
Namespace App
  Class CrossFacade
    Public Shared Sub Helper()
    End Sub
  End Class

  Class Entry
    Public Sub Run()
      CrossFacade.Helper()
    End Sub
  End Class
End Namespace

Sub Main()
  Dim f As New App.Entry()
  f.Run()
  App.CrossFacade.Helper()
End Sub
`,
        },
      ],
      { enabled: true },
    );

    const principal = result.modules.get("Principal") ?? "";
    assert.doesNotMatch(principal, /\bCrossFacade\b/);
    assert.doesNotMatch(principal, /\bHelper\b/);
    assert.doesNotMatch(principal, /\bNamespace App\b/);
  });

  test("renames locals even when the name collides with a System Library member", () => {
    const result = uglifyBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "Principal.bas",
          code: `
Namespace App
  Structure LivePoint
    X As Integer
    Y As Integer
  End Structure

  Class TApp
    Public Sub Run()
      Dim pt As LivePoint
      pt.X = 1
      pt.Y = 2
    End Sub
  End Class
End Namespace

Sub Main()
  Dim app As New App.TApp()
  app.Run()
End Sub
`,
        },
      ],
      { enabled: true },
    );

    const principal = result.modules.get("Principal") ?? "";
    assert.doesNotMatch(principal, /\bDim pt\b/i);
    // User structure fields named X/Y are renamed when the receiver is the user type.
    assert.doesNotMatch(principal, /\.X\s*=/);
    assert.doesNotMatch(principal, /\.Y\s*=/);
  });

  test("renames delegate parameter names in signatures", () => {
    const result = uglifyBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "Principal.bas",
          code: `
Namespace App
  Delegate Sub LiveNotifyDel(pMessage As String)
End Namespace

Sub Main()
End Sub
`,
        },
      ],
      { enabled: true },
    );

    const principal = result.modules.get("Principal") ?? "";
    assert.doesNotMatch(principal, /\bpMessage\b/i);
  });

  test("renames user methods that collide with System Library when receiver is a user type", () => {
    const result = uglifyBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "Principal.bas",
          code: `
Class GlobalLiveClass
  Sub Touch()
  End Sub
End Class

Sub Main()
  Dim g As New GlobalLiveClass()
  g.Touch()
End Sub
`,
        },
      ],
      { enabled: true },
    );

    const principal = result.modules.get("Principal") ?? "";
    assert.doesNotMatch(principal, /\bSub Touch\b/i);
    assert.doesNotMatch(principal, /\.Touch\s*\(/i);
  });

  test("renames colliding members on top-level Dim receivers (Principal seed pattern)", () => {
    const result = uglifyBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "Principal.bas",
          code: `
Class GlobalLiveClass
  Sub Touch()
  End Sub
End Class

Dim g As New GlobalLiveClass()
g.Touch()
`,
        },
      ],
      { enabled: true },
    );

    const principal = result.modules.get("Principal") ?? "";
    assert.doesNotMatch(principal, /\bSub Touch\b/i);
    assert.doesNotMatch(principal, /\.Touch\s*\(/i);
  });

  test("renames Select Case labels (Type.SharedMethod and enum-style helpers)", () => {
    const result = uglifyBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "Principal.bas",
          code: `
Namespace mod_card
  Class CardAdm
    Shared Function Stone() As CardAdm
    End Function
    Shared Function Load(pValue As String) As CardAdm
    End Function
  End Class

  Class CardGroupersStone
    Shared Function BandeiraProduto() As CardGroupersStone
    End Function
    Shared Function DataPagamento() As CardGroupersStone
    End Function
    Shared Function Load(pValue As String) As CardGroupersStone
    End Function
    Shared Function LoadGrouper(pName As String) As Integer
      Select Case CardGroupersStone.Load(pName)
        Case CardGroupersStone.BandeiraProduto()
          LoadGrouper = 1
          Exit Function
        Case CardGroupersStone.DataPagamento()
          LoadGrouper = 2
          Exit Function
        Case Else
          LoadGrouper = 0
      End Select
    End Function
  End Class

  Function Pick(pAdm As CardAdm) As Integer
    Select Case pAdm
      Case CardAdm.Stone()
        Pick = 1
      Case Else
        Pick = 0
    End Select
  End Function
End Namespace

Sub Main()
  Dim n As Integer = mod_card.CardGroupersStone.LoadGrouper("x")
  n = mod_card.Pick(mod_card.CardAdm.Stone())
End Sub
`,
        },
      ],
      { enabled: true },
    );

    const principal = result.modules.get("Principal") ?? "";
    assert.doesNotMatch(principal, /\bCardGroupersStone\b/);
    assert.doesNotMatch(principal, /\bBandeiraProduto\b/i);
    assert.doesNotMatch(principal, /\bDataPagamento\b/i);
    assert.doesNotMatch(principal, /\bCardAdm\b/);
    assert.doesNotMatch(principal, /\bStone\s*\(/i);
  });

  test("renames Namespace.Type.collidingMember() using the type as receiver", () => {
    const result = uglifyBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "Principal.bas",
          code: `
Namespace mod_card
  Class CardGroupersStone
    Shared Function GetOptions() As String
      GetOptions = "a"
    End Function
  End Class
End Namespace

Sub Main()
  Dim s As String = mod_card.CardGroupersStone.GetOptions()
End Sub
`,
        },
      ],
      { enabled: true },
    );

    const principal = result.modules.get("Principal") ?? "";
    assert.doesNotMatch(principal, /\bGetOptions\s*\(/i);
    assert.doesNotMatch(principal, /\bCardGroupersStone\b/);
  });

  test("prefers nested class rename over an unrelated Property with the same name", () => {
    const result = uglifyBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "Principal.bas",
          code: `
Class WinAPI
  Class Window
    Shared Function GetForeground() As Long
      GetForeground = 1
    End Function
  End Class
  Class Screen
    Shared Function CurrentWindow() As Integer
      CurrentWindow = WinAPI.Window.GetForeground()
    End Function
  End Class
End Class

Class TSchema
  Property Window As Integer
    Get
      Window = 0
    End Get
  End Property
End Class

Sub Main()
  Dim s As TSchema
  Dim x As Integer = s.Window
  x = WinAPI.Screen.CurrentWindow()
End Sub
`,
        },
      ],
      { enabled: true },
    );

    const principal = result.modules.get("Principal") ?? "";
    assert.doesNotMatch(principal, /\bWinAPI\.Window\b/i);
    assert.doesNotMatch(principal, /\.Window\.GetForeground\b/i);
    // Nested class declaration name (first Class after outer) must appear in the call chain.
    const nestedClass = principal.match(
      /Class\s+(\w+)\s*\r?\n\s*Class\s+(\w+)\s*\r?\n\s*Shared Function\s+(\w+)/i,
    );
    assert.ok(nestedClass?.[1] && nestedClass[2] && nestedClass[3], "expected nested Window class");
    const [, outerName, nestedName, methodName] = nestedClass;
    assert.match(principal, new RegExp(`${outerName}\\.${nestedName}\\.${methodName}\\s*\\(`, "i"));
    // Instance property `s.Window` must not use the nested class short name.
    const propAccess = principal.match(/Dim\s+(\w+)\s+As\s+\w+[\s\S]*?\1\.(\w+)/i);
    assert.ok(propAccess?.[2], "expected instance property access");
    assert.notEqual(propAccess[2].toLowerCase(), nestedName.toLowerCase());
  });

  test("does not rewrite late-bound COM members using a user method rename", () => {
    const result = uglifyBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "Principal.bas",
          code: `
Class WinAPI
  Shared Sub SendKeys(pKeys As String)
  End Sub
End Class

Sub Main()
  Dim shell As Variant = CreateObject("WScript.Shell")
  shell.SendKeys("%{F4}")
  WinAPI.SendKeys("%{F4}")
End Sub
`,
        },
      ],
      { enabled: true },
    );

    const principal = result.modules.get("Principal") ?? "";
    // Local `shell` may be uglified; COM member name must stay SendKeys.
    assert.match(principal, /\w+\.SendKeys\s*\(/i);
    assert.doesNotMatch(principal, /\bWinAPI\.SendKeys\b/i);
  });

  test("renames Namespace.TopLevelMember calls and field access", () => {
    const result = uglifyBuildModules(
      [
        {
          moduleName: "mod_console",
          fileUri: "mod_console.bas",
          code: `
Namespace console
  Dim AlwaysPrint As Boolean = False
  Private Sub Printe(pMessage As String)
    print(pMessage)
  End Sub
  Sub log(pMessage As Variant)
    console.Printe(CStr(pMessage))
  End Sub
  Sub dump()
    If console.AlwaysPrint Then
      console.Printe("x")
    End If
  End Sub
End Namespace
`,
        },
      ],
      { enabled: true },
    );

    const out = result.modules.get("mod_console") ?? "";
    assert.match(out, /\bprint\s*\(/i, "global Print must stay");
    assert.doesNotMatch(out, /\bconsole\.Printe\b/i);
    assert.doesNotMatch(out, /\bconsole\.AlwaysPrint\b/i);
    assert.doesNotMatch(out, /\.Printe\s*\(/i);
    assert.doesNotMatch(out, /\.AlwaysPrint\b/i);
  });

  test("keeps System Library member names on system-typed receivers", () => {
    const result = uglifyBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "Principal.bas",
          code: `
Class GlobalLiveClass
  Sub Touch()
  End Sub
End Class

Structure LivePoint
  X As Integer
  Y As Integer
End Structure

Sub Main()
  Dim g As New GlobalLiveClass()
  g.Touch()
  Dim c As TControl
  c.Touch()
  Dim p As TPoint
  p.X = 1
End Sub
`,
        },
      ],
      { enabled: true },
    );

    const principal = result.modules.get("Principal") ?? "";
    assert.doesNotMatch(principal, /\bSub Touch\b/i);
    // System-typed receivers keep native member names.
    assert.match(principal, /As TControl[\s\S]*\.Touch\s*\(/);
    assert.match(principal, /As TPoint[\s\S]*\.X\s*=/);
  });

  test("renames VB-style function/property return assignments to the uglified routine name", () => {
    const result = uglifyBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "Principal.bas",
          code: `
Namespace App
  Class TBag
    Private _text As String

    Public Function Text() As String
      Text = me._text
    End Function

    Public Function IndexOf(value As String) As Integer
      IndexOf = 0
      If value = "" Then
        IndexOf = -1
      End If
    End Function

    Public Property Name As String
      Get
        Name = me._text
      End Get
      Set
        me._text = Value
      End Set
    End Property
  End Class
End Namespace

Sub Main()
End Sub
`,
        },
      ],
      { enabled: true },
    );

    const principal = result.modules.get("Principal") ?? "";
    assert.doesNotMatch(principal, /^\s*Text\s*=/m);
    assert.doesNotMatch(principal, /^\s*IndexOf\s*=/m);
    assert.doesNotMatch(principal, /^\s*Name\s*=/m);
    assert.doesNotMatch(principal, /\bFunction Text\b/i);
    assert.doesNotMatch(principal, /\bFunction IndexOf\b/i);
    assert.doesNotMatch(principal, /\bProperty Name\b/i);
  });

  test("renames With-scoped .Member / .Method() using the With target type", () => {
    const result = uglifyBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "Principal.bas",
          code: `
Namespace App
  Class TTObjectPrinter
    Public Sub Close()
    End Sub
    Public Function Text() As String
      Text = ""
    End Function
  End Class

  Class TBag
    Public Function ToString() As String
      With New TTObjectPrinter()
        .Close()
        ToString = .Text
      End With
    End Function
  End Class
End Namespace

Sub Main()
End Sub
`,
        },
      ],
      { enabled: true },
    );

    const principal = result.modules.get("Principal") ?? "";
    assert.doesNotMatch(principal, /\.Close\s*\(/);
    assert.doesNotMatch(principal, /\bSub Close\b/i);
    // `.Text` on user printer should be renamed too when Text is a user member.
    assert.doesNotMatch(principal, /\.Text\b/);
  });

  test("renames With Namespace.Fn() members using the function return type", () => {
    const result = uglifyBuildModules(
      [
        {
          moduleName: "mod_console",
          fileUri: "mod_console.bas",
          code: `
Namespace console
  Function Block(pTitle As String) As ObjectPrinter
    Block = New ObjectPrinter(pTitle)
  End Function
  Class ObjectPrinter
    Sub Prop(pValue As Variant)
    End Sub
    Sub Close()
    End Sub
  End Class
End Namespace
`,
        },
        {
          moduleName: "mod_base_list",
          fileUri: "mod_base_list.bas",
          code: `
Imports console
Namespace lists
  Class BaseList
    Function ToString() As String
      With console.Block(me.Name)
        .Prop("x")
        .Close()
      End With
      ToString = ""
    End Function
  End Class
End Namespace
`,
        },
      ],
      { enabled: true },
    );

    const list = result.modules.get("mod_base_list") ?? "";
    assert.doesNotMatch(list, /\.Prop\s*\(/);
    assert.doesNotMatch(list, /\.Close\s*\(/);
  });

  test("does not merge homonymous classes from different namespaces (AsString on BaseEnum field)", () => {
    const result = uglifyBuildModules(
      [
        {
          moduleName: "mod_enum",
          fileUri: "mod_enum.bas",
          code: `
Namespace mod_enum
  Class BaseEnum
    Protected _value As Integer
    Property AsString As String
      Get
        AsString = ""
      End Get
    End Property
  End Class
  Class TEnum
    Private _value As BaseEnum
    Property AsOption As String
      Get
        AsOption = me._value.AsString
      End Get
    End Property
  End Class
End Namespace
`,
        },
        {
          moduleName: "mod_tenum",
          fileUri: "mod_tenum.bas",
          code: `
Namespace mod_tenum
  Class TEnum
    Private _value As Integer
    Property AsInteger As Integer
      Get
        AsInteger = me._value
      End Get
    End Property
  End Class
End Namespace
`,
        },
      ],
      { enabled: true },
    );

    const enumMod = result.modules.get("mod_enum") ?? "";
    assert.doesNotMatch(enumMod, /\.AsString\b/);
  });

  test("renames members on bare namespace function return (GetDefault().Printe)", () => {
    const result = uglifyBuildModules(
      [
        {
          moduleName: "mod_logger",
          fileUri: "mod_logger.bas",
          code: `
Namespace mod_logger
  Class Logger
    Sub Printe(pMessage As Variant)
    End Sub
  End Class
  Private Dim _defaultLogger As Logger
  Function GetDefault() As Logger
    GetDefault = _defaultLogger
  End Function
  Sub Printe(pMessage As Variant)
    GetDefault().Printe(pMessage)
  End Sub
End Namespace
`,
        },
      ],
      { enabled: true },
    );

    const out = result.modules.get("mod_logger") ?? "";
    assert.doesNotMatch(out, /GetDefault\(\)\.Printe\b/);
    assert.doesNotMatch(out, /\)\.Printe\s*\(/);
  });

  test("resolves zero-arg Last() return type when Last(n) overload exists (Fields.Last().Options)", () => {
    const result = uglifyBuildModules(
      [
        {
          moduleName: "mod_fields",
          fileUri: "mod_fields.bas",
          code: `
Namespace fields
  Class TField
    Property Options As TOptionList
      Get
      End Get
    End Property
  End Class
  Class TOptionList
    Sub Add(pValue As String)
    End Sub
  End Class
  Class TFieldList
    Function Last() As TField
    End Function
    Function Last(pLimit As Integer) As TFieldList
    End Function
  End Class
  Class CardSchema
    Fields As TFieldList = New TFieldList()
    Sub Init()
      me.Fields.Last().Options.Add("x")
    End Sub
  End Class
End Namespace
`,
        },
      ],
      { enabled: true },
    );

    const out = result.modules.get("mod_fields") ?? "";
    assert.doesNotMatch(out, /\.Options\.Add\b/);
  });

  test("resolves With me.BaseMethod() return type via Inherits for .Member renames", () => {
    const result = uglifyBuildModules(
      [
        {
          moduleName: "Principal",
          fileUri: "Principal.bas",
          code: `
Namespace App
  Class Printer
    Public Function Text() As String
      Text = "x"
    End Function
  End Class

  Class Base
    Public Function BuildLogger() As Printer
      BuildLogger = New Printer()
    End Function
  End Class

  Class Derived
    Inherits Base
    Public Function ToString() As String
      With me.BuildLogger()
        ToString = .Text()
      End With
    End Function
  End Class
End Namespace

Sub Main()
End Sub
`,
        },
      ],
      { enabled: true },
    );

    const principal = result.modules.get("Principal") ?? "";
    assert.doesNotMatch(principal, /\.Text\s*\(/);
    assert.doesNotMatch(principal, /\bFunction Text\b/i);
  });

  test("aborts renaming when any module fails to parse", () => {
    const good = `
Namespace App
  Class TApp
    Public Sub Run()
    End Sub
  End Class
End Namespace
`;
    const bad = `Namespace Broken\n  Class !!!\n`;
    const result = uglifyBuildModules(
      [
        { moduleName: "Principal", fileUri: "Principal.bas", code: good },
        { moduleName: "Broken", fileUri: "Broken.bas", code: bad },
      ],
      { enabled: true },
    );
    assert.equal(result.modules.get("Principal"), good);
    assert.equal(result.modules.get("Broken"), bad);
  });
});
