' @example: diagnostics/loose-type-statement/trigger
' @demonstrates: loose type statement
' @diagnostics: loose-type-statement@8
' @requires: linter implementation for loose types
'
Namespace mod_test
   Class C
      Public Sub Run()
         Integer
      End Sub
   End Class
End Namespace
