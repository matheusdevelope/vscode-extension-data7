' @example: diagnostics/inline-if-then/trigger
' @demonstrates: a sintaxe If Then inline não é recomendada
' @diagnostics: inline-if-then@7
'
Namespace mod_test_inline_if
   Class Test
      Public Sub Run(a As Integer)
         If a > 10 Then a = 10
      End Sub
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace
