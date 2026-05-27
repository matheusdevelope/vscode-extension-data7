' @example: sugar/interpolation/03-escaped-braces
' @demonstrates: chaves literais via `{{` e `}}` — preservadas como `{` e `}` no output
' @diagnostics: none
' @transpiled-to: sugar/interpolation/_expected/03-escaped-braces.bas
'
Namespace mod_demo
   Class TDemo
      Public Sub Run()
         Dim v As Integer
         v = 42
         Dim json As String
         json = $"{{ ""value"": {v} }}"
      End Sub
   End Class
End Namespace
