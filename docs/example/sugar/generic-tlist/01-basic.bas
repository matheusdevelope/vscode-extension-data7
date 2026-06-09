' @example: sugar/generic-tlist/01-basic
' @demonstrates: Class TList<T> monomorfizada para TList_Product
' @diagnostics: none
' @transpiled-to: sugar/generic-tlist/_expected/01-basic.bas
'
Namespace mod_demo

   Class TList<T>
      Public Count As Integer

      Sub Add(pValue As T)
         me.Count = me.Count + 1
      End Sub
   End Class

   Class TDemo
      Public Sub Run()
         Dim _products As TList<Product>
         _products.Add(New Product())
      End Sub
   End Class

End Namespace
