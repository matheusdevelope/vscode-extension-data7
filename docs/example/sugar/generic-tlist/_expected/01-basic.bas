' @example: sugar/generic-tlist/_expected/01-basic
' @demonstrates: Forma nativa gerada pelo SugarTranspiler para sugar/generic-tlist/01-basic
' @diagnostics: none
'
Namespace mod_demo
   Class TDemo
      Public Sub Run()
         Dim _products As TList_Product
         _products.Add(New Product())
      End Sub
   End Class
   Class TList_T
      Count As Integer
      Sub Add(pValue As T)
         me.Count = me.Count + 1
      End Sub
   End Class
   Class TList_Product
      Count As Integer
      Sub Add(pValue As Product)
         me.Count = me.Count + 1
      End Sub
   End Class
End Namespace
