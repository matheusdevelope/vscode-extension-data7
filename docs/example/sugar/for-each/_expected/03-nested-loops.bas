' @example: sugar/for-each/_expected/03-nested-loops
' @demonstrates: Forma nativa gerada pelo SugarTranspiler para sugar/for-each/03-nested-loops
' @diagnostics: none
'
Imports Collections
Namespace mod_demo
   Class TDemo
      Public Sub Run()
         Dim outer As StringList
         Dim inner As StringList
         Dim __idx0 As Integer
         For __idx0 = 0 To outer.Count - 1
            Dim name As String = outer.Strings(__idx0)
            Dim __idx1 As Integer
            For __idx1 = 0 To inner.Count - 1
               Dim tag As String = inner.Strings(__idx1)
               ' acessa name e tag
            Next
         Next
      End Sub
   End Class
End Namespace
