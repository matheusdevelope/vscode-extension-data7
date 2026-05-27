' Forma nativa produzida pelo SugarTranspiler para o exemplo
' sugar/ternary/01-dim-assignment. Multi-linha porque Data7 não tem
' função condicional inline (IIf/Choose); If/Then/Else/End If é a
' construção idiomática.
'
Namespace mod_demo
   Class TDemo
      Public Sub Run(saldo As Double)
         Dim status As String
         If saldo > 0 Then
            status = "positivo"
         Else
            status = "negativo"
         End If
         Print status
      End Sub
   End Class
End Namespace
