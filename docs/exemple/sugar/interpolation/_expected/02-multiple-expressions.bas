' Forma nativa produzida pelo SugarTranspiler para o exemplo
' sugar/interpolation/02-multiple-expressions.
'
Namespace mod_demo
   Class TPessoa
      Public Nome As String
      Public Idade As Integer
      Public Sub Greet()
         Dim msg As String
         msg = "Olá, " & (Nome) & "! Você tem " & (Idade) & " anos."
      End Sub
   End Class
End Namespace
