' @example: sugar/ternary/01-dim-assignment
' @demonstrates: ternário no RHS de Dim — expandido para If/Then/Else multi-linha
' @diagnostics: none
' @transpiled-to: sugar/ternary/_expected/01-dim-assignment.bas
'
Namespace mod_demo
   Class TDemo
      Public Sub Run(saldo As Double)
         Dim status As String = saldo > 0 ? "positivo" : "negativo"
         Print status
      End Sub
   End Class
End Namespace
