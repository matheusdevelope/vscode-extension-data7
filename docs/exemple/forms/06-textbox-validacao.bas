' @example: forms/06-textbox-validacao
' @demonstrates: TextBox + NumberTextBox com OnChange ligado a um handler que lê .Text e valida
' @diagnostics: none
'
Imports Forms

Namespace mod_tela_validacao

   Class TTelaValidacao

      ' evento próprio disparado quando os campos ficam válidos/inválidos
      OnValidEvent As TNotifyEvent

      Private _form As Forms.Form
      Private _content As Forms.PageControl
      Private _nome As Forms.TextBox
      Private _valor As Forms.NumberTextBox
      Private _valido As Boolean

      Sub New(pTitle As String = "Cadastro")
         me._build(pTitle)
      End Sub

      Private Sub _build(pTitle As String)
         me._form = New Forms.Form()
         me._form.Caption = pTitle

         me._content = New Forms.PageControl(me._form)
         me._content.Align = alClient

         me._nome = New Forms.TextBox(me._content)
         me._nome.Align = alTop
         me._nome.OnChange = me._handleChange

         me._valor = New Forms.NumberTextBox(me._content)
         me._valor.Align = alTop
         me._valor.OnChange = me._handleChange
      End Sub

      ' OnChange usa TNotifyEvent: Sub (Sender As TObject).
      Private Sub _handleChange(pSender As TObject)
         me._valido = (me._nome.Text <> "") And (me._valor.Text <> "")
         If me._valido And me.OnValidEvent <> NULL Then
            me.OnValidEvent(me)
         End If
      End Sub

      Property Valido As Boolean
         Get
            Valido = me._valido
         End Get
      End Property

      Function Show() As Boolean
         me._form.Show()
         Show = True
      End Function

      Sub Free()
         me._form.Free()
         MyBase.Free()
      End Sub

   End Class

End Namespace
