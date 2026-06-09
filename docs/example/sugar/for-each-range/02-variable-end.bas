' @example: sugar/for-each-range/02-variable-end
' @demonstrates: range com expressão variável no limite final (`count - 1`)
' @diagnostics: none
' @transpiled-to: sugar/for-each-range/_expected/02-variable-end.bas
'
Namespace mod_demo
   Class TDemo
      Public Sub Run(count As Integer)
         For Each i As Integer In 0..count - 1
            ' iteração 0 até count - 1 (intervalo half-open via expressão)
         Next
      End Sub
   End Class
End Namespace
