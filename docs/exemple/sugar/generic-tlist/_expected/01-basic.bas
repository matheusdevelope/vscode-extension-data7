' @example: sugar/generic-tlist/01-basic
' @demonstrates: Class TList<T> monomorfizada para TList_Product
' @diagnostics: none
' @transpiled-to: sugar/generic-tlist/_expected/01-basic.bas
'
Namespace mod_demo


   Class TDemo
      Public Sub Run()
         Dim _products As TList_Product
         _products.Add(New Product())
      End Sub
   End Class

   Class TList_Product
      Public Count As Integer

      Sub Add(pValue As Product)
         me.Count = me.Count + 1
      End Sub
   End Class
End Namespace
