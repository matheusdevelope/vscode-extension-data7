' @example: sugar/for-each-range/01-simple
' @demonstrates: For Each i In 0..10 — açúcar para o For clássico com limites numéricos
' @diagnostics: none
' @transpiled-to: sugar/for-each-range/_expected/01-simple.bas
'
Namespace mod_demo
   Class TDemo
      Public Sub Run()
         For Each i In 0..10
            ' iteração 0, 1, 2, ..., 10 (inclusivo)
         Next
      End Sub
   End Class
End Namespace
