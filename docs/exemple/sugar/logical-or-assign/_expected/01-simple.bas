' Forma nativa produzida pelo SugarTranspiler para o exemplo
' sugar/logical-or-assign/01-simple.
'
Namespace mod_demo
   Class TDemo
      Public Sub Apply(pAtivo As Boolean)
         If Not pAtivo Then
            pAtivo = True
         End If
         Print pAtivo
      End Sub
   End Class
End Namespace
