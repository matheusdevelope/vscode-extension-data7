' @example: diagnostics/call-parentheses-mismatch/trigger
' @demonstrates: missing parentheses for method call with multiple arguments
' @diagnostics: call-parentheses-mismatch@12
' @requires: linter implementation for call parentheses validation
'
Namespace mod_test
   Class C
      Public Sub Run(a As Integer, b As Integer)
      End Sub

      Public Sub Test()
         me.Run 1, 2
      End Sub
   End Class
End Namespace
