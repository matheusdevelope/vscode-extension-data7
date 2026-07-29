' @example: diagnostics/unreachable-declaration/trigger
' @demonstrates: codigo apos Return e inalcancavel
' @diagnostics: unreachable-declaration@10
'
Namespace mod_test
   Class C
      Public Sub Run()
         Return
         Dim x = 1
      End Sub
   End Class
End Namespace
