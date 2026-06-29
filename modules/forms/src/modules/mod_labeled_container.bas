Imports Forms


Namespace mod_labeled_container

    Class TLabeledContainer

        Protected _control As CustomControl
        Protected _label As StaticText
        Protected _container As CustomControl

        Private _position As TAlign = alLeft
        Private _spacing As Integer = 6
        Private _heightEdit As Integer = 21
        Private _lblWidth As Integer

        Sub New(pControl As Forms.TWinControl, pLabel As String, pLabelWidth As Integer = 80)
            MyBase.New()
            me._lblWidth = pLabelWidth

            me._control = New CustomControl(pControl)
            me._control.Align = alTop

            me._label = New StaticText(me._control)
            me._label.AutoSize = False
            me._label.WordWrap = True
            me._label.AlignWithMargins = True
            me._label.Width = me._lblWidth

            me._container = New CustomControl(me._control)
            me._container.AlignWithMargins = True

            me.Caption = pLabel
            me.UpdateLayout()
        End Sub

        Property Caption As String
            Get
                Caption = me._label.Caption
            End Get
            Set(pValue As String)
                me.SetCaption(pValue)
            End Set
        End Property

        Property LabelPosition As TAlign
            Get
                LabelPosition = me._position
            End Get
            Set(pValue As TAlign)
                me._position = pValue
                me.UpdateLayout()
            End Set
        End Property

        Property LabelSpacing As Integer
            Get
                LabelSpacing = me._spacing
            End Get
            Set(pValue As Integer)
                me._spacing = pValue
                me.UpdateLayout()
            End Set
        End Property

        Property LabelWidth As Integer
            Get
                LabelWidth = me._lblWidth
            End Get
            Set(pValue As Integer)
                me._lblWidth = pValue
                me.UpdateLayout()
            End Set
        End Property

        Property Control As CustomControl
            Get
                Control = me._control
            End Get
        End Property

        Property Label As StaticText
            Get
                Label = me._label
            End Get
        End Property

        Property Container As CustomControl
            Get
                Container = me._container
            End Get
        End Property

        Private Sub UpdateLayout()
            me._label.Width = me._lblWidth
            me._label.Align = me._position
            me._container.Align = alClient

            me.ResetMargins(me._label.Margins)
            me.ResetMargins(me._container.Margins)
            me._container.Margins.Bottom = 3

            Select me._position
                Case alTop
                    me._label.Alignment = taLeftJustify
                    me._label.Height = 14
                    me._spacing = 0
                    me._label.Margins.Bottom = me._spacing
                    me._control.Height = me._label.Height + me._heightEdit + me._spacing + 2

                Case alBottom
                    me._label.Alignment = taLeftJustify
                    me._label.Height = 14
                    me._spacing = 0
                    me._label.Margins.Top = me._spacing
                    me._control.Height = me._label.Height + me._heightEdit + me._spacing + 2

                Case alLeft
                    me._label.Alignment = taRightJustify
                    If me.Caption.Length <= 20 Then
                        me._label.Margins.Top = 4
                    End If
                    me._label.Margins.Right = me._spacing
                    me._container.Margins.Top = 2
                    me._control.Height = me._heightEdit + 5

                Case alRight
                    me._label.Alignment = taLeftJustify
                    If me.Caption.Length <= 20 Then
                        me._label.Margins.Top = 4
                    End If
                    me._label.Margins.Left = me._spacing
                    me._container.Margins.Top = 2
                    me._control.Height = me._heightEdit + 5

            End Select
        End Sub

        Private Sub SetCaption(pValue As String)
            me._label.Caption = pValue
        End Sub

        Private Sub ResetMargins(ByRef m As TMargins)
            m.Left = 0
            m.Top = 0
            m.Right = 0
            m.Bottom = 0
        End Sub

        Sub Free()
            MyBase.Free()
        End Sub
    End Class

End Namespace