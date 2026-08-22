' @example: diagnostics/duplicate-declaration/03-overload-return-mismatch
' @demonstrates: overload com parâmetros e tipos de retorno distintos é válido (padrão TTList First/Last)
' @diagnostics: none
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
