' @example: diagnostics/duplicate-declaration/03-overload-return-mismatch
' @demonstrates: overload com parâmetros diferentes mas tipos de retorno distintos
' @diagnostics: duplicate-declaration@12
'

Namespace mod_dup_return
   Class C
      Function Get(p As Integer) As Integer
         Get = p
      End Function

      Function Get(p As String) As String
         Get = p
      End Function
   End Class
End Namespace
