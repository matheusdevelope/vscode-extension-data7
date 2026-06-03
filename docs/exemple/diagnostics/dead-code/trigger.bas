' @example: diagnostics/dead-code/trigger
' @demonstrates: dead code after return
' @diagnostics: dead-code@10
' @requires: linter implementation for dead code detection
'
Namespace mod_test
   Class C
      Public Sub Run()
         Return
         Dim x = 1
      End Sub
   End Class
End Namespace
