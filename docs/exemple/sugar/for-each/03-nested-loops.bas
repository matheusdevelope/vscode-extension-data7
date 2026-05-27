' @example: sugar/for-each/03-nested-loops
' @demonstrates: For Each aninhado — contadores __idx0 e __idx1 não colidem
' @diagnostics: none
' @transpiled-to: sugar/for-each/_expected/03-nested-loops.bas
'
Imports Collections

Namespace mod_demo
   Class TDemo
      Public Sub Run()
         Dim outer As StringList
         Dim inner As StringList
         For Each name As String In outer
            For Each tag As String In inner
               ' acessa name e tag
            Next
         Next
      End Sub
   End Class
End Namespace
