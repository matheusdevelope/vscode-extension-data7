' @example: diagnostics/generic-arity-mismatch/trigger
' @demonstrates: TList<T> declares 1 type parameter but usage supplies 2 args
' @diagnostics: generic-arity-mismatch@13
'
Namespace mod_demo

   Class TList<T>
      Public Count As Integer
   End Class

   Class TDemo
      Public Sub Run()
         Dim _bad As TList<Product, Customer>
      End Sub
   End Class

End Namespace
