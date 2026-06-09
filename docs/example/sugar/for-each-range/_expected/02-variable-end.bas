' @example: sugar/for-each-range/_expected/02-variable-end
' @demonstrates: Forma nativa gerada pelo SugarTranspiler para sugar/for-each-range/02-variable-end
' @diagnostics: none
'
Namespace mod_demo
   Class TDemo
      Public Sub Run(count As Integer)
         For i = 0 To count - 1
            ' iteração 0 até count - 1 (intervalo half-open via expressão)
         Next
      End Sub
   End Class
End Namespace
