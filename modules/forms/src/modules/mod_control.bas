
Imports Forms
Imports mod_base_list

Namespace mod_control

   Class Control
      Inherits BaseItem

      Protected _id As String
      Protected _control As TWinControl
      Controls As ControlList

      Sub New(pControl As TWinControl, pID As String = "", pAlign As TAlign = alNone)
         MyBase.New()
         me._id = pID
         If me._id = "" Then
            me._id = CStr(me.GetHashCode)
         End If
         me._control = pControl
         me._control.Align = pAlign
         me._control.TabStop = False
         me.Controls = New ControlList()
      End Sub

      Sub New(pValue As Control)
         MyBase.New()
         If pValue <> NULL Then
            me.Fill(pValue)
         End If
      End Sub

      Property AsControl As TWinControl
         Get
            AsControl = me._control
         End Get
      End Property

      Property AsContainer As CustomControl
         Get
            AsContainer = CustomControl(me._control)
         End Get
      End Property

      Property AsPage As PageControl
         Get
            AsPage = PageControl(me._control)
         End Get
      End Property

      Property AsPanel As Panel
         Get
            AsPanel = Panel(me._control)
         End Get
      End Property

      Property AsTab As TabSheet
         Get
            AsTab = TabSheet(me._control)
         End Get
      End Property

      Property AsForm As Form
         Get
            AsForm = Form(me._control)
         End Get
      End Property

      Property AsFormButtons As FormButtons
         Get
            AsFormButtons = FormButtons(me._control)
         End Get
      End Property

      Shared Function BuildContainer(pControl As TWinControl, pID As String, pAlign As TAlign) As Control
         BuildContainer = New Control(New CustomControl(pControl), pID, pAlign)
      End Function

      Shared Function BuildPage(pControl As TWinControl, pID As String, pAlign As TAlign) As Control
         BuildPage = New Control(New PageControl(pControl), pID, pAlign)
      End Function

      Shared Function BuildPanel(pControl As TWinControl, pID As String, pAlign As TAlign) As Control
         BuildPanel = New Control(New Panel(pControl), pID, pAlign)
      End Function

      Shared Function BuildTab(pControl As TWinControl, pID As String, pAlign As TAlign) As Control
         BuildTab = New Control(New TabSheet(pControl), pID, pAlign)
      End Function

      Shared Function BuildForm(pID As String, pAlign As TAlign) As Control
         BuildForm = New Control(New Form(), pID, pAlign)
      End Function

      Shared Function BuildFormButtons(pID As String, pAlign As TAlign) As Control
         BuildFormButtons = New Control(New FormButtons(), pID)
      End Function

      Sub SetMargins(pValue As Integer)
         me.SetMargins(pValue, pValue, pValue, pValue)
      End Sub

      Sub SetMargins(pMargins As TMargins)
         me.SetMargins(pMargins.Left, pMargins.Top, pMargins.Right, pMargins.Bottom)
      End Sub

      Sub SetMargins(pLeft As Integer, pTop As Integer, pRight As Integer, pBottom As Integer)
         me._control.AlignWithMargins = True
         With me._control.Margins
            .Left = pLeft
            .Top = pTop
            .Right = pRight
            .Bottom = pBottom
         End With
      End Sub

      Sub SetMarginsHorizontal(pLeft As Integer, pRight As Integer)
         me.SetMargins(pLeft, me._control.Margins.Top, pRight, me._control.Margins.Bottom)
      End Sub

      Sub SetMarginsVertical(pTop As Integer, pBottom As Integer)
         me.SetMargins(me._control.Margins.Left, pTop, me._control.Margins.Right, pBottom)
      End Sub

      Sub Fill(pValue As Control)
         If pValue = NULL Then
            Exit Sub
         End If
         With pValue
            me._id = .GetID()
            me._control = .AsControl
         End With
      End Sub

      Overrides Function Copy() As Control
         Copy = New Control(me)
      End Function

      Overrides Function GetID() As String
         GetID = me._id
      End Function

      Overrides Function ToString(pPrint As Boolean = False) As String
         With console.Block("Control")
            .Prop("ID", me.GetID())
            .Close()
            .Printe(pPrint)
            ToString = .Text
            .Free()
         End With
      End Function

      Overrides Sub Dispose()
         If me.Controls <> NULL Then
            me.Controls.Free()
         End If
      End Sub

      Sub Free()
         me.Dispose()
         MyBase.Free()
      End Sub

   End Class

   Class ControlList
      Inherits BaseList

      Sub New()
         MyBase.New("Control", True)
      End Sub

      Property Item(pIndex As Integer) As Control
         Get
            Item = CType(MyBase.Item(pIndex), Control)
         End Get
         Set(pValue As Control)
            me.SetItem(pIndex, pValue)
         End Set
      End Property

      Function Take(pIndex As Integer) As Control
         Take = CType(MyBase.Take(pIndex), Control)
      End Function

      Function Take(pID As String) As Control
         Take = CType(MyBase.TakeFromId(pID), Control)
      End Function

      Function First() As Control
         First = CType(MyBase.First, Control)
      End Function

      Function First(pLimit As Integer) As Control
         First = CType(MyBase.Range(pLimit, False), Control)
      End Function

      Function Last() As Control
         Last = CType(MyBase.Last, Control)
      End Function

      Function Last(pLimit As Integer) As Control
         Last = CType(MyBase.Range(pLimit, True), Control)
      End Function

      Function Copy() As Control
         Copy = CType(MyBase.Copy(), Control)
      End Function

      Public Sub Free()
         MyBase.Free()
      End Sub

   End Class

End Namespace