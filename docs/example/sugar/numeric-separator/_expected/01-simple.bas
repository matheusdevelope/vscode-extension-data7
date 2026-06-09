' @example: sugar/numeric-separator/_expected/01-simple
' @demonstrates: Forma nativa gerada pelo SugarTranspiler para sugar/numeric-separator/01-simple
' @diagnostics: none
'
Imports mod_logger
Namespace mod_demo
   Class TDemo
      Public Sub Run()
         Dim populacao As Long = 7900000000
         Dim pi As Double = 3.1415
         mod_logger.Printe(populacao)
      End Sub
   End Class
End Namespace
