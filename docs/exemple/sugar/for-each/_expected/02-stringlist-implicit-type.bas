' Forma nativa produzida pelo SugarTranspiler para o exemplo
' sugar/for-each/02-stringlist-implicit-type.
'
Imports Collections

Namespace mod_demo
   Class TDemo
      Public Sub Run()
         Dim list As StringList
         For __idx0 = 0 To list.Count - 1
            Dim item As String = list.Strings(__idx0)
            ' "item" é inferido como String porque Strings(i) retorna String
         Next
      End Sub
   End Class
End Namespace
