' @example: mod_demo_forms
' @demonstrates: Visual and Form Controls demo with Grid, Buttons, TextBox and dynamic Layouts
' @diagnostics: none
'
Imports Forms
Imports Collections

Namespace mod_demo_forms

   Class TProduto
      Public Codigo As String
      Public Nome As String
      Public Preco As Double
      Public PrecoOriginal As Double
      Public Estoque As Integer

      Sub New(pCodigo As String, pNome As String, pPreco As Double, pEstoque As Integer)
         MyBase.New()
         me.Codigo = pCodigo
         me.Nome = pNome
         me.Preco = pPreco
         me.PrecoOriginal = pPreco
         me.Estoque = pEstoque
      End Sub

      Function GetValorTotal() As Double
         GetValorTotal = me.Preco * me.Estoque
      End Function
   End Class

   Class TFormDemo

      Private _form As Forms.Form
      Private _headerPanel As Forms.Panel
      Private _contentPanel As Forms.Panel
      Private _footerPanel As Forms.Panel
      Private _grid As Forms.Grid
      Private _lblSearch As Forms.StaticText
      Private _txtSearch As Forms.TextBox
      Private _btnSearch As Forms.CommandButton
      Private _lblSummary As Forms.StaticText
      Private _btnDiscount As Forms.CommandButton
      Private _btnReset As Forms.CommandButton

      Private _produtos As StringList
      Private _filtroAtivo As Boolean
      Private _termoFiltro As String

      Sub New(pTitle As String = "Demonstração Data7")
         MyBase.New()
         me._inicializarProdutos()
         me._build(pTitle)
         me._popularGrid()
      End Sub

      Shared Function Load(pTitle As String) As TFormDemo
         Load = New TFormDemo(pTitle)
      End Function

      Shared Sub ShowMessage(pMessage As String)
         Forms.MessageBox.Show(pMessage)
      End Sub

      Private Sub _inicializarProdutos()
         me._produtos = New StringList()

         ' Adicionar alguns produtos de teste
         me._addProduto(New TProduto("P001", "Notebook Gamer", 5499.9, 12))
         me._addProduto(New TProduto("P002", "Monitor UltraWide 29", 1299.0, 25))
         me._addProduto(New TProduto("P003", "Teclado Mecânico RGB", 349.9, 50))
         me._addProduto(New TProduto("P004", "Mouse Wireless Ergonômico", 249.0, 40))
         me._addProduto(New TProduto("P005", "Headset Surround 7.1", 450.0, 15))
      End Sub

      Private Sub _addProduto(pProd As TProduto)
         me._produtos.AddObject(pProd.Nome, pProd)
      End Sub

      Private Sub _build(pTitle As String)
         ' Criação do Formulário
         me._form = New Forms.Form()
         me._form.Caption = pTitle
         me._form.Width = 800
         me._form.Height = 500

         ' Painel de Cabeçalho (Filtro)
         me._headerPanel = New Forms.Panel(me._form)
         me._headerPanel.Align = alTop
         me._headerPanel.Height = 60

         ' Label de Pesquisa
         me._lblSearch = New Forms.StaticText(me._headerPanel)
         me._lblSearch.Caption = "Filtrar por Nome:"
         me._lblSearch.Left = 15
         me._lblSearch.Top = 20
         me._lblSearch.Width = 110
         me._lblSearch.Height = 20

         ' Campo de Texto de Pesquisa
         me._txtSearch = New Forms.TextBox(me._headerPanel)
         me._txtSearch.Left = 130
         me._txtSearch.Top = 16
         me._txtSearch.Width = 250
         me._txtSearch.Height = 24
         me._txtSearch.OnChange = me._handleSearchChange

         ' Botão de Pesquisa (Filtro manual/forçado)
         me._btnSearch = New Forms.CommandButton(me._headerPanel)
         me._btnSearch.Caption = "Filtrar"
         me._btnSearch.Left = 390
         me._btnSearch.Top = 15
         me._btnSearch.Width = 80
         me._btnSearch.Height = 28
         me._btnSearch.OnClick = me._handleSearchClick

         ' Painel de Rodapé (Resumo e Ações)
         me._footerPanel = New Forms.Panel(me._form)
         me._footerPanel.Align = alBottom
         me._footerPanel.Height = 60

         ' Label com Resumo
         me._lblSummary = New Forms.StaticText(me._footerPanel)
         me._lblSummary.Left = 15
         me._lblSummary.Top = 20
         me._lblSummary.Width = 350
         me._lblSummary.Height = 20

         ' Botão Aplicar Desconto
         me._btnDiscount = New Forms.CommandButton(me._footerPanel)
         me._btnDiscount.Caption = "Aplicar Desconto (-10%)"
         me._btnDiscount.Left = 380
         me._btnDiscount.Top = 15
         me._btnDiscount.Width = 180
         me._btnDiscount.Height = 30
         me._btnDiscount.OnClick = me._handleDiscountClick

         ' Botão Restaurar Preços
         me._btnReset = New Forms.CommandButton(me._footerPanel)
         me._btnReset.Caption = "Restaurar Preços"
         me._btnReset.Left = 570
         me._btnReset.Top = 15
         me._btnReset.Width = 140
         me._btnReset.Height = 30
         me._btnReset.OnClick = me._handleResetClick

         ' Painel de Conteúdo Principal
         me._contentPanel = New Forms.Panel(me._form)
         me._contentPanel.Align = alClient

         ' Grid de Dados
         me._grid = New Forms.Grid(me._contentPanel)
         me._grid.Align = alClient
         me._grid.FixedRows = 1
         me._grid.ColCount = 6
         me._grid.FitCellsInGrid = True

         ' Configurar cabeçalhos do Grid
         me._grid.Cells(0, 0) = "Código"
         me._grid.Cells(1, 0) = "Produto"
         me._grid.Cells(2, 0) = "Preço Original"
         me._grid.Cells(3, 0) = "Preço Atual"
         me._grid.Cells(4, 0) = "Estoque"
         me._grid.Cells(5, 0) = "Valor Total"

         ' Assinar Eventos do Grid para Pesquisa/Editor Customizado
         me._grid.OnGetEditorType = me._handleGetEditorType
         me._grid.OnCellValidate = me._handleCellValidate
      End Sub

      Private Sub _popularGrid()
         Dim count As Integer = me._produtos.Count
         Dim row As Integer = 1
         Dim prod As TProduto
         Dim i As Integer

         ' Primeiro conta quantas linhas de dados teremos no grid
         ' para redimensionar o RowCount adequadamente.
         Dim totalLinhas As Integer = 1 ' 1 para o cabeçalho

         For i = 0 To count - 1
            prod = CType(me._produtos.Objects(i), TProduto)
            If me._passaFiltro(prod) Then
               totalLinhas = totalLinhas + 1
            End If
         Next

         me._grid.RowCount = totalLinhas

         ' Preenche as linhas do Grid
         For i = 0 To count - 1
            prod = CType(me._produtos.Objects(i), TProduto)
            If me._passaFiltro(prod) Then
               me._grid.Cells(0, row) = prod.Codigo
               me._grid.Cells(1, row) = prod.Nome
               me._grid.Cells(2, row) = "R$ " & prod.PrecoOriginal
               me._grid.Cells(3, row) = "R$ " + prod.Preco
               me._grid.Cells(4, row) = CStr(prod.Estoque)
               me._grid.Cells(5, row) = "R$ " & prod.GetValorTotal()

               row = row + 1
            End If
         Next

         ' Atualizar Resumo no Rodapé
         me._atualizarResumoFooter()
      End Sub

      Private Sub _atualizarResumoFooter()
         Dim totalGeral As Double = 0.0
         Dim count As Integer = me._grid.RowCount
         Dim i As Integer

         For i = 1 To count - 1
            Dim cod As String = me._grid.Cells(0, i)
            Dim prod As TProduto = me._findProdutoPorCodigo(cod)
            If prod <> NULL Then
               totalGeral = totalGeral + prod.GetValorTotal()
            End If
         Next

         me._lblSummary.Caption = "Total Geral em Estoque: R$ " & CStr(totalGeral)
      End Sub

      Private Function _findProdutoPorCodigo(pCod As String) As TProduto
         Dim count As Integer = me._produtos.Count
         Dim i As Integer
         Dim prod As TProduto
         For i = 0 To count - 1
            prod = CType(me._produtos.Objects(i), TProduto)
            If UCase(prod.Codigo) = UCase(pCod) Then
               _findProdutoPorCodigo = prod
               Return
            End If
         Next
         _findProdutoPorCodigo = NULL
      End Function

      Private Function _passaFiltro(pProd As TProduto) As Boolean
         If Not me._filtroAtivo Then
            _passaFiltro = True
            Return
         End If

         If InStr(UCase(pProd.Nome), UCase(me._termoFiltro)) > 0 Then
            _passaFiltro = True
         ElseIf InStr(UCase(pProd.Codigo), UCase(me._termoFiltro)) > 0 Then
            _passaFiltro = True
         Else
            _passaFiltro = False
         End If
      End Function

      ' Eventos do Grid
      Private Sub _handleGetEditorType(Sender As TObject, ACol As Integer, ARow As Integer, ByRef AEditor As Forms.TEditorType)
         If ACol = 0 And ARow > 0 Then
            AEditor = Forms.edNormal
         End If
      End Sub

      Private Sub _handleCellValidate(Sender As TObject, ACol As Integer, ARow As Integer, AValue As String, ByRef AValid As Boolean)
         If ACol = 0 Then
            Dim prod As TProduto = me._findProdutoPorCodigo(AValue)
            If prod <> NULL Then
               AValid = True

               me._grid.Cells(1, ARow) = prod.Nome
               me._grid.Cells(2, ARow) = "R$ " & CStr(prod.PrecoOriginal)
               me._grid.Cells(3, ARow) = "R$ " & CStr(prod.Preco)
               me._grid.Cells(4, ARow) = CStr(prod.Estoque)
               me._grid.Cells(5, ARow) = "R$ " & CStr(prod.GetValorTotal())

               me._atualizarResumoFooter()
            Else
               AValid = False
               Forms.MessageBox.Show("Produto não encontrado! Códigos válidos: P001, P002, P003, P004, P005")
            End If
         End If
      End Sub

      ' Evento de alteração no texto de busca (OnChange)
      Private Sub _handleSearchChange(pSender As TObject)
         me._termoFiltro = me._txtSearch.Text
         me._filtroAtivo = (me._termoFiltro <> "")
         me._popularGrid()
      End Sub

      ' Evento de clique no botão de busca (OnClick)
      Private Sub _handleSearchClick(pSender As TObject)
         me._termoFiltro = me._txtSearch.Text
         me._filtroAtivo = (me._termoFiltro <> "")
         me._popularGrid()
      End Sub

      ' Evento de clique em aplicar desconto (OnClick)
      Private Sub _handleDiscountClick(pSender As TObject)
         Dim count As Integer = me._produtos.Count
         Dim prod As TProduto
         Dim i As Integer
         For i = 0 To count - 1
            prod = CType(me._produtos.Objects(i), TProduto)
            ' Aplicar 10% de desconto
            prod.Preco = prod.PrecoOriginal * 0.9
         Next
         me._popularGrid()
         Forms.MessageBox.Show("Desconto de 10% aplicado com sucesso a todos os produtos!")
      End Sub

      ' Evento de clique em restaurar preços (OnClick)
      Private Sub _handleResetClick(pSender As TObject)
         Dim count As Integer = me._produtos.Count
         Dim prod As TProduto
         Dim i As Integer
         For i = 0 To count - 1
            prod = CType(me._produtos.Objects(i), TProduto)
            prod.Preco = prod.PrecoOriginal
         Next
         me._popularGrid()
         Forms.MessageBox.Show("Preços originais restaurados!")
      End Sub

      Function Show() As Boolean
         me._form.Show()
         Show = True
      End Function

      Sub Free()
         ' Libera os produtos
         Dim count As Integer = me._produtos.Count
         Dim prod As TProduto
         Dim i As Integer
         For i = 0 To count - 1
            prod = CType(me._produtos.Objects(i), TProduto)
            prod.Free()
         Next
         me._produtos.Free()

         ' Libera o form
         me._form.Free()
         MyBase.Free()
      End Sub

   End Class

End Namespace
