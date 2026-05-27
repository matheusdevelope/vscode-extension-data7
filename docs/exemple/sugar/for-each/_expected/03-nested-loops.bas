' Forma nativa produzida pelo SugarTranspiler para o exemplo
' sugar/for-each/03-nested-loops.
'
Imports Collections

Namespace mod_demo
   Class TDemo
      Public Sub Run()
         Dim outer As StringList
         Dim inner As StringList
         For __idx0 = 0 To outer.Count - 1
            Dim name As String = outer.Strings(__idx0)
            For __idx1 = 0 To inner.Count - 1
               Dim tag As String = inner.Strings(__idx1)
               ' acessa name e tag
            Next
         Next
      End Sub
   End Class
End Namespace
