' @example: diagnostics/shared-return-assignment-in-try/trigger
' @demonstrates: Shared Function atribui ao próprio nome dentro de Try — bug do compilador nativo
' @diagnostics: shared-return-assignment-in-try@9
'
Namespace mod_exemplo
   Class TSql
      Private Shared Function ExecSqlWithTx(pValue As Integer) As Integer
         Try
            ExecSqlWithTx = pValue
         Catch ex As Exception
            Throw New Exception(ex.Message)
         End Try
      End Function
   End Class
End Namespace
