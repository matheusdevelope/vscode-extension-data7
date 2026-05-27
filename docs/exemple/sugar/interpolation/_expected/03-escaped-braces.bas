' Forma nativa produzida pelo SugarTranspiler para o exemplo
' sugar/interpolation/03-escaped-braces. As chaves duplas (`{{`/`}}`)
' viram literais `{` e `}` no Basic.
'
Namespace mod_demo
   Class TDemo
      Public Sub Run()
         Dim v As Integer
         v = 42
         Dim json As String
         json = "{ ""value"": " & (v) & " }"
      End Sub
   End Class
End Namespace
