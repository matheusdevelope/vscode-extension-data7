' @example: sugar/coalesce-assign/_expected/01-simple
' @demonstrates: Forma nativa gerada pelo SugarTranspiler para sugar/coalesce-assign/01-simple
' @diagnostics: none
'
Imports mod_logger
Namespace mod_demo
   Class TDemo
      Public Sub Apply(pConfig As String)
         If pConfig = NULL Then
            pConfig = "default"
         End If
         mod_logger.Printe(pConfig)
      End Sub
   End Class
End Namespace
