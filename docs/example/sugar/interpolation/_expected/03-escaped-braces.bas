' @example: sugar/interpolation/_expected/03-escaped-braces
' @demonstrates: Forma nativa gerada pelo SugarTranspiler para sugar/interpolation/03-escaped-braces
' @diagnostics: none
'
Namespace mod_demo
   Class TDemo
      Public Sub Run()
         Dim v As Integer
         v = 42
         Dim json As String
         json = "{ ""value"": " & (v).ToString() & " }"
      End Sub
   End Class
End Namespace
