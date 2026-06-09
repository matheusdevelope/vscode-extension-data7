' @example: sugar/numeric-separator/01-simple
' @demonstrates: numeric separator `_` em literais — removido na expansão
' @diagnostics: none
' @transpiled-to: sugar/numeric-separator/_expected/01-simple.bas
'
Namespace mod_demo
   Class TDemo
      Public Sub Run()
         Dim populacao As Long = 7_900_000_000
         Dim pi As Double = 3.14_15
         Print populacao
      End Sub
   End Class
End Namespace
