' @example: sugar/for-each/01-stringlist-explicit-type
' @demonstrates: For Each com tipo explícito sobre Collections.StringList
' @diagnostics: none
' @transpiled-to: sugar/for-each/_expected/01-stringlist-explicit-type.bas
'
Imports Collections

Namespace mod_demo
   Class TDemo
      Public Sub Run()
         Dim list As StringList
         For Each item As String In list
            ' iterate strings
         Next
      End Sub
   End Class
End Namespace
