' @example: diagnostics/invalid-assignment-target/trigger
' @demonstrates: assigning to another function name
' @diagnostics: invalid-assignment-target@13
' @requires: linter implementation for invalid assignment target
'
Namespace mod_test
   Class C
      Public Function Other() As Integer
         Return 1
      End Function

      Public Function Compute() As Integer
         Other = 2
         Return 1
      End Function
   End Class
End Namespace
