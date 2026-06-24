' @example: diagnostics/object-creation-parentheses-missing/trigger
' @demonstrates: object creation missing empty constructor parentheses
' @diagnostics: object-creation-parentheses-missing@8
'
Namespace mod_test
   Class C
      Public Sub Build()
         Dim cmd As PowerCommand = New PowerCommand
      End Sub
   End Class

   Class PowerCommand
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace
