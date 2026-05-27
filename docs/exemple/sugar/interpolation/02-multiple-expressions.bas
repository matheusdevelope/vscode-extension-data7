' @example: sugar/interpolation/02-multiple-expressions
' @demonstrates: $"..." com várias expressões — cada `{x}` vira `& (x) &`
' @diagnostics: none
' @transpiled-to: sugar/interpolation/_expected/02-multiple-expressions.bas
'
Namespace mod_demo
   Class TPessoa
      Public Nome As String
      Public Idade As Integer
      Public Sub Greet()
         Dim msg As String
         msg = $"Olá, {Nome}! Você tem {Idade} anos."
      End Sub
   End Class
End Namespace
