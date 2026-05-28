' Forma nativa produzida pelo SugarTranspiler para o exemplo
' sugar/null-coalesce/01-dim-assignment. Multi-linha porque Data7 não tem
' função inline para esse caso; If/Then/Else/End If é a forma idiomática.
'
Namespace mod_demo
   Class TDemo
      Public Sub Run(pName As String)
         Dim nome As String
         If pName = NULL Then
            nome = "Anônimo"
         Else
            nome = pName
         End If
         Print nome
      End Sub
   End Class
End Namespace
