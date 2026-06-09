' @example: sugar/logical-or-assign/01-simple
' @demonstrates: ||= compound assignment — vira If Not x Then x = y
' @diagnostics: none
' @transpiled-to: sugar/logical-or-assign/_expected/01-simple.bas
'
Namespace mod_demo
   Class TDemo
      Public Sub Apply(pAtivo As Boolean)
         pAtivo ||= True
         Print pAtivo
      End Sub
   End Class
End Namespace
