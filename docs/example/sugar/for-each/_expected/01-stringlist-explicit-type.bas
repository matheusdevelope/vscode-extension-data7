' @example: sugar/for-each/_expected/01-stringlist-explicit-type
' @demonstrates: Forma nativa gerada pelo SugarTranspiler para sugar/for-each/01-stringlist-explicit-type
' @diagnostics: none
'
Imports Collections
Namespace mod_demo
   Class TDemo
      Public Sub Run()
         Dim list As StringList
         Dim __idx0 As Integer
         For __idx0 = 0 To list.Count - 1
            Dim item As String = list.Strings(__idx0)
            ' iterate strings
         Next
      End Sub
   End Class
End Namespace
