' @example: diagnostics/duplicate-declaration/trigger
' @demonstrates: declaração de duas variáveis locais com o mesmo nome no mesmo método
' @diagnostics: duplicate-declaration@7
'

Namespace mod_dup_trigger
   Class C
      Public Sub Run()
         Dim x As Integer
         Dim x As String
      End Sub
   End Class
End Namespace
