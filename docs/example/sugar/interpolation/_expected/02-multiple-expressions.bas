' @example: sugar/interpolation/_expected/02-multiple-expressions
' @demonstrates: Forma nativa gerada pelo SugarTranspiler para sugar/interpolation/02-multiple-expressions
' @diagnostics: none
'
Namespace mod_demo
   Class TPessoa
      Nome As String
      Idade As Integer
      Public Sub Greet()
         Dim msg As String
         msg = "Olá, " & (Nome) & "! Você tem " & (Idade).ToString() & " anos."
      End Sub
   End Class
End Namespace
