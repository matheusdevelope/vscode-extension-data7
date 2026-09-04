' @example: diagnostics/duplicate-declaration/04-generic-method-overload
' @demonstrates: instance Exists(pWhere) and Shared Exists<T As TTable>(pWhere) are distinct overloads
' @diagnostics: none
'

Namespace mod_dup_generic_overload
   Class TTable
      Function Exists(pWhere As String) As Boolean
         Exists = True
      End Function

      Shared Function Exists<T As TTable>(pWhere As String) As Boolean
         Exists = True
      End Function
   End Class
End Namespace
