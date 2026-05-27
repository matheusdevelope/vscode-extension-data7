' Forma nativa produzida pelo SugarTranspiler para o exemplo
' sugar/for-each/01-stringlist-explicit-type. NÃO é compilado pelo Builder
' (não vive em src/), serve apenas como referência da expansão esperada.
'
Imports Collections

Namespace mod_demo
   Class TDemo
      Public Sub Run()
         Dim list As StringList
         For __idx0 = 0 To list.Count - 1
            Dim item As String = list.Strings(__idx0)
            ' iterate strings
         Next
      End Sub
   End Class
End Namespace
