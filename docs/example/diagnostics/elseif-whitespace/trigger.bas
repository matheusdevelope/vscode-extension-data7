' @example: diagnostics/elseif-whitespace/trigger
' @demonstrates: uso de Else If com espaço, rejeitado pelo compilador em favor de ElseIf
' @diagnostics: elseif-whitespace@5
'
Namespace mod_test
   Class Test
      Public Sub Run(a As Integer)
         If a > 10 Then
         Else If a > 5 Then
         End If
      End Sub
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace
