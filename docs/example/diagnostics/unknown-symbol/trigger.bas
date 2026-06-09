' @example: diagnostics/unknown-symbol/trigger
' @demonstrates: reference to a symbol that does not exist in the scope
' @diagnostics: unknown-symbol@8
'
Namespace mod_test
   Class C
      Public Sub Run()
         Dim value As Integer = missingValue
      End Sub
   End Class
End Namespace
