' @example: sugar/for-each/_expected/02-stringlist-implicit-type
' @demonstrates: Forma nativa gerada pelo SugarTranspiler para sugar/for-each/02-stringlist-implicit-type
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
            ' "item" é inferido como String porque Strings(i) retorna String
         Next
      End Sub
   End Class
End Namespace
