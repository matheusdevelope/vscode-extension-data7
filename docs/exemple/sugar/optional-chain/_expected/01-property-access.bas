' Forma nativa produzida pelo SugarTranspiler para o exemplo
' sugar/optional-chain/01-property-access.
'
Namespace mod_demo
   Class TDemo
      Public Sub Run(pObj As TPessoa)
         Dim nome As String
         If pObj <> NULL Then
            nome = pObj.Nome
         End If
         Print nome
      End Sub
   End Class
End Namespace
