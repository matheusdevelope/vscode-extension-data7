' @example: diagnostics/missing-then/trigger
' @demonstrates: bloco If sem a palavra-chave Then
' @diagnostics: missing-then@4
'
Namespace mod_test
   Class Test
      Public Sub Run(a As Integer)
         If a > 10
            a = a + 1
         End If
      End Sub
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace
