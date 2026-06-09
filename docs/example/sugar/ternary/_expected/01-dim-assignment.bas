' @example: sugar/ternary/_expected/01-dim-assignment
' @demonstrates: Forma nativa gerada pelo SugarTranspiler para sugar/ternary/01-dim-assignment
' @diagnostics: none
'
Imports mod_logger
Namespace mod_demo
   Class TDemo
      Public Sub Run(saldo As Double)
         Dim status As String
         If saldo > 0 Then
            status = "positivo"
         Else
            status = "negativo"
         End If
         mod_logger.Printe(status)
      End Sub
   End Class
End Namespace
