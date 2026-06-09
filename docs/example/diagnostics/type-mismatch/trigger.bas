' @example: diagnostics/type-mismatch/trigger
' @demonstrates: assigning incompatible types (e.g. a list to a single-item variable)
' @diagnostics: type-mismatch@15
' @requires: linter implementation for type mismatch
'
Imports Collections

Namespace mod_test
   Class C
      Inherits TObject

      Public Function GetItem() As String
         Dim items As StringList = New StringList()
         ' Assigning a StringList to a String variable is invalid.
         GetItem = items
         Return ""
      End Function
   End Class
End Namespace
