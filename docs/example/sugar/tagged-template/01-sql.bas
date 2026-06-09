' @example: sugar/tagged-template/01-sql
' @demonstrates: tagged template sql$"..." — vira sql.Build("...", expr, ...)
' @diagnostics: none
'
Namespace mod_demo
   Class TDemo
      Public Sub Run(pTabela As String)
         Dim cmd As String = sql$"SELECT * FROM {pTabela} WHERE ativo = 1"
         Print cmd
      End Sub
   End Class
End Namespace
