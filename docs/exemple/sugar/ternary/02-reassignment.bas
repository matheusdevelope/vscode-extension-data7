' @example: sugar/ternary/02-reassignment
' @demonstrates: ternário em reassignment (sem Dim) — só emite o If/Then/Else
' @diagnostics: none
' @transpiled-to: sugar/ternary/_expected/02-reassignment.bas
'
Namespace mod_demo
   Class TDemo
      Public ativo As Boolean
      Public Sub Toggle(condicao As Boolean)
         ativo = condicao ? True : False
      End Sub
   End Class
End Namespace
