' @example: sugar/null-coalesce/_expected/01-dim-assignment
' @demonstrates: Forma nativa gerada pelo SugarTranspiler para sugar/null-coalesce/01-dim-assignment
' @diagnostics: none
'
Imports mod_logger
Namespace mod_demo
   Class TDemo
      Public Sub Run(pName As String)
         Dim nome As String
         If pName = NULL Then
            nome = "Anônimo"
         Else
            nome = pName
         End If
         mod_logger.Printe(nome)
      End Sub
   End Class
End Namespace
