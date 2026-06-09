' @example: sugar/coalesce-assign/01-simple
' @demonstrates: ??= compound assignment — vira If x = NULL Then x = y
' @diagnostics: none
' @transpiled-to: sugar/coalesce-assign/_expected/01-simple.bas
'
Namespace mod_demo
   Class TDemo
      Public Sub Apply(pConfig As String)
         pConfig ??= "default"
         Print pConfig
      End Sub
   End Class
End Namespace
