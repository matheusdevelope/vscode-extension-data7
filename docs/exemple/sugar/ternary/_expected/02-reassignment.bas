' Forma nativa produzida pelo SugarTranspiler para o exemplo
' sugar/ternary/02-reassignment. Sem `Dim` porque a variável já existe;
' só o bloco If/Then/Else é emitido.
'
Namespace mod_demo
   Class TDemo
      Public ativo As Boolean
      Public Sub Toggle(condicao As Boolean)
         If condicao Then
            ativo = True
         Else
            ativo = False
         End If
      End Sub
   End Class
End Namespace
