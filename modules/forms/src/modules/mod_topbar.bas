
Imports mod_base_list
Imports mod_control
Imports mod_icons
Imports mod_winapi
Imports mod_event_emitter
Imports mod_shortcut


Namespace mod_topbar

    Delegate Sub DelOnClickItem(pSender As TObject, pButtonName As String)

    Class TTopBar
        Inherits Control

        Private _container As Control
        Private _page As Forms.PageControl
        Private _footer_line As Forms.Line
        Private _items As TTopBarItemList
        Private _bgColor As Integer = RGB(243, 243, 243)
        Private _linesColor As Integer = RGB(192, 192, 192)

        'OnClick As TNotifyEvent
        OnClickItem As DelOnClickItem

        AutoRealignItems As Boolean = True
        AutoAddSecondDivider As Boolean = True

        Events As EventEmitter = New EventEmitter()

        Sub New(pControl As Forms.TWinControl)
            MyBase.New(New Forms.PageControl(pControl), "", alTop)
            me._page = me.AsPage
            me._page.Height = 60
            me._page.ShowCardFrame = False
            me._page.Color = me._bgColor
            me._page.TabStop = False

            me._container = Control.BuildPage(_page, "", alClient)
            me._container.AsPage.ShowCardFrame = False
            me._container.AsPage.TabStop = False
            me._container.SetMargins(0, 0, 0, 1)

            me._footer_line = New Forms.Line(_page)
            me._footer_line.Height = 3
            me._footer_line.Brush.Color = me._linesColor
            me._footer_line.Pen.Color = me._linesColor
            me._footer_line.Align = alBottom

            me._items = New TTopBarItemList()
            me._items.OnAfterAdd = me._handleOnAfterAddItem

            me._initializeButtons()

            me.AsControl.Top = -100

        End Sub

        Private Sub _initializeButtons()
            me.AutoAddSecondDivider = False
            me.AutoRealignItems = False

            With me._items
                .Add(New TButton("dfHP12C", "HP 12C", Icons.HP12C(), "Calculadora Financeira HP 12C", -10))
                .Add(New TButton("dfCalc", "Calculadora", Icons.CALC(), "Calculadora", -9))
                .Add(New TDivider("dfDivider0", -8))
                .Add(New TDivider("dfDivider1", 997))
                .Add(New TButton("dfBtnOK", "&Ok", Icons.OK(), "Ok", 998, "Ctrl+O"))
                .Add(New TButton("dfBtnCancel", "&Cancelar", Icons.CANCEL(), "Cancelar", 998, "ESC"))
            End With
            me.Button("dfCalc").Control.Width = 70
            me.Divider(1).Visible = False
            me.RealignItems()
            me.AutoAddSecondDivider = True
            me.AutoRealignItems = True
        End Sub

        Private Sub _dispatchDefaultAction(pButtonID As String)
            Select UCase(pButtonID)
                Case "DFCALC"
                    Environment.Execute("calc", "", True)
                    me._sendAltKey(1)
                Case "DFHP12C"
                    Environment.Execute("calc", "", True)
                    me._sendAltKey(2)
                Case "DFBTNCANCEL"
                    me._closeParentForm()
            End Select
        End Sub

        Private Sub _sendAltKey(pKey As Byte)
            Sleep(500)
            WinAPI.SendKeys("%" & CStr(pKey))
        End Sub

        Private Sub _closeParentForm()
            Dim _parent As Forms.TWinControl = me.AsControl
            While _parent <> NULL And Not ((TypeOf _parent Is Forms.Form) Or (TypeOf _parent Is Forms.FormButtons))
                _parent = _parent.Parent
            End While
            If _parent <> NULL Then
                If TypeOf _parent Is Forms.Form Then
                    Forms.Form(_parent).Close()
                End If
                If TypeOf _parent Is Forms.FormButtons Then
                    Forms.FormButtons(_parent).Close()
                End If
            End If
        End Sub

        Property Height As Integer
            Get
                Height = me._page.Height
            End Get
            Set(pValue As Integer)
                me._setHeight(pValue)
            End Set
        End Property

        Property Visible As Boolean
            Get
                Visible = me.AsControl.Visible
            End Get
            Set(pValue As Boolean)
                me._setVisible(pValue)
            End Set
        End Property

        Private Sub _setVisible(pValue As Boolean)
            me.AsControl.Visible = pValue
        End Sub

        Property Items As TTopBarItemList
            Get
                Items = me._items
            End Get
        End Property

        Property Item(pID As String) As TTopBarItem
            Get
                Item = me._items.Take(pID)
            End Get
        End Property

        Property Button(pID As String) As TButton
            Get
                Button = TButton(me._items.Take(pID))
            End Get
        End Property

        Property Divider(pIndex As Integer) As TDivider
            Get
                Dim _id As String = "dfDivider" & CStr(pIndex)
                Divider = TDivider(me._items.Take(_id))
            End Get
        End Property

        Property ButtonOk As TButton
            Get
                ButtonOk = me.Button("dfBtnOK")
            End Get
        End Property

        Property ButtonCancel As TButton
            Get
                ButtonCancel = me.Button("dfBtnCancel")
            End Get
        End Property

        Function Add(pItem As TTopBarItem) As TTopBarItem
            me._items.Add(pItem)
            Add = me._items.Last()
        End Function

        Function AddButton(pID As String, pCaption As String, pImage As String = "", pHint As String = "", pOrder As Integer = -1, pShortCut As String = "") As TButton
            Dim bttn As New TButton(pID, pCaption, pImage, pHint, pOrder, pShortCut)
            me.Add(bttn)
            AddButton = bttn
        End Function

        Function AddDivider(pID As String, pOrder As Integer = -1) As TDivider
            Dim dvvdr As New TDivider(pID, pOrder)
            me.Add(dvvdr)
            AddDivider = dvvdr
        End Function

        Sub RealignItems()
            Dim i As Integer
            For i = 0 To me._items.Count() - 1
                With me._items.Take(i)
                    .Order = .Order * 100
                End With
            Next
        End Sub

        Private Sub _setHeight(pValue As Integer)
            me._page.Height = pValue
        End Sub

        Private Sub _handleOnAfterAddItem(pList As BaseList, pItem As BaseItem, pIndex As Integer)
            With TTopBarItem(pItem)
                .Build(me._container.AsControl)
                ._setTopBarNotifier(me._handleOnClickItem)
            End With

            If me.AutoAddSecondDivider Then
                me.Divider(1).Visible = True
            End If
            If me.AutoRealignItems Then
                me.RealignItems()
            End If
        End Sub

        Private Sub _handleOnClickItem(pSender As TObject)
            Dim _id As String = TTopBarItem(pSender).GetID()
            If me.Events <> NULL Then
                me.Events.Emit(_id, pSender, _id)
                me.Events.Emit("any", pSender, _id)
            End If
            me._dispatchDefaultAction(_id)
            If me.OnClickItem <> NULL Then
                me.OnClickItem(pSender, _id)
            End If
        End Sub

        Sub Free()
            If me._items <> NULL Then
                me._items.Free()
            End If
            MyBase.Free()
        End Sub
    End Class

    Class TTopBarItem
        Inherits BaseItem

        ID As String
        Control As Forms.TControl
        ShortCut As TShortCut = New TShortCut(0)

        Protected _builded As Boolean
        Private _order As Integer

        Protected _hint As String
        Private _hint_shortcut As String

        Private _onClick As TNotifyEvent
        Private _onClickTopBar As TNotifyEvent

        Property Hint As String
            Get
                Hint = me._hint
            End Get
            Set(pValue As String)
                me._hint = pValue
                me.Refresh()
            End Set
        End Property

        Property OnClick As TNotifyEvent
            Get
                OnClick = me._onClick
            End Get
            Set(pValue As TNotifyEvent)
                me._onClick = pValue
                If me.ShortCut <> NULL Then
                    me.ShortCut.Action = me._onClick
                End If
            End Set
        End Property

        Sub New(pID As String, pOrder As Integer)
            MyBase.New()
            me.ID = pID
            me._order = pOrder
        End Sub

        Sub New(pValue As TTopBarItem)
            MyBase.New()
            If pValue <> NULL Then
                me.Fill(pValue)
            End If
        End Sub

        Property Builded As Boolean
            Get
                Builded = me._builded
            End Get
        End Property

        Property Order As Integer
            Get
                Order = me._order
            End Get
            Set(pValue As Integer)
                me._order = pValue
                me._setOrder(pValue)
            End Set
        End Property

        Private Sub _setOrder(pValue As Integer)
            me.Control.Left = pValue
        End Sub

        Property Visible As Boolean
            Get
                Visible = me.Control.Visible
            End Get
            Set(pValue As Boolean)
                me._setVisible(pValue)
            End Set
        End Property

        Private Sub _setVisible(pValue As Boolean)
            me.Control.Visible = pValue
        End Sub

        Property Enabled As Boolean
            Get
                Enabled = me.Control.Enabled
            End Get
            Set(pValue As Boolean)
                me._setEnabled(pValue)
            End Set
        End Property

        Overridable Sub Build(pControl As Forms.TWinControl)
        End Sub

        Sub Refresh()
            me._baserefresh()
            me._refresh()
        End Sub

        Private Sub _setEnabled(pValue As Boolean)
            me.Control.Enabled = pValue
        End Sub

        Protected Overrides Sub AfterAdd(pList As BaseList, pItem As BaseItem, pIndex As Integer)
            If me._order = -1 Then
                me._order = pIndex
            End If
        End Sub

        Protected Overridable Sub BuildHint()
            Dim _shortcut As String
            If me.ShortCut <> NULL Then
                _shortcut = me.ShortCut.AsString
            End If
            If _shortcut <> "" Then
                _shortcut = me._hint & " (" & _shortcut & ")"
            Else
                _shortcut = me._hint
            End If
            me._hint_shortcut = _shortcut
        End Sub

        Private Sub _baserefresh()
            If me.Builded Then
                me.BuildHint()
                me.Control.Hint = me._hint_shortcut
            End If
        End Sub

        Sub _setTopBarNotifier(pAction As TNotifyEvent)
            me._onClickTopBar = pAction
        End Sub

        Protected Overridable Sub _refresh()
        End Sub

        Protected Sub DispatchOnClick(pSender As TObject)
            If me.OnClick <> NULL Then
                me.OnClick(me)
            End If
            If me._onClickTopBar <> NULL Then
                me._onClickTopBar(me)
            End If
        End Sub

        Protected Overridable Sub Fill(pValue As TTopBarItem)
            If pValue = NULL Then
                Exit Sub
            End If
            me.ID = pValue.ID
            me._OnClick = pValue.OnClick
            me.Order = pValue.Order
        End Sub

        Overrides Function GetID() As String
            GetID = me.ID
        End Function

        Overrides Sub Dispose()
        End Sub

        Sub Free()
            me.Dispose()
            MyBase.Free()
        End Sub

    End Class

    Class TButton
        Inherits TTopBarItem

        Private _caption As String
        Private _image As String

        Property Caption As String
            Get
                Caption = me._caption
            End Get
            Set(pValue As String)
                me._caption = pValue
                me._refresh()
            End Set
        End Property

        Property Image As String
            Get
                Image = me._image
            End Get
            Set(pValue As String)
                me._image = pValue
                me._refresh()
            End Set
        End Property

        Sub New(pID As String, pCaption As String, pImage As String, pHint As String, pOrder As Integer, pShortCut As String = "")
            MyBase.New(pID, pOrder)
            me.Caption = pCaption
            me.Image = pImage
            me.ShortCut.AsString = pShortCut
            me.Hint = pHint
        End Sub

        Sub New(pValue As TButton)
            MyBase.New(pValue)
            If pValue <> NULL Then
                me.Fill(pValue)
            End If
        End Sub

        Overrides Sub Build(pControl As Forms.TWinControl)
            me.Control = New Forms.FlatButton(pControl)
            With Forms.FlatButton(me.Control)
                .Width = 60
                .Align = alLeft
                ' data7:disable-next-line unknown-symbol
                .Layout = blGlyphTop
                .Spacing = 0
                .Transparent = True
                .Flat = True
                .ShowHint = True
                .Text = me.Caption
                .Image = me.Image
                .OnClick = me.DispatchOnClick
            End With
            me._builded = True
            me.Refresh()
        End Sub

        Private Overrides Sub _refresh()
            If me._builded Then
                With Forms.FlatButton(me.Control)
                    .Text = me.Caption
                    .Image = me.Image
                End With
            End If
        End Sub

        Protected Overrides Sub Fill(pValue As TTopBarItem)
            MyBase.Fill(pValue)
            With TButton(pValue)
                me.Caption = .Caption
                me.Image = .Image
                me.Hint = .Hint
            End With
        End Sub

        Overrides Function Copy() As TButton
            Copy = New TButton(me)
        End Function
        Public Sub Free()
            MyBase.Free()
        End Sub

    End Class

    Class TDivider
        Inherits TTopBarItem

        Sub New(pID As String, pOrder As Integer)
            MyBase.New(pID, pOrder)
        End Sub

        Sub New(pValue As TDivider)
            MyBase.New(pValue)
        End Sub

        Overrides Sub Build(pControl As Forms.TWinControl)
            me.Control = New Forms.Line(pControl)
            With Forms.Line(me.Control)
                .Width = 1
                .Brush.Color = RGB(160, 160, 160)
                .Pen.Color = RGB(160, 160, 160)
                .Align = alLeft
                .AlignWithMargins = True
                .Margins.Left = 3
                .Margins.Top = 8
                .Margins.Right = 3
                .Margins.Bottom = 4
            End With
            me._builded = True
        End Sub

        Overrides Function Copy() As TDivider
            Copy = New TDivider(me)
        End Function

        Public Sub Free()
            MyBase.Free()
        End Sub

    End Class

    Class TTopBarItemList
        Inherits BaseList

        Sub New()
            MyBase.New("TTopBarItem", True)
        End Sub

        Property Item(pIndex As Integer) As TTopBarItem
            Get
                Item = CType(MyBase.Item(pIndex), TTopBarItem)
            End Get
            Set(pValue As TTopBarItem)
                me.SetItem(pIndex, pValue)
            End Set
        End Property

        Function Take(pIndex As Integer) As TTopBarItem
            Take = CType(MyBase.Take(pIndex), TTopBarItem)
        End Function

        Function Take(pID As String) As TTopBarItem
            Take = CType(MyBase.TakeFromId(pID), TTopBarItem)
        End Function

        Function First() As TTopBarItem
            First = CType(MyBase.First, TTopBarItem)
        End Function

        Function Last() As TTopBarItem
            Last = CType(MyBase.Last, TTopBarItem)
        End Function

        Function Copy() As TTopBarItem
            Copy = CType(MyBase.Copy(), TTopBarItem)
        End Function
        Public Sub Free()
            MyBase.Free()
        End Sub

    End Class

End Namespace