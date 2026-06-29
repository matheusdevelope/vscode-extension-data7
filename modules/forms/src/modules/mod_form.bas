Imports Forms
Imports mod_props
Imports mod_winapi
Imports mod_topbar
Imports mod_shortcut

Namespace mod_form

    Class TFormLayout
        Inherits TFormBase

        Property Header As PageControl
            Get
                Header = me._header
            End Get
        End Property

        Property HeaderDivider As Line
            Get
                HeaderDivider = me._headerDivider
            End Get
        End Property

        Property Content As PageControl
            Get
                Content = me._content
            End Get
        End Property

        Property FooterDivider As Line
            Get
                FooterDivider = me._footerDivider
            End Get
        End Property

        Property Footer As PageControl
            Get
                Footer = me._footer
            End Get
        End Property

        Sub New(pTitle As String = "", pShowTopBar As Boolean = False)
            MyBase.New(pTitle)
            me.TopBar.Visible = pShowTopBar
            me._header.Visible = True
            me._headerDivider.Visible = True
            me._content.Visible = True
            me._footerDivider.Visible = True
            me._footer.Visible = True
        End Sub

        Sub Free()
            MyBase.Free()
        End Sub

    End Class

    Class TFormButtons
        Inherits TFormSimple

        Sub New(pTitle As String = "")
            MyBase.New(pTitle)
            me.TopBar.Visible = True
        End Sub

        Sub Free()
            MyBase.Free()
        End Sub

    End Class

    Class TFormSimple
        Inherits TFormBase

        Property Content As PageControl
            Get
                Content = me._content
            End Get
        End Property

        Sub New(pTitle As String = "")
            MyBase.New(pTitle)
            me.TopBar.Visible = False
            me._header.Visible = False
            me._headerDivider.Visible = False
            me._content.Visible = True
            me._footer.Visible = False
            me._footerDivider.Visible = False
        End Sub

        Sub Free()
            MyBase.Free()
        End Sub

    End Class

    Class TFormBase

        Protected _form As Form
        Private _shortcuts As TShortcuts = New TShortcuts()

        ReadOnly TopBar As TTopBar
        Protected _control As PageControl
        Protected _header As PageControl
        Protected _headerDivider As Line
        Protected _content As PageControl
        Protected _footerDivider As Line
        Protected _footer As PageControl

        Private _monitor As TMonitor
        Private _width As PropsSize
        Private _height As PropsSize
        Private _canResize As Boolean
        Private _lastWidth As Integer
        Private _lastHeight As Integer
        Private _marginWidth As Integer = 5
        Private _marginHeight As Integer = 5
        Private _sizeWidth As Integer = -1
        Private _sizeHeight As Integer = -1

        Private _enableF11 As Boolean = False
        Private _scF11 As TShortcut
        Private _maximized As Boolean
        Private _lastWidthMaximized As Integer
        Private _lastHeightMaximized As Integer
        Private _lastLeftMaximized As Integer
        Private _lastTopMaximized As Integer
        Private _isCancelled As Boolean = False
        Private _forceClose As Boolean = False

        CloseOnOk As Boolean = True
        MessageOnClose As String

        OnCanShowEvent As TCloseQueryEvent
        OnCanCloseEvent As TCloseQueryEvent
        OnShowEvent As TNotifyEvent
        OnCloseEvent As TNotifyEvent
        OnOkEvent As TNotifyEvent
        OnCancelEvent As TNotifyEvent

        Sub New(pTitle As String = "")
            MyBase.New()
            me._build(pTitle)

            me._monitor = WinAPI.Screen.MonitorFromWindow(me._form.Handle)
            me._width = New PropsSize(me._handleOnChange, "Width")
            me._height = New PropsSize(me._handleOnChange, "Height")
            me._lastWidth = me._form.Width
            me._lastHeight = me._form.Height
            me.CanResize = True
            me._width.Min = 500
            me._height.Min = 300

            me._scF11 = TShortcut.Load("F11")
            me._scF11.Action = me._handleOnMaximizeMinimize
            me._shortcuts.Assign(me._scF11)

            me._registerEvents()
        End Sub

        Private Sub _build(pTitle As String)
            me._form = New Forms.Form()
            me._form.Caption = pTitle
            me._form.TabStop = False

            me.TopBar = New TTopBar(me._form)

            me._control = New Forms.PageControl(me._form)
            me._control.Align = alClient
            me._control.ShowCardFrame = False
            me._control.ShowShadow = False
            me._control.TabStop = False

            me._header = New Forms.PageControl(me._control)
            me._header.Top = 1
            me._header.Height = 40
            me._header.Align = alTop
            me._header.ShowCardFrame = False
            me._header.ShowShadow = False
            me._header.TabStop = False

            me._headerDivider = New Forms.Line(me._control)
            me._headerDivider.Top = 2
            me._headerDivider.Align = alTop
            me._headerDivider.Height = 2
            me._headerDivider.Pen.Color = RGB(192, 192, 192)
            me._headerDivider.Brush.Color = me._headerDivider.Pen.Color

            me._content = New Forms.PageControl(me._control)
            me._content.Align = alClient
            me._content.ShowCardFrame = False
            me._content.ShowShadow = False
            me._content.TabStop = False

            me._footerDivider = New Forms.Line(me._control)
            me._footerDivider.Top = 1
            me._footerDivider.Align = alBottom
            me._footerDivider.Height = 2
            me._footerDivider.Pen.Color = RGB(192, 192, 192)
            me._footerDivider.Brush.Color = me._headerDivider.Pen.Color

            me._footer = New Forms.PageControl(me._control)
            me._footer.Top = 2
            me._footer.Height = 20
            me._footer.Align = alBottom
            me._footer.ShowCardFrame = False
            me._footer.ShowShadow = False
            me._footer.TabStop = False

            me.TopBar.Visible = False
            me._header.Visible = False
            me._headerDivider.Visible = False
            me._content.Visible = False
            me._footer.Visible = False
            me._footerDivider.Visible = False

        End Sub

        Property GetForm As Form
            Get
                GetForm = me._form
            End Get
        End Property

        Property Shortcuts As TShortcuts
            Get
                Shortcuts = me._shortcuts
            End Get
        End Property

        Property Monitor As TMonitor
            Get
                Monitor = me._monitor
            End Get
        End Property

        Property Margin As Integer
            Set(pValue As Integer)
                If pValue < 0 Or pValue > 100 Then
                    Throw New Exception("SafeArea margin must be 0–100")
                End If
                me._marginWidth = pValue
                me._marginHeight = pValue
                me._applyToSizeProps()
                me._applyConstraints(me._form.Width, me._form.Height)
            End Set
        End Property

        Property MarginWidth As Integer
            Get
                MarginWidth = me._marginWidth
            End Get
            Set(pValue As Integer)
                If pValue < 0 Or pValue > 100 Then
                    Throw New Exception("SafeArea margin must be 0–100")
                End If
                me._marginWidth = pValue
                me._applyToSizeProps()
                me._applyConstraints(me._form.Width, me._form.Height)
            End Set
        End Property

        Property MarginHeight As Integer
            Get
                MarginHeight = me._marginHeight
            End Get
            Set(pValue As Integer)
                If pValue < 0 Or pValue > 100 Then
                    Throw New Exception("SafeArea margin must be 0–100")
                End If
                me._marginHeight = pValue
                me._applyToSizeProps()
                me._applyConstraints(me._form.Width, me._form.Height)
            End Set
        End Property

        Property Size As Integer
            Set(pValue As Integer)
                If pValue < 1 Or pValue > 100 Then
                    Throw New Exception("Size must be 1–100")
                End If
                me._sizeWidth = pValue
                me._sizeHeight = pValue
                me._applyConstraints(me._calcWidthFromPercent(), me._calcHeightFromPercent())
            End Set
        End Property

        Property SizeWidth As Integer
            Get
                SizeWidth = me._sizeWidth
            End Get
            Set(pValue As Integer)
                If pValue < 1 Or pValue > 100 Then
                    Throw New Exception("Size must be 1–100")
                End If
                me._sizeWidth = pValue
                me._applyConstraints(me._calcWidthFromPercent(), me._calcHeightFromPercent())
            End Set
        End Property

        Property SizeHeight As Integer
            Get
                SizeHeight = me._sizeHeight
            End Get
            Set(pValue As Integer)
                If pValue < 1 Or pValue > 100 Then
                    Throw New Exception("Size must be 1–100")
                End If
                me._sizeHeight = pValue
                me._applyConstraints(me._calcWidthFromPercent(), me._calcHeightFromPercent())
            End Set
        End Property

        Property Width As PropsSize
            Get
                Width = me._width
            End Get
        End Property

        Property Height As PropsSize
            Get
                Height = me._height
            End Get
        End Property

        Property CanResize As Boolean
            Get
                CanResize = me._canResize
            End Get
            Set(pValue As Boolean)
                me._canResize = pValue
                me._width.CanGrow = pValue
                me._height.CanGrow = pValue
            End Set
        End Property

        Property Maximized As Boolean
            Get
                Maximized = me._maximized
            End Get
            Set(pValue As Boolean)
                If me._maximized <> pValue Then
                    me._toggleMaximized()
                End If
            End Set
        End Property

        Property MaximizeOnF11 As Boolean
            Get
                MaximizeOnF11 = me._enableF11
            End Get
            Set(pValue As Boolean)
                me._enableF11 = pValue
                If pValue Then
                    me.Shortcuts.Assign(me._scF11)
                Else
                    me.Shortcuts.Unassign(me._scF11)
                End If
            End Set
        End Property

        Function Show() As Boolean
            me._isCancelled = False
            If me._dispatchOnCanShow() Then
                me._form.Show()
            End If
            Show = Not me._isCancelled
        End Function

        Sub Close(pForce As Boolean = False)
            me._forceClose = pForce
            me._form.Close()
        End Sub

        Private Function _dispatchOnCanShow() As Boolean
            Dim allow As Boolean = True
            If me.OnCanShowEvent <> NULL Then
                me.OnCanShowEvent(me, allow)
            End If
            _dispatchOnCanShow = allow
        End Function

        Private Sub _dispatchOnShow()
            If me.OnShowEvent <> NULL Then
                me.OnShowEvent(me)
            End If
        End Sub

        Private Function _dispatchOnCanClose() As Boolean
            Dim allow As Boolean = True
            If me.OnCanCloseEvent <> NULL Then
                me.OnCanCloseEvent(me, allow)
            End If
            If allow And me.MessageOnClose <> "" Then
                allow = Forms.MessageBox.Confirmation(me.MessageOnClose)
            End If
            _dispatchOnCanClose = allow
        End Function

        Private Sub _dispatchOnClose()
            If me.OnCloseEvent <> NULL Then
                me.OnCloseEvent(me)
            End If
        End Sub

        Private Sub _handleOnOk(pSender As TObject)
            me._isCancelled = False
            If me.OnOkEvent <> NULL Then
                me.OnOkEvent(pSender)
            End If
            If me.CloseOnOk Then
                me.Close(True)
            End If
        End Sub

        Private Sub _handleOnCancel(pSender As TObject)
            me._isCancelled = True
            me.Close()
        End Sub

        Private Sub _handleOnShow(pSender As TObject)
            me._monitor = WinAPI.Screen.MonitorFromWindow(me._form.Handle)
            If me._width.Max < 0 Then
                me._width.Max = me._maxSafeWidth()
            End If
            If me._height.Max < 0 Then
                me._height.Max = me._maxSafeHeight()
            End If
            me._applyConstraints(me._lastWidth, me._lastHeight)
            me._registerShortcutEvents()
            me._dispatchOnShow()
        End Sub

        Private Sub _handleOnCloseQuery(pSender As TObject, ByRef pCan As Boolean)
            If me._forceClose Then
                pCan = True
                me._forceClose = False
            Else
                pCan = me._dispatchOnCanClose()
            End If
            If pCan Then
                If me._isCancelled And me.OnCancelEvent <> NULL Then
                    me.OnCancelEvent(pSender)
                End If
                me._dispatchOnClose()
            End If
        End Sub

        Private Sub _registerEvents()
            me._form.OnCanResize = me._handleOnCanResize
            me._form.OnResize = me._handleOnResize
            me._form.OnShow = me._handleOnShow
            me._form.OnCloseQuery = me._handleOnCloseQuery
            me._form.OnKeyUp = me.Shortcuts.HandleOnKeyUp
            me._form.OnKeyDown = me.Shortcuts.HandleOnKeyDown

            me.TopBar.ButtonOk.OnClick = me._handleOnOk
            me.TopBar.ButtonCancel.OnClick = me._handleOnCancel
        End Sub

        Private Sub _registerShortcutEvents()
            Dim i As Integer, count As Integer = me.TopBar.Items.Count() - 1
            For i = 0 To count
                me._shortcuts.Assign(me.TopBar.Items.Item(i).Shortcut)
            Next
        End Sub

        Private Sub _toggleMaximized()
            If me._maximized Then
                me._form.Width = me._lastWidthMaximized
                me._form.Height = me._lastHeightMaximized
                me._form.Left = me._lastLeftMaximized
                me._form.Top = me._lastTopMaximized
            Else
                me._lastWidthMaximized = me._form.Width
                me._lastHeightMaximized = me._form.Height
                me._lastLeftMaximized = me._form.Left
                me._lastTopMaximized = me._form.Top
                me._form.Left = me._calcLeft()
                me._form.Top = me._calcTop()
                me.Size = 100
            End If
            me._maximized = Not me._maximized
        End Sub

        Private Function _compute(pSize As PropsSize, pLast As Integer, pValue As Integer) As Integer
            Dim _value As Integer = pValue
            If Not pSize.CanGrow Then
                _compute = pLast
                Exit Sub
            End If
            If pSize.Min >= 0 And pValue < pSize.Min Then
                _value = pSize.Min
            End If
            If pSize.Max >= 0 And pValue > pSize.Max Then
                _value = pSize.Max
            End If
            _compute = _value
        End Function

        Private Sub _applyConstraints(pWidth As Integer, pHeight As Integer)
            me._form.Width = me._compute(me._width, me._lastWidth, pWidth)
            me._form.Height = me._compute(me._height, me._lastHeight, pHeight)
        End Sub

        Private Sub _applyToSizeProps()
            Dim safeWidth As Integer = me._maxSafeWidth()
            Dim safeHeight As Integer = me._maxSafeHeight()

            If me._width.Max > safeWidth Or me._width.Max < 0 Then
                me._width.Max = safeWidth
            End If
            If me._width.Min > safeWidth Then
                me._width.Min = safeWidth
            End If

            If me._height.Max > safeHeight Or me._height.Max < 0 Then
                me._height.Max = safeHeight
            End If
            If me._height.Min > safeHeight Then
                me._height.Min = safeHeight
            End If
        End Sub

        Private Function _maxSafeWidth() As Integer
            _maxSafeWidth = CInt(me._monitor.WorkAreaWidth * (1 - (me._marginWidth / 100)))
        End Function

        Private Function _maxSafeHeight() As Integer
            _maxSafeHeight = CInt(me._monitor.WorkAreaHeight * (1 - (me._marginHeight / 100)))
        End Function

        Private Function _calcLeft() As Integer
            _calcLeft = me._monitor.WorkArea.Left + CInt((me._monitor.WorkAreaWidth - me._maxSafeWidth()) / 2)
        End Function

        Private Function _calcTop() As Integer
            _calcTop = me._monitor.WorkArea.Top + CInt((me._monitor.WorkAreaHeight - me._maxSafeHeight()) / 2)
        End Function

        Private Function _calcWidthFromPercent() As Integer
            If me._sizeWidth <= 0 Then
                _calcWidthFromPercent = me._width.Min
            Else
                _calcWidthFromPercent = CInt(me._maxSafeWidth() * (me._sizeWidth / 100))
            End If
        End Function

        Private Function _calcHeightFromPercent() As Integer
            If me._sizeHeight <= 0 Then
                _calcHeightFromPercent = me._height.Min
            Else
                _calcHeightFromPercent = CInt(me._maxSafeHeight() * (me._sizeHeight / 100))
            End If
        End Function

        Private Sub _handleOnCanResize(pSender As TObject, ByRef pWidth As Integer, ByRef pHeight As Integer, ByRef pCan As Boolean)
            If me.CanResize Then
                pWidth = me._compute(me._width, me._lastWidth, pWidth)
                pHeight = me._compute(me._height, me._lastHeight, pHeight)
                pCan = True
            Else
                pCan = False
            End If
        End Sub

        Private Sub _handleOnResize(pSender As TObject)
            me._lastWidth = me._form.Width
            me._lastHeight = me._form.Height

            me._width.PauseNotify()
            me._width.Value = me._lastWidth
            me._width.ResumeNotify()

            me._height.PauseNotify()
            me._height.Value = me._lastHeight
            me._height.ResumeNotify()
        End Sub

        Private Sub _handleOnChange(pName As String, pValue As Variant, pType As String)
            Dim w As Integer = me._form.Width
            Dim h As Integer = me._form.Height
            pName = UCase(Trim(pName))

            If pName.StartsWith("WIDTH") Then
                If pName.EndsWith("VALUE") Then
                    w = CInt(pValue)
                ElseIf pName.EndsWith("MIN") Or pName.EndsWith("MAX") Then
                    me._applyToSizeProps()
                End If
            End If

            If pName.StartsWith("HEIGHT") Then
                If pName.EndsWith("VALUE") Then
                    h = CInt(pValue)
                ElseIf pName.EndsWith("MIN") Or pName.EndsWith("MAX") Then
                    me._applyToSizeProps()
                End If
            End If

            me._applyConstraints(w, h)
        End Sub

        Private Sub _handleOnMaximizeMinimize(pSender As TObject)
            me.Maximized = Not me.Maximized
        End Sub

        Sub Free()
            If me._shortcuts <> NULL Then
                me._shortcuts.Free()
            End If
            If me._monitor <> NULL Then
                me._monitor.Free()
            End If
            If me._width <> NULL Then
                me._width.Free()
            End If
            If me._height <> NULL Then
                me._height.Free()
            End If
            If me.TopBar <> NULL Then
                me.TopBar.Free()
            End If
            If me._form <> NULL Then
                me._form.Free()
            End If
            MyBase.Free()
        End Sub

    End Class

End Namespace