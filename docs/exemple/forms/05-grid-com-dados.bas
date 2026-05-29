' @example: forms/05-grid-com-dados
' @demonstrates: Grid com cabeçalho fixo + preenchimento de células via Cells(col, row), ColCount/RowCount/FixedRows
' @diagnostics: none
'
Imports Forms

Namespace mod_tela_grid_dados

   Class TTelaGridDados

      Private _form As Forms.Form
      Private _content As Forms.PageControl
      Private _grid As Forms.Grid

      Sub New(pTitle As String = "Clientes")
         me._build(pTitle)
         me._popular()
      End Sub

      Private Sub _build(pTitle As String)
         me._form = New Forms.Form()
         me._form.Caption = pTitle

         me._content = New Forms.PageControl(me._form)
         me._content.Align = alClient

         me._grid = New Forms.Grid(me._content)
         me._grid.Align = alClient
         me._grid.FixedRows = 1      ' primeira linha é o cabeçalho
      End Sub

      ' Preenche o grid: 3 colunas (Código, Nome, UF) + 2 linhas de dados.
      Private Sub _popular()
         me._grid.ColCount = 3
         me._grid.RowCount = 3       ' 1 cabeçalho + 2 dados

         ' cabeçalho (linha 0)
         me._grid.Cells(0, 0) = "Código"
         me._grid.Cells(1, 0) = "Nome"
         me._grid.Cells(2, 0) = "UF"

         ' linha 1
         me._grid.Cells(0, 1) = "1"
         me._grid.Cells(1, 1) = "Se7e Sistemas"
         me._grid.Cells(2, 1) = "PR"

         ' linha 2
         me._grid.Cells(0, 2) = "2"
         me._grid.Cells(1, 2) = "Data7 ERP"
         me._grid.Cells(2, 2) = "SP"
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
