' @example: forms/02-layout-header-content-footer
' @demonstrates: layout de 3 regiões (header alTop / content alClient / footer alBottom) com Line divisória
' @diagnostics: none
'
Imports Forms

Namespace mod_tela_layout

   Class TTelaLayout

      Private _form As Forms.Form
      Private _header As Forms.PageControl
      Private _divider As Forms.Line
      Private _content As Forms.PageControl
      Private _footer As Forms.PageControl

      Sub New(pTitle As String = "Tela com layout")
         me._build(pTitle)
      End Sub

      Private Sub _build(pTitle As String)
         me._form = New Forms.Form()
         me._form.Caption = pTitle

         ' header colado no topo, altura fixa
         me._header = New Forms.PageControl(me._form)
         me._header.Align = alTop
         me._header.Height = 40

         ' linha divisória logo abaixo do header
         me._divider = New Forms.Line(me._form)
         me._divider.Align = alTop
         me._divider.Height = 2
         me._divider.Pen.Color = RGB(192, 192, 192)

         ' footer colado na base, altura fixa
         me._footer = New Forms.PageControl(me._form)
         me._footer.Align = alBottom
         me._footer.Height = 32

         ' conteúdo POR ÚLTIMO com alClient para preencher o que sobrou
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
