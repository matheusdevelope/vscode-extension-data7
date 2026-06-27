' @example: diagnostics/chained-global-function-assignment/trigger
' @demonstrates: assignment from a member chain rooted at a global function
' @diagnostics: chained-global-function-assignment@20
' @requires: linter implementation for chained global function assignment detection
'
Namespace mod_test
   Function CreateItem() As TItem
      CreateItem = Nothing
   End Function

   Class TItem
      Public Function Name() As String
         Name = ""
      End Function
   End Class

   Class C
      Public Sub Run()
         Dim value As String
         value = CreateItem().Name()
      End Sub
   End Class
End Namespace
