' @example: sugar/interpolation/04-invalid-empty-expression
' @demonstrates: $"...{}..." sem expressão dentro das chaves — emite invalid-interpolation
' @diagnostics: invalid-interpolation@9
'
Namespace mod_demo
   Class TDemo
      Public Sub Run()
         Dim s As String
         s = $"oops {} aqui"
      End Sub
   End Class
End Namespace
