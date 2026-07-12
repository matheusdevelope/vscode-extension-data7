' @example: diagnostics/circular-import/trigger
' @demonstrates: um namespace importando a si mesmo, ou uma referência circular direta/indireta
' @diagnostics: circular-import@5

Imports mod_self

Namespace mod_self
   Class C
      Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace
