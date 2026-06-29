
Imports Forms
Imports Collections
Imports mod_labeled_container
Imports mod_buttonedtextbox
Imports System.Classes


Namespace mod_base_editor

   Class TBaseEditor
      Inherits TLabeledContainer

      Property Text As String
         Get
            Text = me.GetText()
         End Get
         Set(pValue As String)
            me.SetText(pValue)
         End Set
      End Property

      Property AsString As String
         Get
            AsString = me.GetAsString()
         End Get
         Set(pValue As String)
            me.SetAsString(pValue)
         End Set
      End Property

      Property AsInteger As Integer
         Get
            AsInteger = me.GetAsInteger()
         End Get
         Set(pValue As Integer)
            me.SetAsInteger(pValue)
         End Set
      End Property

      Property AsDouble As Decimal
         Get
            AsDouble = me.GetAsDouble()
         End Get
         Set(pValue As Decimal)
            me.SetAsDouble(pValue)
         End Set
      End Property

      Property AsDate As TDateTime
         Get
            AsDate = me.GetAsDate()
         End Get
         Set(pValue As TDateTime)
            me.SetAsDate(pValue)
         End Set
      End Property

      Property AsBoolean As Boolean
         Get
            AsBoolean = me.GetAsBoolean()
         End Get
         Set(pValue As Boolean)
            me.SetAsBoolean(pValue)
         End Set
      End Property

      Property Editor As TcxCustomEdit
         Get
            Editor = me.GetEditor()
         End Get
      End Property

      Property IsTextBox As Boolean
         Get
            IsTextBox = TypeOf(me.Editor) Is TextBox
         End Get
      End Property

      Property AsTextBox As TextBox
         Get
            AsTextBox = CType(me.Editor, TextBox)
         End Get
      End Property

      Property IsPasswordTextBox As Boolean
         Get
            IsPasswordTextBox = TypeOf(me.Editor) Is PasswordTextBox
         End Get
      End Property

      Property AsPasswordTextBox As PasswordTextBox
         Get
            AsPasswordTextBox = CType(me.Editor, PasswordTextBox)
         End Get
      End Property

      Property IsMaskTextBox As Boolean
         Get
            IsMaskTextBox = TypeOf(me.Editor) Is MaskTextBox
         End Get
      End Property

      Property AsMaskTextBox As MaskTextBox
         Get
            AsMaskTextBox = CType(me.Editor, MaskTextBox)
         End Get
      End Property

      Property IsMemoTextBox As Boolean
         Get
            IsMemoTextBox = TypeOf(me.Editor) Is MemoTextBox
         End Get
      End Property

      Property AsMemoTextBox As MemoTextBox
         Get
            AsMemoTextBox = CType(me.Editor, MemoTextBox)
         End Get
      End Property

      Property IsValueTextBox As Boolean
         Get
            IsValueTextBox = TypeOf(me.Editor) Is ValueTextBox
         End Get
      End Property

      Property AsValueTextBox As ValueTextBox
         Get
            AsValueTextBox = CType(me.Editor, ValueTextBox)
         End Get
      End Property

      Property IsSearchTextBox As Boolean
         Get
            IsSearchTextBox = TypeOf(me.Editor) Is SearchTextBox
         End Get
      End Property

      Property AsSearchTextBox As SearchTextBox
         Get
            AsSearchTextBox = CType(me.Editor, SearchTextBox)
         End Get
      End Property

      Property IsHComboBox As Boolean
         Get
            IsHComboBox = TypeOf(me.Editor) Is HComboBox
         End Get
      End Property

      Property AsHComboBox As HComboBox
         Get
            AsHComboBox = CType(me.Editor, HComboBox)
         End Get
      End Property

      Property IsCheckBox As Boolean
         Get
            IsCheckBox = TypeOf(me.Editor) Is CheckBox
         End Get
      End Property

      Property AsCheckBox As CheckBox
         Get
            AsCheckBox = CType(me.Editor, CheckBox)
         End Get
      End Property

      Property IsDateTextBox As Boolean
         Get
            IsDateTextBox = TypeOf(me.Editor) Is DateTextBox
         End Get
      End Property

      Property AsDateTextBox As DateTextBox
         Get
            AsDateTextBox = CType(me.Editor, DateTextBox)
         End Get
      End Property

      Property IsButtonedTextBox As Boolean
         Get
            IsButtonedTextBox = TypeOf(me.Editor) Is ButtonedTextBox
         End Get
      End Property

      Property AsButtonedTextBox As ButtonedTextBox
         Get
            AsButtonedTextBox = ButtonedTextBox(me.Editor)
         End Get
      End Property

      Property Name As String
         Get
            Name = me.GetName()
         End Get
         Set(pValue As String)
            me.SetName(pValue)
         End Set
      End Property

      Protected Overridable Function GetName() As String
         GetName = me.Editor.Name
      End Function

      Protected Overridable Sub SetName(pValue As String)
         me.Editor.Name = pValue
      End Sub

      Property Align As TAlign
         Get
            Align = me.GetAlign()
         End Get
         Set(pValue As TAlign)
            me.SetAlign(pValue)
         End Set
      End Property

      Protected Overridable Function GetAlign() As TAlign
         GetAlign = me.Control.Align
      End Function

      Protected Overridable Sub SetAlign(pValue As TAlign)
         me.Control.Align = pValue
      End Sub

      Property AlignWithMargins As Boolean
         Get
            AlignWithMargins = me.GetAlignWithMargins()
         End Get
         Set(pValue As Boolean)
            me.SetAlignWithMargins(pValue)
         End Set
      End Property

      Protected Overridable Function GetAlignWithMargins() As Boolean
         GetAlignWithMargins = me.Control.AlignWithMargins
      End Function

      Protected Overridable Sub SetAlignWithMargins(pValue As Boolean)
         me.Control.AlignWithMargins = pValue
      End Sub

      Property Left As Integer
         Get
            Left = me.GetLeft()
         End Get
         Set(pValue As Integer)
            me.SetLeft(pValue)
         End Set
      End Property

      Protected Overridable Function GetLeft() As Integer
         GetLeft = me.Control.Left
      End Function

      Protected Overridable Sub SetLeft(pValue As Integer)
         me.Control.Left = pValue
      End Sub

      Property Top As Integer
         Get
            Top = me.GetTop()
         End Get
         Set(pValue As Integer)
            me.SetTop(pValue)
         End Set
      End Property

      Protected Overridable Function GetTop() As Integer
         GetTop = me.Control.Top
      End Function

      Protected Overridable Sub SetTop(pValue As Integer)
         me.Control.Top = pValue
      End Sub

      Property Height As Integer
         Get
            Height = me.GetHeight()
         End Get
         Set(pValue As Integer)
            me.SetHeight(pValue)
         End Set
      End Property

      Protected Overridable Function GetHeight() As Integer
         GetHeight = me.Control.Height
      End Function

      Protected Overridable Sub SetHeight(pValue As Integer)
         me.Control.Height = pValue
      End Sub

      Property Width As Integer
         Get
            Width = me.GetWidth()
         End Get
         Set(pValue As Integer)
            me.SetWidth(pValue)
         End Set
      End Property


      Protected Overridable Function GetWidth() As Integer
         GetWidth = me.Control.Width
      End Function

      Protected Overridable Sub SetWidth(pValue As Integer)
         me.Control.Width = pValue
      End Sub

      Property Hint As String
         Get
            Hint = me.GetHint()
         End Get
         Set(pValue As String)
            me.SetHint(pValue)
         End Set
      End Property

      Protected Overridable Function GetHint() As String
         GetHint = me.Control.Hint
      End Function

      Protected Overridable Sub SetHint(pValue As String)
         me.Control.ShowHint = True
         me.Control.Hint = pValue
      End Sub

      Property Ajuda As String
         Get
            Ajuda = me.GetAjuda()
         End Get
         Set(pValue As String)
            me.SetAjuda(pValue)
         End Set
      End Property

      Protected Overridable Function GetAjuda() As String
         GetAjuda = ""
      End Function

      Protected Overridable Sub SetAjuda(pValue As String)
      End Sub

      Property Mascara As String
         Get
            Mascara = me.GetMascara()
         End Get
         Set(pValue As String)
            me.SetMascara(pValue)
         End Set
      End Property

      Protected Overridable Function GetMascara() As String
         GetMascara = ""
      End Function

      Protected Overridable Sub SetMascara(pValue As String)
      End Sub

      Property Enabled As Boolean
         Get
            Enabled = me.GetEnabled()
         End Get
         Set(pValue As Boolean)
            me.SetEnabled(pValue)
         End Set
      End Property

      Protected Overridable Function GetEnabled() As Boolean
         GetEnabled = me.Control.Enabled
      End Function

      Protected Overridable Sub SetEnabled(pValue As Boolean)
         me.Control.Enabled = pValue
      End Sub

      Property Visible As Boolean
         Get
            Visible = me.GetVisible()
         End Get
         Set(pValue As Boolean)
            me.SetVisible(pValue)
         End Set
      End Property

      Protected Overridable Function GetVisible() As Boolean
         GetVisible = me.Control.Visible
      End Function

      Protected Overridable Sub SetVisible(pValue As Boolean)
         me.Control.Visible = pValue
      End Sub

      Property OnlyRead As Boolean
         Get
            OnlyRead = me.GetOnlyRead()
         End Get
         Set(pValue As Boolean)
            me.SetOnlyRead(pValue)
         End Set
      End Property

      Protected Overridable Function GetOnlyRead() As Boolean
         Throw New Exception("Not implemented")
      End Function

      Protected Overridable Sub SetOnlyRead(pValue As Boolean)
         Throw New Exception("Not implemented")
      End Sub

      Property TabStop As Boolean
         Get
            TabStop = me.GetTabStop()
         End Get
         Set(pValue As Boolean)
            me.SetTabStop(pValue)
         End Set
      End Property

      Protected Overridable Function GetTabStop() As Boolean
         GetTabStop = me.Editor.TabStop
      End Function

      Protected Overridable Sub SetTabStop(pValue As Boolean)
         me.Editor.TabStop = pValue
      End Sub

      Property TabOrder As Integer
         Get
            TabOrder = me.GetTabOrder()
         End Get
         Set(pValue As Integer)
            me.SetTabOrder(pValue)
         End Set
      End Property

      Protected Overridable Function GetTabOrder() As Integer
         Throw New Exception("Not implemented")
      End Function

      Protected Overridable Sub SetTabOrder(pValue As Integer)
         Throw New Exception("Not implemented")
      End Sub

      Property Modified As Boolean
         Get
            Modified = me.GetModified()
         End Get
         Set(pValue As Boolean)
            me.SetModified(pValue)
         End Set
      End Property

      Protected Overridable Function GetModified() As Boolean
         GetModified = me.Editor.EditModified
      End Function

      Protected Overridable Sub SetModified(pValue As Boolean)
         me.Editor.EditModified = pValue
      End Sub

      Property IsFocused As Boolean
         Get
            IsFocused = me.GetIsFocused()
         End Get
      End Property

      Protected Overridable Function GetIsFocused() As Boolean
         GetIsFocused = me.Editor.IsFocused
      End Function

      Property OnFocusChanged As TNotifyEvent
         Get
            OnFocusChanged = me.GetOnFocusChanged()
         End Get
         Set(pValue As TNotifyEvent)
            me.SetOnFocusChanged(pValue)
         End Set
      End Property

      Protected Overridable Function GetOnFocusChanged() As TNotifyEvent
         GetOnFocusChanged = me.Editor.OnFocusChanged
      End Function

      Protected Overridable Sub SetOnFocusChanged(pValue As TNotifyEvent)
         me.Editor.OnFocusChanged = pValue
      End Sub

      Property OnChange As TNotifyEvent
         Get
            OnChange = me.GetOnChange()
         End Get
         Set(pValue As TNotifyEvent)
            me.SetOnChange(pValue)
         End Set
      End Property

      Protected Overridable Function GetOnChange() As TNotifyEvent
         Throw New Exception("Not implemented")
      End Function

      Protected Overridable Sub SetOnChange(pValue As TNotifyEvent)
         Throw New Exception("Not implemented")
      End Sub

      Property OnClick As TNotifyEvent
         Get
            OnClick = me.GetOnClick()
         End Get
         Set(pValue As TNotifyEvent)
            me.SetOnClick(pValue)
         End Set
      End Property

      Protected Overridable Function GetOnClick() As TNotifyEvent
         Throw New Exception("Not implemented")
      End Function

      Protected Overridable Sub SetOnClick(pValue As TNotifyEvent)
         Throw New Exception("Not implemented")
      End Sub

      Property OnDblClick As TNotifyEvent
         Get
            OnDblClick = me.GetOnDblClick()
         End Get
         Set(pValue As TNotifyEvent)
            me.SetOnDblClick(pValue)
         End Set
      End Property

      Protected Overridable Function GetOnDblClick() As TNotifyEvent
         Throw New Exception("Not implemented")
      End Function

      Protected Overridable Sub SetOnDblClick(pValue As TNotifyEvent)
         Throw New Exception("Not implemented")
      End Sub

      Property OnEnter As TNotifyEvent
         Get
            OnEnter = me.GetOnEnter()
         End Get
         Set(pValue As TNotifyEvent)
            me.SetOnEnter(pValue)
         End Set
      End Property

      Protected Overridable Function GetOnEnter() As TNotifyEvent
         Throw New Exception("Not implemented")
      End Function

      Protected Overridable Sub SetOnEnter(pValue As TNotifyEvent)
         Throw New Exception("Not implemented")
      End Sub

      Property OnExit As TNotifyEvent
         Get
            OnExit = me.GetOnExit()
         End Get
         Set(pValue As TNotifyEvent)
            me.SetOnExit(pValue)
         End Set
      End Property

      Protected Overridable Function GetOnExit() As TNotifyEvent
         Throw New Exception("Not implemented")
      End Function

      Protected Overridable Sub SetOnExit(pValue As TNotifyEvent)
         Throw New Exception("Not implemented")
      End Sub

      Property OnValidate As TNotifyEvent
         Get
            OnValidate = me.GetOnValidate()
         End Get
         Set(pValue As TNotifyEvent)
            me.SetOnValidate(pValue)
         End Set
      End Property

      Protected Overridable Function GetOnValidate() As TNotifyEvent
         Throw New Exception("Not implemented")
      End Function

      Protected Overridable Sub SetOnValidate(pValue As TNotifyEvent)
         Throw New Exception("Not implemented")
      End Sub

      Sub New(pControl As Forms.TWinControl, pLabel As String)
         MyBase.New(pControl, pLabel)
         me.Build()
      End Sub

      Protected Overridable Sub Build()
         Throw New Exception("You cannot instantiate the base editor directly, use a descendant")
      End Sub

      Overridable Sub SetFocus()
         Throw New Exception("Not implemented")
      End Sub

      Protected Overridable Function GetEditor() As TcxCustomEdit
         Throw New Exception("Not implemented")
      End Function

      Protected Overridable Function GetText() As String
         Throw New Exception("Not implemented")
      End Function

      Protected Overridable Sub SetText(pValue As String)
         Throw New Exception("Not implemented")
      End Sub

      Protected Overridable Function GetAsString() As String
         GetAsString = me.Text
      End Function

      Protected Overridable Sub SetAsString(pValue As String)
         me.Text = pValue
      End Sub

      Protected Overridable Function GetAsInteger() As Integer
         Throw New Exception("Not supported")
      End Function

      Protected Overridable Sub SetAsInteger(pValue As Integer)
         Throw New Exception("Not supported")
      End Sub

      Protected Overridable Function GetAsDouble() As Double
         Throw New Exception("Not supported")
      End Function

      Protected Overridable Sub SetAsDouble(pValue As Double)
         Throw New Exception("Not supported")
      End Sub

      Protected Overridable Function GetAsDate() As TDateTime
         Throw New Exception("Not supported")
      End Function

      Protected Overridable Sub SetAsDate(pValue As TDateTime)
         Throw New Exception("Not supported")
      End Sub

      Protected Overridable Function GetAsBoolean() As Boolean
         Throw New Exception("Not supported")
      End Function

      Protected Overridable Sub SetAsBoolean(pValue As Boolean)
         Throw New Exception("Not supported")
      End Sub

      Sub Free()
         MyBase.Free()
      End Sub

   End Class

   Class TContaineEditor
      Inherits TBaseEditor

      Sub New(pControl As Forms.TWinControl, pLabel As String)
         MyBase.New(pControl, pLabel)
      End Sub

      Private Overrides Sub Build()
         me.Container.Align = alTop
         me.Container.Height = 19
      End Sub

      Private Overrides Function GetEditor() As TcxCustomEdit
      End Function

      Sub Free()
         MyBase.Free()
      End Sub

   End Class

   Class TTextEditor
      Inherits TBaseEditor

      Protected _edit As TextBox

      Sub New(pControl As Forms.TWinControl, pLabel As String)
         MyBase.New(pControl, pLabel)
      End Sub

      Private Overrides Sub Build()
         me._edit = New TextBox(me._container)
         me._edit.Align = alTop
      End Sub

      Private Overrides Function GetAjuda() As String
         GetAjuda = me._edit.Ajuda
      End Function

      Private Overrides Sub SetAjuda(pValue As String)
         me._edit.Ajuda = pValue
      End Sub

      Private Overrides Function GetOnlyRead() As Boolean
         GetOnlyRead = me._edit.ReadOnly
      End Function

      Private Overrides Sub SetOnlyRead(pValue As Boolean)
         me._edit.ReadOnly = pValue
      End Sub

      Private Overrides Function GetTabOrder() As Integer
         GetTabOrder = me._edit.TabOrder
      End Function

      Private Overrides Sub SetTabOrder(pValue As Integer)
         me._edit.TabOrder = pValue
      End Sub

      Private Overrides Function GetOnChange() As TNotifyEvent
         GetOnChange = me._edit.OnChange
      End Function

      Private Overrides Sub SetOnChange(pValue As TNotifyEvent)
         me._edit.OnChange = pValue
      End Sub

      Private Overrides Function GetOnClick() As TNotifyEvent
         GetOnClick = me._edit.OnClick
      End Function

      Private Overrides Sub SetOnClick(pValue As TNotifyEvent)
         me._edit.OnClick = pValue
      End Sub

      Private Overrides Function GetOnDblClick() As TNotifyEvent
         GetOnDblClick = me._edit.OnDblClick
      End Function

      Private Overrides Sub SetOnDblClick(pValue As TNotifyEvent)
         me._edit.OnDblClick = pValue
      End Sub

      Private Overrides Function GetOnEnter() As TNotifyEvent
         GetOnEnter = me._edit.OnEnter
      End Function

      Private Overrides Sub SetOnEnter(pValue As TNotifyEvent)
         me._edit.OnEnter = pValue
      End Sub

      Private Overrides Function GetOnExit() As TNotifyEvent
         GetOnExit = me._edit.OnExit
      End Function

      Private Overrides Sub SetOnExit(pValue As TNotifyEvent)
         me._edit.OnExit = pValue
      End Sub

      Private Overrides Function GetEditor() As TcxCustomEdit
         GetEditor = me._edit
      End Function

      Private Overrides Function GetText() As String
         GetText = me._edit.Text
      End Function

      Private Overrides Sub SetText(pValue As String)
         me._edit.Text = pValue
      End Sub

      Sub Free()
         MyBase.Free()
      End Sub

   End Class

   Class TPasswordEditor
      Inherits TBaseEditor

      Protected _edit As PasswordTextBox

      Sub New(pControl As Forms.TWinControl, pLabel As String)
         MyBase.New(pControl, pLabel)
      End Sub

      Private Overrides Sub Build()
         me._edit = New PasswordTextBox(me._container)
         me._edit.Align = alTop
      End Sub

      Private Overrides Function GetAjuda() As String
         GetAjuda = me._edit.Ajuda
      End Function

      Private Overrides Sub SetAjuda(pValue As String)
         me._edit.Ajuda = pValue
      End Sub

      Private Overrides Function GetOnlyRead() As Boolean
         GetOnlyRead = me._edit.ReadOnly
      End Function

      Private Overrides Sub SetOnlyRead(pValue As Boolean)
         me._edit.ReadOnly = pValue
      End Sub

      Private Overrides Function GetTabOrder() As Integer
         GetTabOrder = me._edit.TabOrder
      End Function

      Private Overrides Sub SetTabOrder(pValue As Integer)
         me._edit.TabOrder = pValue
      End Sub

      Private Overrides Function GetOnChange() As TNotifyEvent
         GetOnChange = me._edit.OnChange
      End Function

      Private Overrides Sub SetOnChange(pValue As TNotifyEvent)
         me._edit.OnChange = pValue
      End Sub

      Private Overrides Function GetOnClick() As TNotifyEvent
         GetOnClick = me._edit.OnClick
      End Function

      Private Overrides Sub SetOnClick(pValue As TNotifyEvent)
         me._edit.OnClick = pValue
      End Sub

      Private Overrides Function GetOnDblClick() As TNotifyEvent
         GetOnDblClick = me._edit.OnDblClick
      End Function

      Private Overrides Sub SetOnDblClick(pValue As TNotifyEvent)
         me._edit.OnDblClick = pValue
      End Sub

      Private Overrides Function GetOnEnter() As TNotifyEvent
         GetOnEnter = me._edit.OnEnter
      End Function

      Private Overrides Sub SetOnEnter(pValue As TNotifyEvent)
         me._edit.OnEnter = pValue
      End Sub

      Private Overrides Function GetOnExit() As TNotifyEvent
         GetOnExit = me._edit.OnExit
      End Function

      Private Overrides Sub SetOnExit(pValue As TNotifyEvent)
         me._edit.OnExit = pValue
      End Sub

      Private Overrides Function GetEditor() As TcxCustomEdit
         GetEditor = me._edit
      End Function

      Private Overrides Function GetText() As String
         GetText = me._edit.Text
      End Function

      Private Overrides Sub SetText(pValue As String)
         me._edit.Text = pValue
      End Sub

      Sub Free()
         MyBase.Free()
      End Sub

   End Class

   Class TMaskEditor
      Inherits TBaseEditor

      Protected _edit As MaskTextBox

      Sub New(pControl As Forms.TWinControl, pLabel As String)
         MyBase.New(pControl, pLabel)
      End Sub

      Private Overrides Sub Build()
         me._edit = New MaskTextBox(me._container)
         me._edit.Align = alTop
      End Sub

      Private Overrides Function GetAjuda() As String
         GetAjuda = me._edit.Ajuda
      End Function

      Private Overrides Sub SetAjuda(pValue As String)
         me._edit.Ajuda = pValue
      End Sub

      Private Overrides Function GetOnlyRead() As Boolean
         GetOnlyRead = me._edit.ReadOnly
      End Function

      Private Overrides Sub SetOnlyRead(pValue As Boolean)
         me._edit.ReadOnly = pValue
      End Sub

      Private Overrides Function GetTabOrder() As Integer
         GetTabOrder = me._edit.TabOrder
      End Function

      Private Overrides Sub SetTabOrder(pValue As Integer)
         me._edit.TabOrder = pValue
      End Sub

      Private Overrides Function GetOnChange() As TNotifyEvent
         GetOnChange = me._edit.OnChange
      End Function

      Private Overrides Sub SetOnChange(pValue As TNotifyEvent)
         me._edit.OnChange = pValue
      End Sub

      Private Overrides Function GetOnClick() As TNotifyEvent
         GetOnClick = me._edit.OnClick
      End Function

      Private Overrides Sub SetOnClick(pValue As TNotifyEvent)
         me._edit.OnClick = pValue
      End Sub

      Private Overrides Function GetOnDblClick() As TNotifyEvent
         GetOnDblClick = me._edit.OnDblClick
      End Function

      Private Overrides Sub SetOnDblClick(pValue As TNotifyEvent)
         me._edit.OnDblClick = pValue
      End Sub

      Private Overrides Function GetOnEnter() As TNotifyEvent
         GetOnEnter = me._edit.OnEnter
      End Function

      Private Overrides Sub SetOnEnter(pValue As TNotifyEvent)
         me._edit.OnEnter = pValue
      End Sub

      Private Overrides Function GetOnExit() As TNotifyEvent
         GetOnExit = me._edit.OnExit
      End Function

      Private Overrides Sub SetOnExit(pValue As TNotifyEvent)
         me._edit.OnExit = pValue
      End Sub

      Private Overrides Function GetEditor() As TcxCustomEdit
         GetEditor = me._edit
      End Function

      Private Overrides Function GetText() As String
         GetText = me._edit.Text
      End Function

      Private Overrides Sub SetText(pValue As String)
         me._edit.Text = pValue
      End Sub

      Private Overrides Function GetMascara() As String
         GetMascara = me._edit.Mascara
      End Function

      Private Overrides Sub SetMascara(pValue As String)
         me._edit.Mascara = pValue
         print "aquii:" & pValue
      End Sub

      Sub Free()
         MyBase.Free()
      End Sub

   End Class

   Class TMemoEditor
      Inherits TBaseEditor

      Protected _edit As MemoTextBox

      Sub New(pControl As Forms.TWinControl, pLabel As String)
         MyBase.New(pControl, pLabel)
      End Sub

      Private Overrides Sub Build()
         me.Control.Height = 70
         me.Container.Margins.Bottom = 0
         me._edit = New MemoTextBox(me.Container)
         me._edit.Align = alclient
      End Sub

      Private Overrides Function GetAjuda() As String
         GetAjuda = me._edit.Ajuda
      End Function

      Private Overrides Sub SetAjuda(pValue As String)
         me._edit.Ajuda = pValue
      End Sub

      Private Overrides Function GetOnlyRead() As Boolean
         GetOnlyRead = me._edit.ReadOnly
      End Function

      Private Overrides Sub SetOnlyRead(pValue As Boolean)
         me._edit.ReadOnly = pValue
      End Sub

      Private Overrides Function GetTabOrder() As Integer
         GetTabOrder = me._edit.TabOrder
      End Function

      Private Overrides Sub SetTabOrder(pValue As Integer)
         me._edit.TabOrder = pValue
      End Sub

      Private Overrides Function GetOnChange() As TNotifyEvent
         GetOnChange = me._edit.OnChange
      End Function

      Private Overrides Sub SetOnChange(pValue As TNotifyEvent)
         me._edit.OnChange = pValue
      End Sub

      Private Overrides Function GetOnClick() As TNotifyEvent
         GetOnClick = me._edit.OnClick
      End Function

      Private Overrides Sub SetOnClick(pValue As TNotifyEvent)
         me._edit.OnClick = pValue
      End Sub

      Private Overrides Function GetOnDblClick() As TNotifyEvent
         GetOnDblClick = me._edit.OnDblClick
      End Function

      Private Overrides Sub SetOnDblClick(pValue As TNotifyEvent)
         me._edit.OnDblClick = pValue
      End Sub

      Private Overrides Function GetOnEnter() As TNotifyEvent
         GetOnEnter = me._edit.OnEnter
      End Function

      Private Overrides Sub SetOnEnter(pValue As TNotifyEvent)
         me._edit.OnEnter = pValue
      End Sub

      Private Overrides Function GetOnExit() As TNotifyEvent
         GetOnExit = me._edit.OnExit
      End Function

      Private Overrides Sub SetOnExit(pValue As TNotifyEvent)
         me._edit.OnExit = pValue
      End Sub

      Private Overrides Function GetEditor() As TcxCustomEdit
         GetEditor = me._edit
      End Function

      Private Overrides Function GetText() As String
         GetText = me._edit.Lines.Text
      End Function

      Private Overrides Sub SetText(pValue As String)
         me._edit.Lines.Text = pValue
      End Sub

      Sub Free()
         MyBase.Free()
      End Sub

   End Class

   Class TValueEditor
      Inherits TBaseEditor

      Protected _edit As ValueTextBox

      Property DecimalPlaces As Integer
         Get
            DecimalPlaces = me._edit.DecimalPlaces
         End Get
         Set(pValue As Integer)
            me.SetDecimalPlaces(pValue)
         End Set
      End Property

      Property DisplayFormat As String
         Get
            DisplayFormat = me._edit.DisplayFormat
         End Get
         Set(pValue As String)
            me.SetDisplayFormat(pValue)
         End Set
      End Property

      Sub New(pControl As Forms.TWinControl, pLabel As String)
         MyBase.New(pControl, pLabel)
      End Sub

      Private Overrides Sub Build()
         me._edit = New ValueTextBox(me._container)
         me._edit.Align = alTop
      End Sub

      Private Overrides Function GetAjuda() As String
         GetAjuda = me._edit.Ajuda
      End Function

      Private Overrides Sub SetAjuda(pValue As String)
         me._edit.Ajuda = pValue
      End Sub

      Private Overrides Function GetOnlyRead() As Boolean
         GetOnlyRead = me._edit.ReadOnly
      End Function

      Private Overrides Sub SetOnlyRead(pValue As Boolean)
         me._edit.ReadOnly = pValue
      End Sub

      Private Overrides Function GetTabOrder() As Integer
         GetTabOrder = me._edit.TabOrder
      End Function

      Private Overrides Sub SetTabOrder(pValue As Integer)
         me._edit.TabOrder = pValue
      End Sub

      Private Overrides Function GetOnChange() As TNotifyEvent
         GetOnChange = me._edit.OnChange
      End Function

      Private Overrides Sub SetOnChange(pValue As TNotifyEvent)
         me._edit.OnChange = pValue
      End Sub

      Private Overrides Function GetOnClick() As TNotifyEvent
         GetOnClick = me._edit.OnClick
      End Function

      Private Overrides Sub SetOnClick(pValue As TNotifyEvent)
         me._edit.OnClick = pValue
      End Sub

      Private Overrides Function GetOnDblClick() As TNotifyEvent
         GetOnDblClick = me._edit.OnDblClick
      End Function

      Private Overrides Sub SetOnDblClick(pValue As TNotifyEvent)
         me._edit.OnDblClick = pValue
      End Sub

      Private Overrides Function GetOnEnter() As TNotifyEvent
         GetOnEnter = me._edit.OnEnter
      End Function

      Private Overrides Sub SetOnEnter(pValue As TNotifyEvent)
         me._edit.OnEnter = pValue
      End Sub

      Private Overrides Function GetOnExit() As TNotifyEvent
         GetOnExit = me._edit.OnExit
      End Function

      Private Overrides Sub SetOnExit(pValue As TNotifyEvent)
         me._edit.OnExit = pValue
      End Sub

      Private Overrides Function GetEditor() As TcxCustomEdit
         GetEditor = me._edit
      End Function

      Private Overrides Function GetText() As String
         If me._edit.DecimalPlaces = 0 Then
            GetText = CStr(me.AsInteger)
         Else
            GetText = CStr(me.AsDouble)
         End If
      End Function

      Private Overrides Sub SetText(pValue As String)
         me.AsDouble = CDbl(pValue)
      End Sub

      Private Overrides Function GetAsInteger() As Integer
         GetAsInteger = me._edit.AsInteger
      End Function

      Private Overrides Sub SetAsInteger(pValue As Integer)
         me._edit.AsInteger = pValue
      End Sub

      Private Overrides Function GetAsDouble() As Double
         GetAsDouble = me._edit.AsFloat
      End Function

      Private Overrides Sub SetAsDouble(pValue As Double)
         me._edit.AsFloat = pValue
      End Sub

      Private Sub SetDecimalPlaces(pValue As Integer)
         me._edit.DecimalPlaces = pValue
      End Sub

      Private Sub SetDisplayFormat(pValue As String)
         me._edit.DisplayFormat = pValue
      End Sub

      Sub Free()
         MyBase.Free()
      End Sub

   End Class

   Class TIntegerEditor
      Inherits TValueEditor

      Sub New(pControl As Forms.TWinControl, pLabel As String)
         MyBase.New(pControl, pLabel)
         me.DecimalPlaces = 0
      End Sub

      Sub Free()
         MyBase.Free()
      End Sub

   End Class

   Class TSearchEditor
      Inherits TBaseEditor

      Protected _edit As SearchTextBox

      Property CodPesquisa As Integer
         Get
            CodPesquisa = me._edit.CodPesquisa
         End Get
         Set(pValue As Integer)
            me.SetCodPesquisa(pValue)
         End Set
      End Property

      Property Descricao As String
         Get
            Descricao = me._edit.EditorDescricao.Lines.Text
         End Get
         Set(pValue As String)
            me.SetDescricao(pValue)
         End Set
      End Property

      Sub New(pControl As Forms.TWinControl, pLabel As String)
         MyBase.New(pControl, pLabel)
      End Sub

      Private Overrides Sub Build()
         me._edit = New SearchTextBox(me._container)
         me._edit.Align = alLeft
         me._edit.EditorDescricao = New MemoTextBox(me._container)
         me._edit.EditorDescricao.Align = alClient
      End Sub

      Private Overrides Function GetAjuda() As String
         GetAjuda = me._edit.Ajuda
      End Function

      Private Overrides Sub SetAjuda(pValue As String)
         me._edit.Ajuda = pValue
      End Sub

      Private Overrides Function GetOnlyRead() As Boolean
         GetOnlyRead = me._edit.ReadOnly
      End Function

      Private Overrides Sub SetOnlyRead(pValue As Boolean)
         me._edit.ReadOnly = pValue
      End Sub

      Private Overrides Function GetTabOrder() As Integer
         GetTabOrder = me._edit.TabOrder
      End Function

      Private Overrides Sub SetTabOrder(pValue As Integer)
         me._edit.TabOrder = pValue
      End Sub

      Private Overrides Function GetOnChange() As TNotifyEvent
         GetOnChange = me._edit.OnChange
      End Function

      Private Overrides Sub SetOnChange(pValue As TNotifyEvent)
         me._edit.OnChange = pValue
      End Sub

      Private Overrides Function GetOnClick() As TNotifyEvent
         GetOnClick = me._edit.OnClick
      End Function

      Private Overrides Sub SetOnClick(pValue As TNotifyEvent)
         me._edit.OnClick = pValue
      End Sub

      Private Overrides Function GetOnDblClick() As TNotifyEvent
         GetOnDblClick = me._edit.OnDblClick
      End Function

      Private Overrides Sub SetOnDblClick(pValue As TNotifyEvent)
         me._edit.OnDblClick = pValue
      End Sub

      Private Overrides Function GetOnEnter() As TNotifyEvent
         GetOnEnter = me._edit.OnEnter
      End Function

      Private Overrides Sub SetOnEnter(pValue As TNotifyEvent)
         me._edit.OnEnter = pValue
      End Sub

      Private Overrides Function GetOnExit() As TNotifyEvent
         GetOnExit = me._edit.OnExit
      End Function

      Private Overrides Sub SetOnExit(pValue As TNotifyEvent)
         me._edit.OnExit = pValue
      End Sub

      Private Overrides Function GetEditor() As TcxCustomEdit
         GetEditor = me._edit
      End Function

      Private Overrides Function GetText() As String
         GetText = me._edit.AsString
      End Function

      Private Overrides Sub SetText(pValue As String)
         me._edit.AsString = pValue
      End Sub

      Private Overrides Function GetAsInteger() As Integer
         GetAsInteger = me._edit.AsInteger
      End Function

      Private Overrides Sub SetAsInteger(pValue As Integer)
         me._edit.AsInteger = pValue
      End Sub

      Private Sub SetCodPesquisa(pValue As Integer)
         me._edit.CodPesquisa = pValue
      End Sub

      Private Sub SetDescricao(pValue As String)
         me._edit.EditorDescricao.Lines.Text = pValue
      End Sub

      Sub Free()
         MyBase.Free()
      End Sub

   End Class

   Class TComboEditor
      Inherits TBaseEditor

      Protected _edit As HComboBox

      Property ListaOpcoes As String
         Get
            ListaOpcoes = me._edit.ListaOpcoes
         End Get
         Set(pValue As String)
            me.SetListaOpcoes(pValue)
         End Set
      End Property

      Property ValueList As TStringList
         Get
            ValueList = me._edit.ValueList
         End Get
         Set(pValue As TStringList)
            me.SetValueList(pValue)
         End Set
      End Property

      Property ValueSelect As String
         Get
            ValueSelect = me._edit.ValueSelect
         End Get
         Set(pValue As String)
            me.SetValueSelect(pValue)
         End Set
      End Property

      Property SelectedItem As Integer
         Get
            SelectedItem = me._edit.SelectedItem
         End Get
         Set(pValue As Integer)
            me.SetSelectedItem(pValue)
         End Set
      End Property

      Property ItemIndex As Integer
         Get
            ItemIndex = me._edit.ItemIndex
         End Get
         Set(pValue As Integer)
            me.SetItemIndex(pValue)
         End Set
      End Property

      Property NameSelect As String
         Get
            If me._edit.Items <> NULL Then
               If me._edit.Items.Count > 0 And me._edit.SelectedItem >= 0 And me._edit.SelectedItem < me._edit.Items.Count Then
                  NameSelect = me._edit.Items.Strings(me._edit.SelectedItem)
               End If
            End If
         End Get
      End Property

      Property Items As TStrings
         Get
            Items = me._edit.Items
         End Get
         Set(pValue As TStrings)
            me.SetItems(pValue)
         End Set
      End Property

      Sub New(pControl As Forms.TWinControl, pLabel As String)
         MyBase.New(pControl, pLabel)
      End Sub

      Overrides Sub SetFocus()
         me._edit.SetFocus()
      End Sub

      Private Overrides Sub Build()
         me._edit = New HComboBox(me._container)
         me._edit.Align = alTop
      End Sub

      Private Overrides Function GetAjuda() As String
         GetAjuda = me._edit.Ajuda
      End Function

      Private Overrides Sub SetAjuda(pValue As String)
         me._edit.Ajuda = pValue
      End Sub

      Private Overrides Function GetOnlyRead() As Boolean
         GetOnlyRead = me._edit.ReadOnly
      End Function

      Private Overrides Sub SetOnlyRead(pValue As Boolean)
         me._edit.ReadOnly = pValue
      End Sub

      Private Overrides Function GetTabOrder() As Integer
         GetTabOrder = me._edit.TabOrder
      End Function

      Private Overrides Sub SetTabOrder(pValue As Integer)
         me._edit.TabOrder = pValue
      End Sub

      Private Overrides Function GetOnChange() As TNotifyEvent
         GetOnChange = me._edit.OnChange
      End Function

      Private Overrides Sub SetOnChange(pValue As TNotifyEvent)
         me._edit.OnChange = pValue
      End Sub

      Private Overrides Function GetOnClick() As TNotifyEvent
         GetOnClick = me._edit.OnClick
      End Function

      Private Overrides Sub SetOnClick(pValue As TNotifyEvent)
         me._edit.OnClick = pValue
      End Sub

      Private Overrides Function GetOnDblClick() As TNotifyEvent
         GetOnDblClick = me._edit.OnDblClick
      End Function

      Private Overrides Sub SetOnDblClick(pValue As TNotifyEvent)
         me._edit.OnDblClick = pValue
      End Sub

      Private Overrides Function GetOnEnter() As TNotifyEvent
         GetOnEnter = me._edit.OnEnter
      End Function

      Private Overrides Sub SetOnEnter(pValue As TNotifyEvent)
         me._edit.OnEnter = pValue
      End Sub

      Private Overrides Function GetOnExit() As TNotifyEvent
         GetOnExit = me._edit.OnExit
      End Function

      Private Overrides Sub SetOnExit(pValue As TNotifyEvent)
         me._edit.OnExit = pValue
      End Sub

      Private Overrides Function GetEditor() As TcxCustomEdit
         GetEditor = me._edit
      End Function

      Private Overrides Function GetText() As String
         GetText = me._edit.ValueSelect
      End Function

      Private Overrides Sub SetText(pValue As String)
         me._edit.ValueSelect = pValue
      End Sub

      Private Sub SetListaOpcoes(pValue As String)
         me._edit.ListaOpcoes = pValue
      End Sub

      Private Sub SetValueList(pValue As TStringList)
         me._edit.ValueList.Text = pValue.Text
      End Sub

      Private Sub SetValueSelect(pValue As String)
         me._edit.ValueSelect = pValue
      End Sub

      Private Sub SetSelectedItem(pValue As Integer)
         me._edit.SelectedItem = pValue
      End Sub

      Private Sub SetItemIndex(pValue As Integer)
         me._edit.ItemIndex = pValue
      End Sub

      Private Sub SetItems(pValue As TStrings)
         me._edit.Items = pValue
      End Sub

      Sub Free()
         MyBase.Free()
      End Sub

   End Class

   Class TCheckEditor
      Inherits TBaseEditor

      Protected _edit As CheckBox

      Property Checked As Boolean
         Get
            Checked = me.AsBoolean
         End Get
         Set(pValue As Boolean)
            me.AsBoolean = pValue
         End Set
      End Property

      Sub New(pControl As Forms.TWinControl, pLabel As String)
         MyBase.New(pControl, pLabel)
      End Sub

      Sub Toggle()
         me.Checked = Not me.Checked
      End Sub

      Private Overrides Sub Build()
         me._edit = New CheckBox(me._container)
         me._edit.Align = alLeft
      End Sub

      Private Overrides Function GetOnlyRead() As Boolean
         GetOnlyRead = me._edit.ReadOnly
      End Function

      Private Overrides Sub SetOnlyRead(pValue As Boolean)
         me._edit.ReadOnly = pValue
      End Sub

      Private Overrides Function GetTabOrder() As Integer
         GetTabOrder = me._edit.TabOrder
      End Function

      Private Overrides Sub SetTabOrder(pValue As Integer)
         me._edit.TabOrder = pValue
      End Sub

      Private Overrides Function GetOnChange() As TNotifyEvent
         GetOnChange = me._edit.OnChange
      End Function

      Private Overrides Sub SetOnChange(pValue As TNotifyEvent)
         me._edit.OnChange = pValue
      End Sub

      Private Overrides Function GetOnClick() As TNotifyEvent
         GetOnClick = me._edit.OnClick
      End Function

      Private Overrides Sub SetOnClick(pValue As TNotifyEvent)
         me._edit.OnClick = pValue
      End Sub

      Private Overrides Function GetOnEnter() As TNotifyEvent
         GetOnEnter = me._edit.OnEnter
      End Function

      Private Overrides Sub SetOnEnter(pValue As TNotifyEvent)
         me._edit.OnEnter = pValue
      End Sub

      Private Overrides Function GetOnExit() As TNotifyEvent
         GetOnExit = me._edit.OnExit
      End Function

      Private Overrides Sub SetOnExit(pValue As TNotifyEvent)
         me._edit.OnExit = pValue
      End Sub

      Private Overrides Function GetEditor() As TcxCustomEdit
         GetEditor = me._edit
      End Function

      Private Overrides Function GetText() As String
         GetText = CStr(me.AsBoolean)
      End Function

      Private Overrides Sub SetText(pValue As String)
         pValue = UCase(pValue)
         me.AsBoolean = CBool(pValue = "TRUE" Or pValue = "S" Or pValue = "SIM" Or pValue = "Y" Or pValue = "YES" Or pValue = "1")
      End Sub

      Protected Overridable Function GetAsInteger() As Integer
         GetAsInteger = CInt(me.AsBoolean)
      End Function

      Protected Overridable Sub SetAsInteger(pValue As Integer)
         me.AsBoolean = CBool(pValue)
      End Sub

      Protected Overridable Function GetAsBoolean() As Boolean
         GetAsBoolean = me._edit.Checked
      End Function

      Protected Overridable Sub SetAsBoolean(pValue As Boolean)
         me._edit.Checked = pValue
      End Sub

      Sub Free()
         MyBase.Free()
      End Sub

   End Class

   Class TDateEditor
      Inherits TBaseEditor

      Protected _edit As DateTextBox

      Sub New(pControl As Forms.TWinControl, pLabel As String)
         MyBase.New(pControl, pLabel)
      End Sub

      Private Overrides Sub Build()
         me._container.Margins.Bottom = 2
         me._edit = New DateTextBox(me._container)
         me._edit.Align = alTop
      End Sub

      Private Overrides Function GetAjuda() As String
         GetAjuda = me._edit.Ajuda
      End Function

      Private Overrides Sub SetAjuda(pValue As String)
         me._edit.Ajuda = pValue
      End Sub

      Private Overrides Function GetOnlyRead() As Boolean
         GetOnlyRead = me._edit.ReadOnly
      End Function

      Private Overrides Sub SetOnlyRead(pValue As Boolean)
         me._edit.ReadOnly = pValue
      End Sub

      Private Overrides Function GetTabOrder() As Integer
         GetTabOrder = me._edit.TabOrder
      End Function

      Private Overrides Sub SetTabOrder(pValue As Integer)
         me._edit.TabOrder = pValue
      End Sub

      Private Overrides Function GetOnChange() As TNotifyEvent
         GetOnChange = me._edit.OnChange
      End Function

      Private Overrides Sub SetOnChange(pValue As TNotifyEvent)
         me._edit.OnChange = pValue
      End Sub

      Private Overrides Function GetOnClick() As TNotifyEvent
         GetOnClick = me._edit.OnClick
      End Function

      Private Overrides Sub SetOnClick(pValue As TNotifyEvent)
         me._edit.OnClick = pValue
      End Sub

      Private Overrides Function GetOnDblClick() As TNotifyEvent
         GetOnDblClick = me._edit.OnDblClick
      End Function

      Private Overrides Sub SetOnDblClick(pValue As TNotifyEvent)
         me._edit.OnDblClick = pValue
      End Sub

      Private Overrides Function GetOnEnter() As TNotifyEvent
         GetOnEnter = me._edit.OnEnter
      End Function

      Private Overrides Sub SetOnEnter(pValue As TNotifyEvent)
         me._edit.OnEnter = pValue
      End Sub

      Private Overrides Function GetOnExit() As TNotifyEvent
         GetOnExit = me._edit.OnExit
      End Function

      Private Overrides Sub SetOnExit(pValue As TNotifyEvent)
         me._edit.OnExit = pValue
      End Sub

      Private Overrides Function GetEditor() As TcxCustomEdit
         GetEditor = me._edit
      End Function

      Private Overrides Function GetText() As String
         GetText = me.AsDate.ToString("dd/mm/yyyy")
      End Function

      Private Overrides Sub SetText(pValue As String)
         me.AsDate = StrToDate(pValue)
      End Sub

      Private Overrides Function GetAsDate() As TDatetime
         GetAsDate = me._edit.AsDate
      End Function

      Private Overrides Sub SetAsDate(pValue As TDatetime)
         me._edit.AsDate = pValue
      End Sub

      Sub Free()
         MyBase.Free()
      End Sub

   End Class

   Class TButtonTextEditor
      Inherits TBaseEditor

      Protected _edit As ButtonedTextBox

      Property OnButtonClick As TNotifyEvent
         Get
            OnButtonClick = me._edit.OnButtonClick
         End Get
         Set(pValue As TNotifyEvent)
            me.SetOnButtonClick(pValue)
         End Set
      End Property

      Private Sub SetOnButtonClick(pValue As TNotifyEvent)
         me._edit.OnButtonClick = pValue
      End Sub

      Property ImageBase64 As String
         Set(pValue As String)
            me._edit.LoadFromBase64(pValue)
         End Set
      End Property

      Property ImagePath As String
         Set(pValue As String)
            me._edit.LoadFromFile(pValue)
         End Set
      End Property

      Property ButtonHint As String
         Get
            ButtonHint = me._edit.RightButton.Hint
         End Get
         Set(pValue As String)
            me._edit.ShowHint = True
            me._edit.RightButton.Hint = pValue
         End Set
      End Property

      Sub New(pControl As Forms.TWinControl, pLabel As String)
         MyBase.New(pControl, pLabel)
      End Sub

      Private Overrides Sub Build()
         me._edit = New ButtonedTextBox(me._container)
         me._edit.Container.Align = alTop
      End Sub

      Protected Overrides Sub SetFocus()
         'me._edit.SetFocus()
      End Sub

      Protected Overrides Function GetMascara() As String
         GetMascara = me._edit.Mask
      End Function

      Protected Overrides Sub SetMascara(pValue As String)
         me._edit.Mask = pValue
      End Sub

      Private Overrides Function GetOnlyRead() As Boolean
         GetOnlyRead = me._edit.OnlyRead
      End Function

      Private Overrides Sub SetOnlyRead(pValue As Boolean)
         me._edit.OnlyRead = pValue
      End Sub

      Private Overrides Function GetTabOrder() As Integer
         GetTabOrder = me._edit.TabOrder
      End Function

      Private Overrides Sub SetTabOrder(pValue As Integer)
         me._edit.TabOrder = pValue
      End Sub

      Private Overrides Function GetOnChange() As TNotifyEvent
         GetOnChange = me._edit.OnChange
      End Function

      Private Overrides Sub SetOnChange(pValue As TNotifyEvent)
         me._edit.OnChange = pValue
      End Sub

      Private Overrides Function GetOnClick() As TNotifyEvent
         GetOnClick = me._edit.OnClick
      End Function

      Private Overrides Sub SetOnClick(pValue As TNotifyEvent)
         me._edit.OnClick = pValue
      End Sub

      Private Overrides Function GetOnDblClick() As TNotifyEvent
         GetOnDblClick = me._edit.OnDblClick
      End Function

      Private Overrides Sub SetOnDblClick(pValue As TNotifyEvent)
         me._edit.OnDblClick = pValue
      End Sub

      Private Overrides Function GetOnEnter() As TNotifyEvent
         GetOnEnter = me._edit.OnEnter
      End Function

      Private Overrides Sub SetOnEnter(pValue As TNotifyEvent)
         me._edit.OnEnter = pValue
      End Sub

      Private Overrides Function GetOnExit() As TNotifyEvent
         GetOnExit = me._edit.OnExit
      End Function

      Private Overrides Sub SetOnExit(pValue As TNotifyEvent)
         me._edit.OnExit = pValue
      End Sub

      Private Overrides Function GetEditor() As TcxCustomEdit
         GetEditor = TcxCustomEdit(me._edit)
      End Function

      Private Overrides Function GetText() As String
         GetText = me._edit.Text
      End Function

      Private Overrides Sub SetText(pValue As String)
         me._edit.Text = pValue
      End Sub

      Protected Overrides Function GetHint() As String
         GetHint = me._edit.Hint
      End Function

      Protected Overrides Sub SetHint(pValue As String)
         me._edit.ShowHint = True
         me._edit.Hint = pValue
      End Sub

      Sub Free()
         If me._edit <> NULL Then
            me._edit.Free()
         End If
         MyBase.Free()
      End Sub

   End Class

End Namespace