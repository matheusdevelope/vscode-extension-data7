' @example: sugar/return-if/01-basic
' @demonstrates: Return If cond Then a Else b expandido para If/Then/Return
' @diagnostics: none
'
Namespace mod_demo
   Class TDemo
      Public Function Validate(pValor As Integer) As String
         Return If pValor > 0 Then "positivo" Else "nao-positivo"
      End Function
   End Class
End Namespace
