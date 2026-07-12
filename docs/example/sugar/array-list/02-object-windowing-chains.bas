' @example: sugar/array-list/02-object-windowing-chains
' @demonstrates: array sugar em objetos — Map homomórfico, First/Last/Slice, Includes, cadeia Filter.Map (mod_testes_array_objetos)
' @diagnostics: none
'
Imports mod_tlist

Namespace mod_testes_array_objetos
   Class Produto
      Private nome As String
      Private preco As Double

      Sub New(nome As String, preco As Double)
         MyBase.New()
         me.nome = nome
         me.preco = preco
      End Sub

      Function GetNome() As String
         GetNome = nome
      End Function

      Function GetPreco() As Double
         GetPreco = me.preco
      End Function

      Sub SetNome(nome As String)
         me.nome = nome
      End Sub

      Sub Free()
         MyBase.Free()
      End Sub
   End Class

   Class HelperProduto
      Shared Function FindProduto2(pValue As Produto, i As Integer, extra As Variant) As Boolean
         FindProduto2 = pValue.GetNome() = "Produto 2"
      End Function

      Sub New()
         MyBase.New()
      End Sub

      Sub Free()
         MyBase.Free()
      End Sub
   End Class

   Sub ExecutarTesteArrayObjetos()
      Dim produtos[] As Produto = [
         New Produto("Produto 1", 10.0),
         New Produto("Produto 2", 20.0),
         New Produto("Produto 3", 30.0)
      ]

      produtos.Push(New Produto("Produto 4", 40.0))

      Dim produtosRenomeados[] As Produto = produtos.Map<Produto>(
         Function(pItem As Produto, pIdx As Integer) As Produto
            Return New Produto(pItem.GetNome() & " (Renomeado)", pItem.GetPreco())
         End Function
      )

      Dim copiaProdutos[] As Produto
      produtosRenomeados.ForEach(
         Sub(pItem As Produto, pIdx As Integer)
            copiaProdutos.Push(New Produto(pItem.GetNome(), pItem.GetPreco()))
            copiaProdutos.Last().SetNome(pItem.GetNome() & " (Cópia)")
         End Sub
      )

      Dim primeiros2[] As Produto = produtos.First(2)
      Dim ultimos2[] As Produto = produtos.Last(2)
      Dim faixaProdutos[] As Produto = produtos.Slice(1, 3)

      Dim refProduto As Produto = produtos[1]
      Dim contemRefProduto As Boolean = produtos.Includes(refProduto)

      Dim produtoPorDelegate As Produto = produtos.Find(HelperProduto.FindProduto2)

      Dim totalProdutosCaros As Double = produtos. _
         Filter(Function(pItem As Produto) As Boolean pItem.GetPreco() > 15.0). _
         Map<Double>(Function(pItem As Produto) As Double pItem.GetPreco()). _
         Reduce<Double>(
            Function(pAcumulador As Double, pItem As Double) As Double pAcumulador + pItem,
            0.0
         )
   End Sub
End Namespace
