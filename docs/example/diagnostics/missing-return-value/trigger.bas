' @example: diagnostics/missing-return-value/trigger
' @demonstrates: function missing return value
' @diagnostics: missing-return-value@7
' @requires: linter implementation for control flow analysis
'
Namespace mod_test
   Class C
      Public Function Compute() As Integer
         Dim x = 1
      End Function
   End Class
End Namespace
