' @example: sugar/logical-and-assign/01-simple
' @demonstrates: &&= compound assignment — vira If x Then x = y
' @diagnostics: none
' @transpiled-to: sugar/logical-and-assign/_expected/01-simple.bas
'
Namespace mod_demo
   Class TDemo
      Public Sub Apply(pAtivo As Boolean)
         pAtivo &&= False
         Print pAtivo
      End Sub
   End Class
End Namespace
