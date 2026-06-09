' @example: diagnostics/unknown-template/trigger
' @demonstrates: usage of TList<T> without the template declared in scope
' @diagnostics: unknown-template@9
'
Namespace mod_demo
   Class TDemo
      Public Sub Run()
         ' TMyCustomList<T> never declared in this file -- linter flags the usage.
         Dim _x As TMyCustomList<Product>
      End Sub
   End Class
End Namespace
