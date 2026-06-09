' @example: sugar/interpolation/_expected/01-simple
' @demonstrates: Forma nativa gerada pelo SugarTranspiler para sugar/interpolation/01-simple
' @diagnostics: none
'
Namespace mod_demo
   Class TDemo
      Public Sub Run()
         Dim nome As String
         nome = "Mundo"
         Dim s As String
         s = "Olá, " & (nome) & "!"
      End Sub
   End Class
End Namespace
