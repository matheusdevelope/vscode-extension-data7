' @example: forms/07-abas-pagecontrol
' @demonstrates: PageControl com abas (TabSheet) — cada aba é criada com o PageControl como pai e recebe Caption
' @diagnostics: none
'
Imports Forms

Namespace mod_tela_abas

   Class TTelaAbas

      Private _form As Forms.Form
      Private _abas As Forms.PageControl
      Private _abaDados As Forms.TabSheet
      Private _abaConfig As Forms.TabSheet

      Sub New(pTitle As String = "Configurações")
         me._build(pTitle)
      End Sub

      Private Sub _build(pTitle As String)
         me._form = New Forms.Form()
         me._form.Caption = pTitle

         ' o container de abas preenche a janela
         me._abas = New Forms.PageControl(me._form)
         me._abas.Align = alClient

         ' cada aba é filha do PageControl
         me._abaDados = New Forms.TabSheet(me._abas)
         me._abaDados.Caption = "Dados"

         me._abaConfig = New Forms.TabSheet(me._abas)
         me._abaConfig.Caption = "Avançado"
         me._abaConfig.TabVisible = True

         ' conteúdo de cada aba usa a TabSheet como pai
         Dim titulo As Forms.StaticText = New Forms.StaticText(me._abaDados)
         titulo.Caption = "Informações do cliente"
         titulo.Align = alTop
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
