' Forma nativa produzida pelo SugarTranspiler para o exemplo
' sugar/logical-and-assign/01-simple.
'
Namespace mod_demo
   Class TDemo
      Public Sub Apply(pAtivo As Boolean)
         If pAtivo Then
            pAtivo = False
         End If
         Print pAtivo
      End Sub
   End Class
End Namespace
