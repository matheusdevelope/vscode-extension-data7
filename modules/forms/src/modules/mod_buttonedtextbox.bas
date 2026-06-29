' data7:disable unknown-type
' data7:disable unused-import
Imports Forms
Imports Vcl.ExtCtrls
Imports Vcl.Graphics
Imports Vcl.Controls
Imports Vcl.Imaging.PngImage
Imports System.Classes
Imports System.SysUtils
Imports System.NetEncoding


Namespace mod_buttonedtextbox

    Class ButtonedTextBox
        Inherits TButtonedEdit

        Private _container As PageControl
        Private _image As TPngImage
        Private _mask As MaskTextBox

        Private _readonly As Boolean
        Private _enabled As Boolean = True
        Private _focused As Boolean
        Private _mouseInClient As Boolean
        Private _imageW As Integer = 20
        Private _imageH As Integer = 17
        Private _key As Char
        Private _sel As Integer

        Protected BORDER_FOCUSED As Integer = RGB(0, 120, 215)
        Protected BORDER_NORMAL As Integer = RGB(160, 160, 160)
        Protected EDIT_FOCUSED As Integer = RGB(255, 255, 215)
        Protected EDIT_NORMAL As Integer = RGB(255, 255, 255)
        Protected EDIT_READONLY As Integer = RGB(229, 229, 229)
        Protected EDIT_DISABLED As Integer = RGB(240, 240, 240)
        Protected BTN_NORMAL As Integer = RGB(240, 240, 240)
        Protected BTN_FOCUSED As Integer = RGB(179, 215, 244)
        Protected BTN_PRESSED As Integer = RGB(136, 189, 231)
        Protected DOT_COLOR As Integer = RGB(0, 0, 0)

        OnKeyPress As TKeyPressEvent
        OnChange As TNotifyEvent
        OnButtonClick As TNotifyEvent

        Sub New(pOwner As Forms.TWinControl)
            me._container = New Forms.PageControl(pOwner)
            ' data7:disable-next-line unknown-member
            MyBase.New(me._container)
            TButtonedEdit(me).OnKeyPress = me._handleKeyPress
            TButtonedEdit(me).OnChange = me._handleOnChange
            me._createUI()
            me._createDefaultImage()
            me._buildButtonImages()
            me._mask = New MaskTextBox(NULL)
        End Sub

        Property Mask As String
            Get
                Mask = me._mask.Mascara
            End Get
            Set(pValue As String)
                me._mask.Mascara = pValue
            End Set
        End Property

        Property OnlyRead As Boolean
            Get
                OnlyRead = me._readonly
            End Get
            Set(pValue As Boolean)
                me._readonly = pValue
                me._buildButtonImages()
                me._updateVisual()
            End Set
        End Property

        Overrides Property Enabled As Boolean
            Get
                Enabled = me._enabled
            End Get
            Set(pValue As Boolean)
                me._enabled = pValue
                me._buildButtonImages()
                me._updateVisual()
            End Set
        End Property

        Property ButtonVisible As Boolean
            Get
                ButtonVisible = me.RightButton.Visible
            End Get
            Set(pValue As Boolean)
                me.RightButton.Visible = pValue
            End Set
        End Property

        Property Container As PageControl
            Get
                Container = me._container
            End Get
        End Property

        Sub LoadFromFile(pPath As String)
            If me._image <> NULL Then
                me._image.Free()
            End If
            me._image = New TPngImage()
            me._image.LoadFromFile(pPath)
            me._buildButtonImages()
        End Sub

        Sub LoadFromBase64(pBase64 As String)
            Dim strmIn As New TStringStream(pBase64)
            Dim strmOut As New TMemoryStream()
            Dim enc As New TBase64Encoding()
            enc.Decode(strmIn, strmOut)
            strmOut.Position = 0
            If me._image <> NULL Then
                me._image.Free()
            End If
            me._image = New TPngImage()
            me._image.LoadFromStream(strmOut)
            me._buildButtonImages()
            strmIn.Free()
            strmOut.Free()
        End Sub

        Sub LoadDefaultImage()
            me._createDefaultImage()
            me._buildButtonImages()
        End Sub

        Protected Overridable Sub _createUI()
            me._container.Width = 200
            me._container.Height = 19
            me._container.Margins.Left = 1
            me._container.Margins.Top = 1
            me._container.Margins.Right = 1
            me._container.Margins.Bottom = 1
            me._container.AlignWithMargins = True
            me._container.Color = me.BORDER_NORMAL
            me._container.ShowCardFrame = False
            me._container.ShowShadow = False
            me._container.TabStop = False

            me.Parent = me._container
            me.Align = alClient
            me.AlignWithMargins = True
            me.Margins.Left = 1
            me.Margins.Top = 1
            me.Margins.Right = 1
            me.Margins.Bottom = 1
            me.BorderStyle = Forms.bsNone
            me.Images = New TImageList(NULL)
            me.RightButton.Visible = True

            me.OnEnter = me._handleEnter
            me.OnExit = me._handleExit
            me.OnMouseEnter = me._handleMouseEnter
            me.OnMouseLeave = me._handleMouseLeave
            me.OnRightButtonClick = me._handleButtonClick
        End Sub

        Protected Overridable Sub _handleOnChange(pSender As TObject)
            TButtonedEdit(me).OnChange = NULL
            me._mask.AsString = me.Text
            me.Text = me._mask.AsString
            Select Asc(me._key)
                Case 8   ' Backspace
                    me.SelStart = me._sel - 1
                Case 24  ' Ctrl+X
                    me.SelStart = 0
                Case 22  ' Ctrl+V
                    me.SelStart = me.Text.Trim().Length
                Case Else
                    Dim _ssel As Integer = me.Text.FindDelimiter(me._key, me._sel + 1)
                    If _ssel <= 0 Then
                        me.SelStart = me._sel
                    Else
                        me.SelStart = _ssel
                    End If
            End Select

            TButtonedEdit(me).OnChange = me._handleOnChange
            If me.OnChange <> NULL Then
                me.OnChange(pSender)
            End If
        End Sub

        Protected Overridable Sub _handleKeyPress(pSender As TObject, ByRef pKey As Char)
            me._key = pKey
            me._sel = me.SelStart
        End Sub

        Protected Overridable Sub _handleEnter(pSender As TObject)
            me._focused = True
            me._updateVisual()
        End Sub

        Protected Overridable Sub _handleExit(pSender As TObject)
            me._focused = False
            me._updateVisual()
        End Sub

        Protected Overridable Sub _handleMouseEnter(pSender As TObject)
            me._mouseInClient = True
            me._updateVisual()
        End Sub

        Protected Overridable Sub _handleMouseLeave(pSender As TObject)
            me._mouseInClient = False
            me._updateVisual()
        End Sub

        Private Sub _handleButtonClick(pSender As TObject)
            If me.OnButtonClick <> NULL Then
                me.OnButtonClick(pSender)
            End If
        End Sub

        Protected Overridable Sub _updateVisual()
            If Not me._enabled Then
                me._container.Color = me.BORDER_NORMAL
                me.Color = me.EDIT_DISABLED
                TButtonedEdit(me).Enabled = False
                Exit Sub
            End If

            TButtonedEdit(me).Enabled = True

            If me._focused Or me._mouseInClient Then
                me._container.Color = me.BORDER_FOCUSED
            Else
                me._container.Color = me.BORDER_NORMAL
            End If

            TButtonedEdit(me).ReadOnly = me._readonly

            If me._readonly Then
                me.Color = me.EDIT_READONLY
            ElseIf me._focused Then
                me.Color = me.EDIT_FOCUSED
            Else
                me.Color = me.EDIT_NORMAL
            End If
        End Sub

        Protected Overridable Sub _buildButtonImages()
            If me._image = NULL Then
                Exit Sub
            End If

            me.Images.Clear()
            me.Images.Width = me._imageW
            me.Images.Height = me._imageH

            me._addImage(me.BTN_NORMAL, 1, False)
            me._addImage(me.BTN_FOCUSED, 0, True)
            me._addImage(me.BTN_PRESSED, 0, True)

            me.RightButton.ImageIndex = 0
            me.RightButton.HotImageIndex = 1
            me.RightButton.PressedImageIndex = 2
            me.RightButton.DisabledImageIndex = 0
        End Sub

        Protected Overridable Sub _addImage(pColor As Integer, pMargin As Integer, pBorder As Boolean)
            Dim bmp As New TBitmap()
            bmp.Width = me._imageW
            bmp.Height = me._imageH
            ' data7:disable-next-line unknown-symbol
            bmp.PixelFormat = pf32bit

            If me._readonly Or Not me._enabled Then
                bmp.Canvas.Brush.Color = me.EDIT_READONLY
                If Not me._enabled Then
                    bmp.Canvas.Brush.Color = me.EDIT_DISABLED
                End If
                bmp.Canvas.FillRect(me.GetRect(0, 0, bmp.Width, bmp.Height))
            End If

            bmp.Canvas.Brush.Color = pColor
            bmp.Canvas.FillRect(me.GetRect(pMargin, pMargin, bmp.Width - pMargin, bmp.Height - pMargin))

            If pBorder Then
                bmp.Canvas.Pen.Color = me.BORDER_FOCUSED
                bmp.Canvas.MoveTo(0, 0)
                bmp.Canvas.LineTo(0, bmp.Height)
            End If

            me._image.Draw(bmp.Canvas, me.GetRect(2, 0, bmp.Width - 2, bmp.Height))
            me.Images.Add(bmp, NULL)
            bmp.Free()
        End Sub

        Protected Overridable Sub _createDefaultImage()
            me._image = New TPngImage()
            Dim bmp As New TBitmap()
            bmp.Width = 16
            bmp.Height = 16
            bmp.Canvas.Brush.Color = me.DOT_COLOR
            bmp.Transparent = True
            Dim cx As Integer = bmp.Width \ 2
            Dim cy As Integer = bmp.Height \ 2
            Dim ytop As Integer = cy - 1
            Dim ybottom As Integer = cy + 1
            bmp.Canvas.FillRect(me.GetRect(cy - 5, ytop, cy - 3, ybottom))
            bmp.Canvas.FillRect(me.GetRect(cy - 1, ytop, cy + 1, ybottom))
            bmp.Canvas.FillRect(me.GetRect(cy + 3, ytop, cy + 5, ybottom))
            me._image.Assign(bmp)
        End Sub

        Protected Function GetRect(pLeft As Integer, pTop As Integer, pRight As Integer, pBottom As Integer) As TRect
            Dim rect As TRect
            rect.Left = pLeft
            rect.Top = pTop
            rect.Right = pRight
            rect.Bottom = pBottom
            GetRect = rect
        End Function

        Sub Free()
            If me._image <> NULL Then
                me._image.Free()
            End If
            MyBase.Free()
        End Sub

    End Class

End Namespace