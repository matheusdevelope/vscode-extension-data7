' @example: sugar/for-each/05-method-call-operand
' @demonstrates: For Each sobre expressão complexa (chamada de método) — exige materialização em variável local antes
' @diagnostics: not-enumerable@10
'
Imports Collections

Namespace mod_demo
   Class TDemo
      Public Sub Run()
         For Each item As String In Me.GetList()
            ' O transpilador exige que o operando do "In" seja um identificador simples.
            ' Para chamadas/acessos diretos, materialize antes do loop:
            '
            '    Dim tmp = Me.GetList()                ' tipo inferido (StringList)
            '    For Each item As String In tmp
            '       ...
            '    Next
            '
            ' A inferência via TypeResolver.inferExpressionType cobre `Dim x = Me.Method()`,
            ' `Dim x = New T(...)` e `Dim x = OutraVar`. Operandos in-line ficam fora porque
            ' o transpilador opera sobre texto, sem indexador.
         Next
      End Sub
      Public Function GetList() As StringList
         Dim list As StringList
         GetList = list
      End Function
   End Class
End Namespace
