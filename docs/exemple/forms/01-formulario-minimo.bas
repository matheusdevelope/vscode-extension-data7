' @example: forms/01-formulario-minimo
' @demonstrates: tela mínima — classe que possui um Forms.Form privado, monta no _build e expõe Show/Free
' @diagnostics: none
'
Imports Forms

Namespace mod_minha_tela

   Class TMinhaTela

      Private _form As Forms.Form
      Private _content As Forms.PageControl

      Sub New(pTitle As String = "Minha Tela")
         me._build(pTitle)
      End Sub

      Private Sub _build(pTitle As String)
         me._form = New Forms.Form()
         me._form.Caption = pTitle

         ' o conteúdo preenche todo o miolo da janela
         me._content = New Forms.PageControl(me._form)
         me._content.Align = alClient
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
