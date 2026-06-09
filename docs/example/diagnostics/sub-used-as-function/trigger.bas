' @example: diagnostics/sub-used-as-function/trigger
' @demonstrates: using a Sub procedure as a function in an expression context
' @diagnostics: sub-used-as-function@12
'
Namespace mod_test
   Class C
      Public Sub DoWork()
      End Sub

      Public Sub Run()
         Dim result As Integer = DoWork()
      End Sub
   End Class
End Namespace
