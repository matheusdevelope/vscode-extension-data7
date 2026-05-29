' @example: builder/tela-cadastro/src/mod_form_cliente
' @demonstrates: módulo de tela de cadastro (Form + TextBox + botão com evento) consumido pelo Principal
' @diagnostics: none
' @requires: projeto tela-cadastro (indexado junto com Principal.bas)
'
Imports Forms

'@Module
Namespace mod_form_cliente

   Class TFormCliente

      OnSalvarEvent As TNotifyEvent

      Private _form As Forms.Form
      Private _content As Forms.PageControl
      Private _nome As Forms.TextBox
      Private _salvar As Forms.CommandButton

      Sub New(pTitle As String = "Cadastro de Cliente")
         me._build(pTitle)
      End Sub

      Private Sub _build(pTitle As String)
         me._form = New Forms.Form()
         me._form.Caption = pTitle

         me._content = New Forms.PageControl(me._form)
         me._content.Align = alClient

         me._nome = New Forms.TextBox(me._content)
         me._nome.Align = alTop

         me._salvar = New Forms.CommandButton(me._content)
         me._salvar.Caption = "Salvar"
         me._salvar.Align = alBottom
         me._salvar.Height = 28
         me._salvar.OnClick = me._handleSalvar
      End Sub

      Private Sub _handleSalvar(pSender As TObject)
         If me.OnSalvarEvent <> NULL Then me.OnSalvarEvent(me)
      End Sub

      Property Nome As String
         Get
            Nome = me._nome.Text
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
