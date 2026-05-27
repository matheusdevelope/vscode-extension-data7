' Forma nativa produzida pelo SugarTranspiler para o exemplo
' sugar/for-each-range/02-variable-end. O `As Integer` explícito é
' aceito pelo açúcar mas não propagado para o `For` nativo (que tem
' variável de loop implicitamente tipada como Integer).
'
Namespace mod_demo
   Class TDemo
      Public Sub Run(count As Integer)
         For i = 0 To count - 1
            ' iteração 0 até count - 1 (intervalo half-open via expressão)
         Next
      End Sub
   End Class
End Namespace
