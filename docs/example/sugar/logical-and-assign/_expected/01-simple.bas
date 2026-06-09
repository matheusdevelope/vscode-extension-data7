' @example: sugar/logical-and-assign/_expected/01-simple
' @demonstrates: Forma nativa gerada pelo SugarTranspiler para sugar/logical-and-assign/01-simple
' @diagnostics: none
'
Imports mod_logger
Namespace mod_demo
   Class TDemo
      Public Sub Apply(pAtivo As Boolean)
         If pAtivo Then
            pAtivo = False
         End If
         mod_logger.Printe(pAtivo)
      End Sub
   End Class
End Namespace
