' @example: forms/03-form-com-eventos
' @demonstrates: botão com OnClick ligado a um handler + evento próprio OnSalvarEvent disparado com guarda <> NULL
' @diagnostics: none
'
Imports Forms

Namespace mod_tela_eventos

   Class TTelaEventos

      ' evento público da tela — o chamador assina via tela.OnSalvarEvent = handler
      OnSalvarEvent As TNotifyEvent

      Private _form As Forms.Form
      Private _content As Forms.PageControl
      Private _salvar As Forms.CommandButton

      Sub New(pTitle As String = "Cadastro")
         me._build(pTitle)
      End Sub

      Private Sub _build(pTitle As String)
         me._form = New Forms.Form()
         me._form.Caption = pTitle

         me._content = New Forms.PageControl(me._form)
         me._content.Align = alClient

         me._salvar = New Forms.CommandButton(me._content)
         me._salvar.Caption = "Salvar"
         me._salvar.Align = alBottom
         me._salvar.Height = 28

         ' atribui a referência do método (sem parênteses) ao evento do controle
         me._salvar.OnClick = me._handleSalvar
      End Sub

      ' handler do clique — assinatura de TNotifyEvent: Sub (Sender As TObject)
      Private Sub _handleSalvar(pSender As TObject)
         ' repassa para o evento público da tela, se alguém assinou
         If me.OnSalvarEvent <> NULL Then me.OnSalvarEvent(me)
      End Sub

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
