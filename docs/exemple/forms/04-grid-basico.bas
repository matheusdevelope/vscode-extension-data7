' @example: forms/04-grid-basico
' @demonstrates: colocação de um Forms.Grid preenchendo o conteúdo da tela (alClient)
' @diagnostics: none
'
Imports Forms

Namespace mod_tela_grid

   Class TTelaGrid

      Private _form As Forms.Form
      Private _content As Forms.PageControl
      Private _grid As Forms.Grid

      Sub New(pTitle As String = "Listagem")
         me._build(pTitle)
      End Sub

      Private Sub _build(pTitle As String)
         me._form = New Forms.Form()
         me._form.Caption = pTitle

         me._content = New Forms.PageControl(me._form)
         me._content.Align = alClient

         ' o grid preenche todo o conteúdo
         me._grid = New Forms.Grid(me._content)
         me._grid.Align = alClient
      End Sub

      Property Grid As Forms.Grid
         Get
            Grid = me._grid
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
