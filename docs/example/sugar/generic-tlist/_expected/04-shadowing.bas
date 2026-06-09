' @example: sugar/generic-tlist/_expected/04-shadowing
' @demonstrates: Forma nativa gerada pelo SugarTranspiler para sugar/generic-tlist/04-shadowing
' @diagnostics: none
'
Namespace mod_demo
   Class TDemo
      Public Sub Run()
         Dim _products As TList_Product
         _products.Add(New Product())
      End Sub
   End Class
   Class TList_Product
      Count As Integer
      Sub Add(pValue As Product)
         Dim T As String = "valor de T"
         me.Count = me.Count + 1
      End Sub
   End Class
End Namespace
