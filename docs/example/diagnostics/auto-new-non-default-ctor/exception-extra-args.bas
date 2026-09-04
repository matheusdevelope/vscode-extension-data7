' @example: diagnostics/auto-new-non-default-ctor/exception-extra-args
' @demonstrates: New Exception(msg, inner) — Exception.Create só aceita uma String
' @diagnostics: auto-new-non-default-ctor@9
'
Namespace mod_exemplo
   Class TDemo
      Sub Run()
         Dim ex As Exception = New Exception("Erro ao executar ação")
         Throw New Exception("Erro ao executar ação: " & ex.Message, ex)
      End Sub
   End Class
End Namespace
