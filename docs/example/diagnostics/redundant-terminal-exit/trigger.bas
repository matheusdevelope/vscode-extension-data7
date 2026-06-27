' @example: diagnostics/redundant-terminal-exit/trigger
' @demonstrates: Exit Sub terminal redundante no fim exato da rotina
' @diagnostics: redundant-terminal-exit@9
'
Namespace mod_test
   Class Test
      Public Sub Run()
         Work()
         Exit Sub
      End Sub

      Private Sub Work()
      End Sub
   End Class
End Namespace
