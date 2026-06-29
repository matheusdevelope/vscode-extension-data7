
Imports Forms
Imports mod_notifier


Namespace mod_props

    Class PropsSize
        Inherits Notifier

        Private _value As Integer = -1
        Private _min As Integer = -1
        Private _max As Integer = -1
        Private _canGrow As Boolean = False

        Property Value As Integer
            Get
                Value = me._value
            End Get
            Set(pValue As Integer)
                me.SetInteger("Value", me._value, pValue)
            End Set
        End Property

        Property Min As Integer
            Get
                Min = me._min
            End Get
            Set(ByVal pValue As Integer)
                me.SetInteger("Min", me._min, pValue)
            End Set
        End Property

        Property Max As Integer
            Get
                Return me._max
            End Get
            Set(pValue As Integer)
                me.SetInteger("Max", me._max, pValue)
            End Set
        End Property

        Property CanGrow As Boolean
            Get
                CanGrow = me._canGrow
            End Get
            Set(pValue As Boolean)
                me.SetBoolean("CanGrow", me._canGrow, pValue)
            End Set
        End Property

        Sub New(pOnChange As DelChange, pName As String = "")
            MyBase.New(pOnChange, pName)
        End Sub

        Sub New(pName As String = "")
            MyBase.New(pName)
        End Sub

        Sub New(pValue As PropsSize)
            MyBase.New(pValue)
            me.Fill(pValue)
        End Sub

        Sub Fill(pValue As PropsSize)
            If pValue = NULL Then
                Exit Sub
            End If
            me.PauseNotify()
            With pValue
                me.Value = .Value
                me.Min = .Min
                me.Max = .Max
                me.CanGrow = .CanGrow
            End With
            me.ResumeNotify()
        End Sub

        Function Copy() As PropsSize
            Copy = New PropsSize(me)
        End Function

        Function ToString(pPrint As Boolean = False) As String
            With console.Block("PropsSize")
                .Prop("Value", me.Value)
                .Prop("Min", me.Min)
                .Prop("Max", me.Max)
                .Prop("CanGrow", me.CanGrow)
                .Close()
                .Printe(pPrint)
                ToString = .Text
                .Free()
            End With
        End Function

        Sub Free()
            MyBase.Free()
        End Sub

    End Class

    Class PropsBox
        Inherits Notifier

        Private _left As Integer
        Private _top As Integer
        Private _right As Integer
        Private _bottom As Integer

        Property Left As Integer
            Get
                Left = me._left
            End Get
            Set(pValue As Integer)
                me.SetInteger("Left", me._left, pValue)
            End Set
        End Property

        Property Top As Integer
            Get
                Top = me._top
            End Get
            Set(pValue As Integer)
                me.SetInteger("Top", me._top, pValue)
            End Set
        End Property

        Property Right As Integer
            Get
                Right = me._right
            End Get
            Set(pValue As Integer)
                me.SetInteger("Right", me._right, pValue)
            End Set
        End Property

        Property Bottom As Integer
            Get
                Bottom = me._bottom
            End Get
            Set(pValue As Integer)
                me.SetInteger("Bottom", me._bottom, pValue)
            End Set
        End Property

        Sub New(pOnChange As DelChange, pName As String = "")
            MyBase.New(pOnChange, pName)
        End Sub

        Sub New(pName As String = "")
            MyBase.New(pName)
        End Sub

        Sub New(pValue As PropsBox)
            MyBase.New(pValue)
            me.Fill(pValue)
        End Sub

        Sub New(pLeft As Integer, pTop As Integer, pRight As Integer, pBottom As Integer)
            MyBase.New()
            me.SetAll(pLeft, pTop, pRight, pBottom)
        End Sub

        Sub Fill(pValue As PropsBox)
            If pValue = NULL Then
                Exit Sub
            End If
            me.PauseNotify()
            With pValue
                me.Left = .Left
                me.Top = .Top
                me.Right = .Right
                me.Bottom = .Bottom
            End With
            me.ResumeNotify()
        End Sub

        Sub SetAll(pValue As Integer)
            me.SetAll(pValue, pValue, pValue, pValue)
        End Sub

        Sub SetAll(pLeft As Integer, pTop As Integer, pRight As Integer, pBottom As Integer)
            With me
                .Left = pLeft
                .Top = pTop
                .Right = pRight
                .Bottom = pBottom
            End With
        End Sub

        Sub SetHorizontal(pLeft As Integer, pRight As Integer)
            me.SetAll(pLeft, me.Top, pRight, me.Bottom)
        End Sub

        Sub SetVertical(pTop As Integer, pBottom As Integer)
            me.SetAll(me.Left, pTop, me.Right, pBottom)
        End Sub

        Sub Apply(ByRef pMargins As TMargins)
            With pMargins
                .Left = me.Left
                .Top = me.Top
                .Right = me.Right
                .Bottom = me.Bottom
            End With
        End Sub

        Function Copy() As PropsBox
            Copy = New PropsBox(me)
        End Function

        Function ToString(pPrint As Boolean = False) As String
            With console.Block("PropsBox")
                .Prop("Left", me.Left)
                .Prop("Top", me.Top)
                .Prop("Right", me.Right)
                .Prop("Bottom", me.Bottom)
                .Close()
                .Printe(pPrint)
                ToString = .Text
                .Free()
            End With
        End Function

        Sub Free()
            MyBase.Free()
        End Sub

    End Class

    Class PropsColor
        Inherits Notifier

        Private _value As Integer = -1
        Private _background As Integer = -1
        Private _foreground As Integer = -1
        Private _border As Integer = -1
        Private _hover As Integer = -1
        Private _focus As Integer = -1
        Private _disabled As Integer = -1
        Private _shadow As Integer = -1
        Private _opacity As Integer = -1
        Private _transparent As Boolean
        Private _parent As Boolean

        Property Value As Integer
            Get
                Value = me._value
            End Get
            Set(pValue As Integer)
                me.SetInteger("Value", me._value, pValue)
            End Set
        End Property

        Property Background As Integer
            Get
                Background = me._background
            End Get
            Set(pValue As Integer)
                me.SetInteger("Background", me._background, pValue)
            End Set
        End Property

        Property Foreground As Integer
            Get
                Foreground = me._foreground
            End Get
            Set(pValue As Integer)
                me.SetInteger("Foreground", me._foreground, pValue)
            End Set
        End Property

        Property Border As Integer
            Get
                Border = me._border
            End Get
            Set(pValue As Integer)
                me.SetInteger("Border", me._border, pValue)
            End Set
        End Property

        Property Hover As Integer
            Get
                Hover = me._hover
            End Get
            Set(pValue As Integer)
                me.SetInteger("Hover", me._hover, pValue)
            End Set
        End Property

        Property Focus As Integer
            Get
                Focus = me._focus
            End Get
            Set(pValue As Integer)
                me.SetInteger("Focus", me._focus, pValue)
            End Set
        End Property

        Property Disabled As Integer
            Get
                Disabled = me._disabled
            End Get
            Set(pValue As Integer)
                me.SetInteger("Disabled", me._disabled, pValue)
            End Set
        End Property

        Property Shadow As Integer
            Get
                Shadow = me._shadow
            End Get
            Set(pValue As Integer)
                me.SetInteger("Shadow", me._shadow, pValue)
            End Set
        End Property

        Property Opacity As Integer
            Get
                Opacity = me._opacity
            End Get
            Set(pValue As Integer)
                me.SetInteger("Opacity", me._opacity, pValue)
            End Set
        End Property

        Property Transparent As Boolean
            Get
                Transparent = me._transparent
            End Get
            Set(pValue As Boolean)
                me.SetBoolean("Transparent", me._transparent, pValue)
            End Set
        End Property

        Property Parent As Boolean
            Get
                Parent = me._parent
            End Get
            Set(pValue As Boolean)
                me.SetBoolean("Parent", me._parent, pValue)
            End Set
        End Property

        Sub New(pOnChange As DelChange, pName As String = "")
            MyBase.New(pOnChange, pName)
        End Sub

        Sub New(pName As String = "")
            MyBase.New(pName)
        End Sub

        Sub New(pValue As PropsColor)
            MyBase.New(pValue)
            me.Fill(pValue)
        End Sub

        Sub Fill(pValue As PropsColor)
            If pValue = NULL Then
                Exit Sub
            End If
            me.PauseNotify()
            With pValue
                me.Value = .Value
                me.Background = .Background
                me.Foreground = .Foreground
                me.Border = .Border
                me.Hover = .Hover
                me.Focus = .Focus
                me.Disabled = .Disabled
                me.Shadow = .Shadow
                me.Opacity = .Opacity
                me.Transparent = .Transparent
                me.Parent = .Parent
            End With
            me.ResumeNotify()
        End Sub

        Function Copy() As PropsColor
            Copy = New PropsColor(me)
        End Function

        Function ToString(pPrint As Boolean = False) As String
            With console.Block("PropsColor")
                .Prop("Value", me.Value)
                .Prop("Background", me.Background)
                .Prop("Foreground", me.Foreground)
                .Prop("Border", me.Border)
                .Prop("Hover", me.Hover)
                .Prop("Focus", me.Focus)
                .Prop("Disabled", me.Disabled)
                .Prop("Shadow", me.Shadow)
                .Prop("Opacity", me.Opacity)
                .Prop("Transparent", me.Transparent)
                .Prop("Parent", me.Parent)
                .Close()
                .Printe(pPrint)
                ToString = .Text
                .Free()
            End With
        End Function

        Sub Free()
            MyBase.Free()
        End Sub

    End Class

    Class PropsFont
        Inherits Notifier

        Private _name As String = "Arial"
        Private _size As Integer = 10
        Private _bold As Boolean = False
        Private _italic As Boolean = False
        Private _underline As Boolean = False
        Private _wordWrap As Boolean = False
        Private _autoEllipsis As Boolean = False
        Private _alignment As TAlignment = taLeftJustify
        Private _parent As Boolean

        Property Name As String
            Get
                Name = me._name
            End Get
            Set(pValue As String)
                me.SetString("Name", me._name, pValue)
            End Set
        End Property

        Property Size As Integer
            Get
                Size = me._size
            End Get
            Set(pValue As Integer)
                me.SetInteger("Size", me._size, pValue)
            End Set
        End Property

        Property Bold As Boolean
            Get
                Bold = me._bold
            End Get
            Set(pValue As Boolean)
                me.SetBoolean("Bold", me._bold, pValue)
            End Set
        End Property

        Property Italic As Boolean
            Get
                Italic = me._italic
            End Get
            Set(pValue As Boolean)
                me.SetBoolean("Italic", me._italic, pValue)
            End Set
        End Property

        Property Underline As Boolean
            Get
                Underline = me._underline
            End Get
            Set(pValue As Boolean)
                me.SetBoolean("Underline", me._underline, pValue)
            End Set
        End Property

        Property WordWrap As Boolean
            Get
                WordWrap = me._wordWrap
            End Get
            Set(pValue As Boolean)
                me.SetBoolean("WordWrap", me._wordWrap, pValue)
            End Set
        End Property

        Property AutoEllipsis As Boolean
            Get
                AutoEllipsis = me._autoEllipsis
            End Get
            Set(pValue As Boolean)
                me.SetBoolean("AutoEllipsis", me._autoEllipsis, pValue)
            End Set
        End Property

        Property Alignment As TAlignment
            Get
                Alignment = me._alignment
            End Get
            Set(pValue As TAlignment)
                me._alignment = pValue
                me.Dispatch("Alignment")
            End Set
        End Property

        Property Parent As Boolean
            Get
                Parent = me._parent
            End Get
            Set(pValue As Boolean)
                me.SetBoolean("Parent", me._parent, pValue)
            End Set
        End Property

        Sub New(pOnChange As DelChange, pName As String = "")
            MyBase.New(pOnChange, pName)
        End Sub

        Sub New(pName As String = "")
            MyBase.New(pName)
        End Sub

        Sub New(pValue As PropsFont)
            MyBase.New(pValue)
            me.Fill(pValue)
        End Sub

        Sub Fill(pValue As PropsFont)
            If pValue = NULL Then
                Exit Sub
            End If
            me.PauseNotify()
            With pValue
                me.Name = .Name
                me.Size = .Size
                me.Bold = .Bold
                me.Italic = .Italic
                me.Underline = .Underline
                me.WordWrap = .WordWrap
                me.AutoEllipsis = .AutoEllipsis
                me.Alignment = .Alignment
                me.Parent = .Parent
            End With
            me.ResumeNotify()
        End Sub

        Sub Apply(ByRef pValue As TFont)
            With pValue
                .Name = me.Name
                .Size = me.Size
                .Bold = me.Bold
                .Italic = me.Italic
                .Underline = me.Underline
            End With
        End Sub

        Function Copy() As PropsFont
            Copy = New PropsFont(me)
        End Function

        Function ToString(pPrint As Boolean = False) As String
            With console.Block("PropsFont")
                .Prop("Name", me.Name)
                .Prop("Size", me.Size)
                .Prop("Bold", me.Bold)
                .Prop("Italic", me.Italic)
                .Prop("Underline", me.Underline)
                .Close()
                .Printe(pPrint)
                ToString = .Text
                .Free()
            End With
        End Function

        Sub Free()
            MyBase.Free()
        End Sub

    End Class

    Class PropsHint
        Inherits Notifier

        Private _value As String
        Private _color As Integer = -1
        Private _visible As Boolean = True
        Private _parent As Boolean

        Property Value As String
            Get
                Value = me._value
            End Get
            Set(pValue As String)
                me.SetString("Value", me._value, pValue)
            End Set
        End Property

        Property Color As Integer
            Get
                Color = me._color
            End Get
            Set(pValue As Integer)
                me.SetInteger("Color", me._color, pValue)
            End Set
        End Property

        Property Visible As Boolean
            Get
                Visible = me._visible
            End Get
            Set(pValue As Boolean)
                me.SetBoolean("Visible", me._visible, pValue)
            End Set
        End Property

        Property Parent As Boolean
            Get
                Parent = me._parent
            End Get
            Set(pValue As Boolean)
                me.SetBoolean("Parent", me._parent, pValue)
            End Set
        End Property

        Sub New(pOnChange As DelChange, pName As String = "")
            MyBase.New(pOnChange, pName)
        End Sub

        Sub New(pName As String = "")
            MyBase.New(pName)
        End Sub

        Sub New(pValue As PropsHint)
            MyBase.New(pValue)
            me.Fill(pValue)
        End Sub

        Sub Fill(pValue As PropsHint)
            If pValue = NULL Then
                Exit Sub
            End If
            me.PauseNotify()
            With pValue
                me.Value = .Value
                me.Color = .Color
                me.Visible = .Visible
                me.Parent = .Parent
            End With
            me.ResumeNotify()
        End Sub

        Function Copy() As PropsHint
            Copy = New PropsHint(me)
        End Function

        Function ToString(pPrint As Boolean = False) As String
            With console.Block("PropsHint")
                .Prop("Value", me.Value)
                .Prop("Color", me.Color)
                .Prop("Visible", me.Visible)
                .Prop("Parent", me.Parent)
                .Close()
                .Printe(pPrint)
                ToString = .Text
                .Free()
            End With
        End Function

        Sub Free()
            MyBase.Free()
        End Sub

    End Class

    Class PropsBorderSide
        Inherits Notifier

        Private _visible As Boolean = True
        Private _color As Integer
        Private _width As Integer = 1

        Property Visible As Boolean
            Get
                Visible = me._visible
            End Get
            Set(pValue As Boolean)
                me.SetBoolean("Visible", me._visible, pValue)
            End Set
        End Property

        Property Color As Integer
            Get
                Color = me._color
            End Get
            Set(pValue As Integer)
                me.SetInteger("Color", me._color, pValue)
            End Set
        End Property

        Property Width As Integer
            Get
                Width = me._width
            End Get
            Set(pValue As Integer)
                me.SetInteger("Width", me._width, pValue)
            End Set
        End Property

        Sub New(pOnChange As DelChange, pName As String = "")
            MyBase.New(pOnChange, pName)
        End Sub

        Sub New(pName As String = "")
            MyBase.New(pName)
        End Sub

        Sub New(pValue As PropsBorderSide)
            MyBase.New(pValue)
            me.Fill(pValue)
        End Sub

        Sub Fill(pValue As PropsBorderSide)
            If pValue = NULL Then
                Exit Sub
            End If
            me.PauseNotify()
            With pValue
                me.Visible = .Visible
                me.Color = .Color
                me.Width = .Width
            End With
            me.ResumeNotify()
        End Sub

        Function Copy() As PropsBorderSide
            Copy = New PropsBorderSide(me)
        End Function

        Function ToString(pPrint As Boolean = False) As String
            With console.Block("PropsBorderSide")
                .Prop("Visible", me.Visible)
                .Prop("Color", me.Color)
                .Prop("Width", me.Width)
                .Close()
                .Printe(pPrint)
                ToString = .Text
                .Free()
            End With
        End Function

        Sub Free()
            MyBase.Free()
        End Sub

    End Class

    Class PropsBorder
        Inherits Notifier

        Private _left As PropsBorderSide = New PropsBorderSide("Left")
        Private _top As PropsBorderSide = New PropsBorderSide("Top")
        Private _right As PropsBorderSide = New PropsBorderSide("Right")
        Private _bottom As PropsBorderSide = New PropsBorderSide("Bottom")

        Private _radius As Integer
        Private _color As Integer
        Private _style As Forms.TBorderStyle = Forms.bsNone

        Property Left As PropsBorderSide
            Get
                Left = me._left
            End Get
            Set(pValue As PropsBorderSide)
                me._left = pValue
                me.Attach(me._left)
                me.Dispatch("Left", pValue, "PropsBorderSide")
            End Set
        End Property

        Property Top As PropsBorderSide
            Get
                Top = me._top
            End Get
            Set(pValue As PropsBorderSide)
                me._top = pValue
                me.Attach(me._top)
                me.Dispatch("Top", pValue, "PropsBorderSide")
            End Set
        End Property

        Property Right As PropsBorderSide
            Get
                Right = me._right
            End Get
            Set(pValue As PropsBorderSide)
                me._right = pValue
                me.Attach(me._right)
                me.Dispatch("Right", pValue, "PropsBorderSide")
            End Set
        End Property

        Property Bottom As PropsBorderSide
            Get
                Bottom = me._bottom
            End Get
            Set(pValue As PropsBorderSide)
                me._bottom = pValue
                me.Attach(me._bottom)
                me.Dispatch("Bottom", pValue, "PropsBorderSide")
            End Set
        End Property

        Property Radius As Integer
            Get
                Radius = me._radius
            End Get
            Set(pValue As Integer)
                me.SetInteger("Radius", me._radius, pValue)
            End Set
        End Property

        Property Color As Integer
            Get
                Color = me._color
            End Get
            Set(pValue As Integer)
                me.SetInteger("Color", me._color, pValue)
            End Set
        End Property

        Property Style As TBorderStyle
            Get
                Style = me._style
            End Get
            Set(pValue As Forms.TBorderStyle)
                me._style = pValue
                me.Dispatch("Style")
            End Set
        End Property

        Sub New(pOnChange As DelChange, pName As String = "")
            MyBase.New(pOnChange, pName)
            me.SetHandlers()
        End Sub

        Sub New(pName As String = "")
            MyBase.New(pName)
            me.SetHandlers()
        End Sub

        Sub New(pValue As PropsBorder)
            MyBase.New(pValue)
            me.Fill(pValue)
        End Sub

        Private Sub SetHandlers()
            me.Attach(me._left)
            me.Attach(me._top)
            me.Attach(me._right)
            me.Attach(me._bottom)
        End Sub

        Private Sub ChildChanged(pName As String, pValue As Variant, pType As String)
            me.Dispatch(pName, pValue, pType)
        End Sub

        Sub Fill(pValue As PropsBorder)
            If pValue = NULL Then
                Exit Sub
            End If
            me.PauseNotify()
            With pValue
                me.Left = .Left.Copy()
                me.Top = .Top.Copy()
                me.Right = .Right.Copy()
                me.Bottom = .Bottom.Copy()
                me.Radius = .Radius
                me.Color = .Color
                me.Style = .Style
            End With
            me.ResumeNotify()
        End Sub

        Function Copy() As PropsBorder
            Copy = New PropsBorder(me)
        End Function

        Function ToString(pPrint As Boolean = False) As String
            With console.Block("PropsBorder")
                .Prop("Left", me.Left.ToString())
                .Prop("Top", me.Top.ToString())
                .Prop("Right", me.Right.ToString())
                .Prop("Bottom", me.Bottom.ToString())
                .Prop("Radius", me.Radius)
                .Prop("Color", me.Color)
                .Close()
                .Printe(pPrint)
                ToString = .Text
                .Free()
            End With
        End Function

        Sub Free()
            If me.Left <> NULL Then
                me.Left.Free()
            End If
            If me.Top <> NULL Then
                me.Top.Free()
            End If
            If me.Right <> NULL Then
                me.Right.Free()
            End If
            If me.Bottom <> NULL Then
                me.Bottom.Free()
            End If
            MyBase.Free()
        End Sub

    End Class

    Class Props
        Inherits Notifier

        Private _name As String
        Private _top As Integer
        Private _left As Integer
        Private _tabStop As Boolean
        Private _tabOrder As Integer
        Private _autoSize As Boolean

        Private _align As TAlign = alNone
        Private _alignWithMargins As Boolean = True
        Private _alignDisabled As Boolean = False
        Private _alignment As TAlignment = taLeftJustify

        Private _visible As Boolean = True
        Private _enabled As Boolean = True
        Private _onlyRead As Boolean = False

        Private _hint As PropsHint = New PropsHint("Hint")
        Private _width As PropsSize = New PropsSize("Width")
        Private _height As PropsSize = New PropsSize("Height")
        Private _size As PropsSize = New PropsSize("Size")
        Private _padding As PropsBox = New PropsBox("Padding")
        Private _margins As PropsBox = New PropsBox("Margins")
        Private _border As PropsBorder = New PropsBorder("Border")
        Private _font As PropsFont = New PropsFont("Font")
        Private _color As PropsColor = New PropsColor("Color")

        Property Name As String
            Get
                Name = me._name
            End Get
            Set(pValue As String)
                me.SetString("Name", me._name, pValue)
            End Set
        End Property

        Property Top As Integer
            Get
                Top = me._top
            End Get
            Set(pValue As Integer)
                me.SetInteger("Top", me._top, pValue)
            End Set
        End Property

        Property Left As Integer
            Get
                Left = me._left
            End Get
            Set(pValue As Integer)
                me.SetInteger("Left", me._left, pValue)
            End Set
        End Property

        Property TabStop As Boolean
            Get
                TabStop = me._tabStop
            End Get
            Set(pValue As Boolean)
                me.SetBoolean("TabStop", me._tabStop, pValue)
            End Set
        End Property

        Property TabOrder As Integer
            Get
                TabOrder = me._tabOrder
            End Get
            Set(pValue As Integer)
                me.SetInteger("TabOrder", me._tabOrder, pValue)
            End Set
        End Property

        Property AutoSize As Boolean
            Get
                AutoSize = me._autoSize
            End Get
            Set(pValue As Boolean)
                me.SetBoolean("AutoSize", me._autoSize, pValue)
            End Set
        End Property

        Property Align As TAlign
            Get
                Align = me._align
            End Get
            Set(pValue As TAlign)
                me._align = pValue
                me.Dispatch("Align")
            End Set
        End Property

        Property AlignWithMargins As Boolean
            Get
                AlignWithMargins = me._alignWithMargins
            End Get
            Set(pValue As Boolean)
                me.SetBoolean("AlignWithMargins", me._alignWithMargins, pValue)
            End Set
        End Property

        Property AlignDisabled As Boolean
            Get
                AlignDisabled = me._alignDisabled
            End Get
            Set(pValue As Boolean)
                me.SetBoolean("AlignDisabled", me._alignDisabled, pValue)
            End Set
        End Property

        Property Alignment As TAlignment
            Get
                Alignment = me._alignment
            End Get
            Set(pValue As TAlignment)
                me._alignment = pValue
                me.Dispatch("Alignment")
            End Set
        End Property

        Property Visible As Boolean
            Get
                Visible = me._visible
            End Get
            Set(pValue As Boolean)
                me.SetBoolean("Visible", me._visible, pValue)
            End Set
        End Property

        Property Enabled As Boolean
            Get
                Enabled = me._enabled
            End Get
            Set(pValue As Boolean)
                me.SetBoolean("Enabled", me._enabled, pValue)
            End Set
        End Property

        Property OnlyRead As Boolean
            Get
                OnlyRead = me._onlyRead
            End Get
            Set(pValue As Boolean)
                me.SetBoolean("OnlyRead", me._onlyRead, pValue)
            End Set
        End Property

        Property Hint As PropsHint
            Get
                Hint = me._hint
            End Get
            Set(pValue As PropsHint)
                me._hint = pValue
                me.Attach(me._hint)
                me.Dispatch("Hint", pValue, "PropsHint")
            End Set
        End Property

        Property Width As PropsSize
            Get
                Width = me._width
            End Get
            Set(pValue As PropsSize)
                me._width = pValue
                me.Attach(me._width)
                me.Dispatch("Width", pValue, "PropsSize")
            End Set
        End Property

        Property Height As PropsSize
            Get
                Height = me._height
            End Get
            Set(pValue As PropsSize)
                me._height = pValue
                me.Attach(me._height)
                me.Dispatch("Height", pValue, "PropsSize")
            End Set
        End Property

        Property Size As PropsSize
            Get
                Size = me._size
            End Get
            Set(pValue As PropsSize)
                me._size = pValue
                me.Attach(me._size)
                me.Dispatch("Size", pValue, "PropsSize")
            End Set
        End Property

        Property Padding As PropsBox
            Get
                Padding = me._padding
            End Get
            Set(pValue As PropsBox)
                me._padding = pValue
                me.Attach(me._padding)
                me.Dispatch("Padding", pValue, "PropsBox")
            End Set
        End Property

        Property Margins As PropsBox
            Get
                Margins = me._margins
            End Get
            Set(pValue As PropsBox)
                me._margins = pValue
                me.Attach(me._margins)
                me.Dispatch("Margins", pValue, "PropsBox")
            End Set
        End Property

        Property Border As PropsBorder
            Get
                Border = me._border
            End Get
            Set(pValue As PropsBorder)
                me._border = pValue
                me.Attach(me._border)
                me.Dispatch("Border", pValue, "PropsBorder")
            End Set
        End Property

        Property Font As PropsFont
            Get
                Font = me._font
            End Get
            Set(pValue As PropsFont)
                me._font = pValue
                me.Attach(me._font)
                me.Dispatch("Font", pValue, "PropsFont")
            End Set
        End Property

        Property Color As PropsColor
            Get
                Color = me._color
            End Get
            Set(pValue As PropsColor)
                me._color = pValue
                me.Attach(me._color)
                me.Dispatch("Color", pValue, "PropsColor")
            End Set
        End Property

        Sub New(pOnChange As DelChange, pName As String = "")
            MyBase.New(pOnChange, pName)
            me.SetHandlers()
        End Sub

        Sub New(pName As String = "")
            MyBase.New(pName)
            me.SetHandlers()
        End Sub

        Sub New(pValue As Props)
            MyBase.New(pValue)
            me.Fill(pValue)
        End Sub

        Private Sub SetHandlers()
            me.Attach(me._hint)
            me.Attach(me._width)
            me.Attach(me._height)
            me.Attach(me._size)
            me.Attach(me._padding)
            me.Attach(me._margins)
            me.Attach(me._border)
            me.Attach(me._font)
            me.Attach(me._color)
        End Sub

        Private Sub ChildChanged(pName As String, pValue As Variant, pType As String)
            me.Dispatch(pName, pValue, pType)
        End Sub

        Sub Fill(pValue As Props)
            If pValue = NULL Then
                Exit Sub
            End If
            MyBase.Fill(pValue)
            me.PauseNotify()
            With pValue
                me.Name = .Name
                me.Top = .Top
                me.Left = .Left
                me.TabStop = .TabStop
                me.TabOrder = .TabOrder
                me.AutoSize = .AutoSize

                me.Hint = .Hint.Copy()
                me.Width = .Width.Copy()
                me.Height = .Height.Copy()
                me.Size = .Size.Copy()
                me.Padding = .Padding.Copy()
                me.Margins = .Margins.Copy()
                me.Border = .Border.Copy()
                me.Font = .Font.Copy()
                me.Color = .Color.Copy()

                me.Align = .Align
                me.AlignWithMargins = .AlignWithMargins
                me.AlignDisabled = .AlignDisabled
                me.Alignment = .Alignment

                me.Visible = .Visible
                me.Enabled = .Enabled
                me.OnlyRead = .OnlyRead
            End With
            me.ResumeNotify()
        End Sub

        Function Copy() As Props
            Copy = New Props(me)
        End Function

        Function ToString(pPrint As Boolean = False) As String
            With console.Block("Props")
                .Prop("Name", me.Name)
                .Prop("Top", me.Top)
                .Prop("Left", me.Left)
                .Prop("TabStop", me.TabStop)
                .Prop("TabOrder", me.TabOrder)
                .Prop("AutoSize", me.AutoSize)
                .Prop("Hint", me.Hint.ToString())
                .Prop("Width", me.Width.ToString())
                .Prop("Height", me.Height.ToString())
                .Prop("Size", me.Size.ToString())
                .Prop("Padding", me.Padding.ToString())
                .Prop("Margins", me.Margins.ToString())
                .Prop("Border", me.Border.ToString())
                .Prop("Font", me.Font.ToString())
                .Prop("Color", me.Color.ToString())
                .Prop("AlignWithMargins", me.AlignWithMargins)
                .Prop("AlignDisabled", me.AlignDisabled)
                .Prop("Visible", me.Visible)
                .Prop("Enabled", me.Enabled)
                .Prop("OnlyRead", me.OnlyRead)
                .Close()
                .Printe(pPrint)
                ToString = .Text
                .Free()
            End With

        End Function

        Sub Free()
            If me.Hint <> NULL Then
                me.Hint.Free()
            End If
            If me.Width <> NULL Then
                me.Width.Free()
            End If
            If me.Height <> NULL Then
                me.Height.Free()
            End If
            If me.Size <> NULL Then
                me.Size.Free()
            End If
            If me.Padding <> NULL Then
                me.Padding.Free()
            End If
            If me.Margins <> NULL Then
                me.Margins.Free()
            End If
            If me.Border <> NULL Then
                me.Border.Free()
            End If
            If me.Font <> NULL Then
                me.Font.Free()
            End If
            If me.Color <> NULL Then
                me.Color.Free()
            End If
            MyBase.Free()
        End Sub

    End Class

End Namespace