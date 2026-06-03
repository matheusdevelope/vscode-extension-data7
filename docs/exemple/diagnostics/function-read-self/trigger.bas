' @example: diagnostics/function-read-self/trigger
' @demonstrates: reading from function name inside its own body
' @diagnostics: function-read-self@10
' @requires: linter implementation for function self read detection
'
Namespace mod_test
   Class C
      Public Function Compute() As Integer
         Dim x As Integer = Compute
         Return x
      End Function
   End Class
End Namespace
